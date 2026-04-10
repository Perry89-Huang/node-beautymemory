// routes/benchmarks.js
// 同齡比較 (Peer Benchmarking) API
// 使用與其他路由相同的 graphqlRequest（已確認可用），不依賴 run_sql

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const { nhost } = require('../config/nhost');
const { authenticateToken } = require('../middleware/auth');

// ─── GraphQL 請求（與 analysis.js / members.js 相同做法）────────────────────
async function graphqlRequest(query, variables = {}) {
  const response = await axios.post(
    nhost.graphql.url,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      },
      timeout: 12000
    }
  );
  if (response.data.errors) {
    const err = new Error(response.data.errors[0].message);
    err.errors = response.data.errors;
    throw err;
  }
  return response.data.data;
}

// ─── 常數 ────────────────────────────────────────────────────────────────────
const UUID_REGEX      = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_GENDERS = ['female', 'male', 'other'];
const MIN_SAMPLE      = 10;   // 低於此樣本數 → 顯示「資料蒐集中」
const AGE_GROUP_SPAN  = 5;    // 年齡分組寬度（歲）

const METRIC_LABELS = {
  overall:     '整體膚況',
  moisture:    '保濕度',
  oil:         '油脂平衡',
  wrinkle:     '抗老表現',
  pigment:     '均勻度',
  sensitivity: '敏感度',
  acne:        '痘痘狀況'
};

// ─── 輔助函式 ─────────────────────────────────────────────────────────────────

// 出生年份 → 年齡
function birthYearToAge(year) {
  return new Date().getFullYear() - year;
}

// 年齡分組 → 出生年份範圍
// 例：age_group_start = 35  →  born between (currentYear-39) and (currentYear-35)
function ageGroupToBirthYearRange(ageGroupStart) {
  const currentYear = new Date().getFullYear();
  const minBirthYear = currentYear - (ageGroupStart + AGE_GROUP_SPAN - 1);
  const maxBirthYear = currentYear - ageGroupStart;
  return {
    minBirthDate: `${minBirthYear}-01-01`,
    maxBirthDate: `${maxBirthYear}-12-31`
  };
}

// 從 birth_date 計算年齡與分組
function calcAgeGroup(birthDateStr) {
  const birth = new Date(birthDateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age--;
  const ageGroupStart = Math.floor(age / AGE_GROUP_SPAN) * AGE_GROUP_SPAN;
  return { age, ageGroupStart };
}

// 「前 X%」= 100 - percent_rank
// percent_rank = belowCount / (total - 1)
function computeTopPercent(belowCount, total) {
  if (total <= 1) return 50;
  return Math.max(1, Math.round(100 - (belowCount / (total - 1)) * 100));
}

function rankLabel(topPct) {
  if (topPct <= 10) return { label: '頂尖', level: 'excellent' };
  if (topPct <= 25) return { label: '優秀', level: 'good' };
  if (topPct <= 50) return { label: '良好', level: 'average' };
  if (topPct <= 75) return { label: '一般', level: 'below_average' };
  return { label: '有進步空間', level: 'needs_improvement' };
}

function buildSummary(overallMetric, groupLabel) {
  const { topPercent } = overallMetric;
  const beaten = 100 - topPercent;
  if (topPercent <= 25)
    return `在${groupLabel}中，妳的整體膚況名列前茅（前 ${topPercent}%），超越了 ${beaten}% 的同齡人！`;
  if (topPercent <= 50)
    return `在${groupLabel}中，妳的整體膚況高於平均水準（前 ${topPercent}%），繼續保持！`;
  return `在${groupLabel}中，妳的整體膚況排名前 ${topPercent}%，持續保養可以提升排名。`;
}

// ─── 計算同齡群組統計（純 JS，從 GraphQL 拿到的 records 陣列）──────────────
// records: [{ overall_score, score_moisture, ... }, ...]
// userScores: { overall, moisture, oil, wrinkle, pigment, sensitivity, acne }
function computeStats(records, userScores) {
  const METRIC_KEYS = ['overall', 'moisture', 'oil', 'wrinkle', 'pigment', 'sensitivity', 'acne'];
  const DB_FIELD = {
    overall:     'overall_score',
    moisture:    'score_moisture',
    oil:         'score_oil',
    wrinkle:     'score_wrinkle',
    pigment:     'score_pigment',
    sensitivity: 'score_sensitivity',
    acne:        'score_acne'
  };

  const total = records.length;
  const metrics = {};

  for (const key of METRIC_KEYS) {
    const field     = DB_FIELD[key];
    const validRecs = records.filter(r => r[field] != null);
    const avg       = validRecs.length
      ? Math.round(validRecs.reduce((s, r) => s + r[field], 0) / validRecs.length)
      : null;
    const userScore = userScores[key];
    const below     = records.filter(r => r[field] != null && r[field] < userScore).length;
    const topPct    = computeTopPercent(below, total);

    metrics[key] = {
      label:        METRIC_LABELS[key],
      userScore,
      peerAvg:      avg,
      topPercent:   topPct,
      aboveAverage: avg !== null ? userScore > avg : null,
      ...rankLabel(topPct)
    };
  }

  return { total, metrics };
}

// ─── GraphQL: 取用戶 profile + 最新分析記錄 ──────────────────────────────────
async function fetchUserInfo(userId) {
  const data = await graphqlRequest(`
    query GetUserForBenchmark($userId: uuid!) {
      user_profiles(where: { user_id: { _eq: $userId } }) {
        birth_date
        gender
      }
      skin_analysis_records(
        where: { user_id: { _eq: $userId } }
        order_by: { created_at: desc }
        limit: 1
      ) {
        overall_score
        score_moisture
        score_oil
        score_wrinkle
        score_pigment
        score_sensitivity
        score_acne
      }
    }
  `, { userId });

  const profile = data.user_profiles?.[0] ?? null;
  const record  = data.skin_analysis_records?.[0] ?? null;
  return { profile, record };
}

// ─── GraphQL: 取同齡同性別（或全年齡）同群的最新記錄 ─────────────────────────
// 兩步查詢：
//   Step 1 - 從 user_profiles 取符合 birth_date/gender 的 user_id 清單
//   Step 2 - 從 skin_analysis_records 取這些人近 30 天的最新一筆
async function fetchPeerRecords(minBirthDate, maxBirthDate, safeGender) {
  // Step 1: 取符合條件的 user_id 清單
  const profileWhere = [];
  const profileVars  = {};

  if (minBirthDate && maxBirthDate) {
    profileWhere.push('birth_date: { _gte: $minBirthDate, _lte: $maxBirthDate }');
    profileVars.minBirthDate = minBirthDate;
    profileVars.maxBirthDate = maxBirthDate;
  } else {
    profileWhere.push('birth_date: { _is_null: false }');
  }

  if (safeGender) {
    profileWhere.push('gender: { _eq: $gender }');
    profileVars.gender = safeGender;
  }

  const profileQuery = `
    query GetPeerUserIds(
      $minBirthDate: date
      $maxBirthDate: date
      $gender: String
    ) {
      user_profiles(
        where: { ${profileWhere.join(', ')} }
      ) {
        user_id
      }
    }
  `;

  const profileData = await graphqlRequest(profileQuery, profileVars);
  const userIds = (profileData.user_profiles ?? []).map(p => p.user_id);

  if (userIds.length === 0) return [];

  // Step 2: 取這些人近 30 天的分析記錄（每人保留最新一筆）
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const recordData = await graphqlRequest(`
    query GetPeerScores($userIds: [uuid!]!, $since: timestamptz!) {
      skin_analysis_records(
        where: {
          user_id: { _in: $userIds }
          created_at: { _gte: $since }
        }
        order_by: { user_id: asc, created_at: desc }
      ) {
        user_id
        overall_score
        score_moisture
        score_oil
        score_wrinkle
        score_pigment
        score_sensitivity
        score_acne
      }
    }
  `, { userIds, since: thirtyDaysAgo });

  const rawRecords = recordData.skin_analysis_records ?? [];

  // 每位用戶只保留最新一筆（已按 user_id asc, created_at desc 排序）
  const seen = new Set();
  return rawRecords.filter(r => {
    if (seen.has(r.user_id)) return false;
    seen.add(r.user_id);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/benchmarks/peer-comparison
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/peer-comparison', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!UUID_REGEX.test(userId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_USER', message: '無效的用戶 ID' }
      });
    }

    // 1. 取用戶 profile + 最新分析
    const { profile, record } = await fetchUserInfo(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: '找不到用戶資料' }
      });
    }

    // 尚未進行任何分析
    if (!record) {
      return res.json({
        success: true,
        data: { hasAnalysis: false, message: '請先完成肌膚分析，即可解鎖同齡比較功能' }
      });
    }

    // 尚未填寫生日
    if (!profile.birth_date) {
      return res.json({
        success: true,
        data: {
          hasBirthDate: false,
          message: '請填寫生日，即可解鎖同齡比較功能',
          userScores: extractScores(record)
        }
      });
    }

    // 2. 計算年齡分組
    const safeGender = ALLOWED_GENDERS.includes(profile.gender) ? profile.gender : null;
    const { age, ageGroupStart } = calcAgeGroup(profile.birth_date);
    const { minBirthDate, maxBirthDate } = ageGroupToBirthYearRange(ageGroupStart);

    const userScores = {
      overall:     Math.round(record.overall_score     ?? 50),
      moisture:    Math.round(record.score_moisture    ?? 50),
      oil:         Math.round(record.score_oil         ?? 50),
      wrinkle:     Math.round(record.score_wrinkle     ?? 50),
      pigment:     Math.round(record.score_pigment     ?? 50),
      sensitivity: Math.round(record.score_sensitivity ?? 50),
      acne:        Math.round(record.score_acne        ?? 50)
    };

    const genderLabel = safeGender === 'female' ? '女性'
                      : safeGender === 'male'   ? '男性'
                      : '';

    // 3. 主要群：同年齡層 + 同性別
    let peers = await fetchPeerRecords(minBirthDate, maxBirthDate, safeGender);
    let groupScope = 'primary';
    let groupLabel = `${ageGroupStart}-${ageGroupStart + AGE_GROUP_SPAN - 1} 歲${genderLabel}`;

    // 4. 冷啟動降級：樣本不足 → 全年齡層
    if (peers.length < MIN_SAMPLE) {
      const allPeers = await fetchPeerRecords(null, null, safeGender);
      if (allPeers.length >= MIN_SAMPLE) {
        peers      = allPeers;
        groupScope = 'all_ages';
        groupLabel = genderLabel ? `所有年齡層${genderLabel}` : '所有用戶';
      } else {
        return res.json({
          success: true,
          data: {
            insufficientData: true,
            message: '同齡比較資料蒐集中，敬請期待 ✨',
            userScores
          }
        });
      }
    }

    // 5. 計算統計
    const { total, metrics } = computeStats(peers, userScores);

    res.json({
      success: true,
      data: {
        hasAnalysis:  true,
        hasBirthDate: true,
        groupScope,
        groupLabel,
        peerCount:    total,
        userAge:      age,
        userGender:   safeGender,
        metrics,
        summary: {
          ...metrics.overall,
          description: buildSummary(metrics.overall, groupLabel)
        },
        dataNote: '基於近 30 天分析記錄，每位用戶取最新一筆'
      }
    });

  } catch (error) {
    console.error('[benchmarks] peer-comparison 錯誤:', error.message);
    if (error.errors) console.error('GraphQL errors:', JSON.stringify(error.errors));
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: '同齡比較查詢失敗' }
    });
  }
});

function extractScores(record) {
  if (!record) return {};
  return {
    overall:     record.overall_score     != null ? Math.round(record.overall_score)     : null,
    moisture:    record.score_moisture    != null ? Math.round(record.score_moisture)    : null,
    oil:         record.score_oil         != null ? Math.round(record.score_oil)         : null,
    wrinkle:     record.score_wrinkle     != null ? Math.round(record.score_wrinkle)     : null,
    pigment:     record.score_pigment     != null ? Math.round(record.score_pigment)     : null,
    sensitivity: record.score_sensitivity != null ? Math.round(record.score_sensitivity) : null,
    acne:        record.score_acne        != null ? Math.round(record.score_acne)        : null
  };
}

module.exports = router;
