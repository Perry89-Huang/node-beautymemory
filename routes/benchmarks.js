// routes/benchmarks.js
// 同齡比較 (Peer Benchmarking) API

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken } = require('../middleware/auth');

const NHOST_SUBDOMAIN = process.env.NHOST_SUBDOMAIN;
const NHOST_REGION = process.env.NHOST_REGION || 'ap-southeast-1';

// ─── 簡易記憶體快取（群體平均值，6 小時 TTL）───────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { cache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

// ─── Hasura run_sql 執行器 ────────────────────────────────────────────────
async function runSQL(sql) {
  const response = await axios.post(
    `https://${NHOST_SUBDOMAIN}.hasura.${NHOST_REGION}.nhost.run/v2/query`,
    { type: 'run_sql', args: { sql, read_only: true } },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      },
      timeout: 12000
    }
  );
  return response.data;
}

// 將 Hasura run_sql 的陣列結果轉成物件陣列
function parseSQL(result) {
  if (!result || !result.result || result.result.length < 2) return [];
  const headers = result.result[0];
  return result.result.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      const v = row[i];
      obj[h] = (v !== null && !isNaN(v)) ? Number(v) : v;
    });
    return obj;
  });
}

// ─── 輔助：計算「前 X%」─────────────────────────────────────────────────
// percent_rank = (低於用戶分數的人數) / (總人數 - 1)
// 「前 X%」= 100 - percent_rank * 100，代表用戶打敗了 (100 - X)% 的人
function computeTopPercent(belowCount, total) {
  if (total <= 1) return 50; // 只有自己，給中位值
  return Math.max(1, Math.round(100 - (belowCount / (total - 1)) * 100));
}

function rankLabel(topPct) {
  if (topPct <= 10) return { label: '頂尖', level: 'excellent' };
  if (topPct <= 25) return { label: '優秀', level: 'good' };
  if (topPct <= 50) return { label: '良好', level: 'average' };
  if (topPct <= 75) return { label: '一般', level: 'below_average' };
  return { label: '有進步空間', level: 'needs_improvement' };
}

const METRIC_LABELS = {
  overall:     '整體膚況',
  moisture:    '保濕度',
  oil:         '油脂平衡',
  wrinkle:     '抗老表現',
  pigment:     '均勻度',
  sensitivity: '敏感度',
  acne:        '痘痘狀況'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_GENDERS = ['female', 'male', 'other'];
const MIN_SAMPLE = 10; // 低於此人數回傳資料蒐集中

// ─── 建立同齡比較 SQL ────────────────────────────────────────────────────
// 所有動態值皆來自 DB 查詢結果（整數）或白名單字串，非用戶輸入，SQL 安全
function buildComparisonSQL(scores, genderClause, ageClause) {
  const s = scores;
  return `
    WITH latest_per_user AS (
      SELECT DISTINCT ON (r.user_id)
        r.overall_score,
        r.score_moisture,
        r.score_oil,
        r.score_wrinkle,
        r.score_pigment,
        r.score_sensitivity,
        r.score_acne
      FROM skin_analysis_records r
      INNER JOIN user_profiles p ON r.user_id = p.user_id
      WHERE
        p.birth_date IS NOT NULL
        ${genderClause}
        ${ageClause}
        AND r.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY r.user_id, r.created_at DESC
    )
    SELECT
      COUNT(*)::int                                                              AS total,
      ROUND(AVG(overall_score))::int                                             AS avg_overall,
      ROUND(AVG(score_moisture))::int                                            AS avg_moisture,
      ROUND(AVG(score_oil))::int                                                 AS avg_oil,
      ROUND(AVG(score_wrinkle))::int                                             AS avg_wrinkle,
      ROUND(AVG(score_pigment))::int                                             AS avg_pigment,
      ROUND(AVG(score_sensitivity))::int                                         AS avg_sensitivity,
      ROUND(AVG(score_acne))::int                                                AS avg_acne,
      SUM(CASE WHEN overall_score     < ${s.overall}     THEN 1 ELSE 0 END)::int AS below_overall,
      SUM(CASE WHEN score_moisture    < ${s.moisture}    THEN 1 ELSE 0 END)::int AS below_moisture,
      SUM(CASE WHEN score_oil         < ${s.oil}         THEN 1 ELSE 0 END)::int AS below_oil,
      SUM(CASE WHEN score_wrinkle     < ${s.wrinkle}     THEN 1 ELSE 0 END)::int AS below_wrinkle,
      SUM(CASE WHEN score_pigment     < ${s.pigment}     THEN 1 ELSE 0 END)::int AS below_pigment,
      SUM(CASE WHEN score_sensitivity < ${s.sensitivity} THEN 1 ELSE 0 END)::int AS below_sensitivity,
      SUM(CASE WHEN score_acne        < ${s.acne}        THEN 1 ELSE 0 END)::int AS below_acne
    FROM latest_per_user
  `;
}

function buildSummary(overallMetric, groupLabel, peerCount) {
  const { topPercent } = overallMetric;
  const beaten = 100 - topPercent;
  if (topPercent <= 25) {
    return `在${groupLabel}中，妳的整體膚況名列前茅（前 ${topPercent}%），超越了 ${beaten}% 的同齡人！`;
  }
  if (topPercent <= 50) {
    return `在${groupLabel}中，妳的整體膚況高於平均水準（前 ${topPercent}%），繼續保持！`;
  }
  return `在${groupLabel}中，妳的整體膚況排名前 ${topPercent}%，持續保養可以提升排名。`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/benchmarks/peer-comparison
// ═══════════════════════════════════════════════════════════════════════════
router.get('/peer-comparison', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. 驗證 UUID 格式
    if (!UUID_REGEX.test(userId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_USER', message: '無效的用戶 ID' }
      });
    }

    // 2. 查詢用戶 profile + 最新一筆分析記錄
    const userInfoSQL = `
      SELECT
        p.birth_date,
        p.gender,
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date::date))::int           AS age,
        (FLOOR(EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date::date)) / 5.0) * 5)::int
                                                                                AS age_group_start,
        r.overall_score,
        r.score_moisture,
        r.score_oil,
        r.score_wrinkle,
        r.score_pigment,
        r.score_sensitivity,
        r.score_acne
      FROM user_profiles p
      LEFT JOIN LATERAL (
        SELECT
          overall_score, score_moisture, score_oil,
          score_wrinkle, score_pigment, score_sensitivity, score_acne
        FROM skin_analysis_records
        WHERE user_id = '${userId}'
        ORDER BY created_at DESC
        LIMIT 1
      ) r ON true
      WHERE p.user_id = '${userId}'
    `;

    const userResult = await runSQL(userInfoSQL);
    const userRows = parseSQL(userResult);

    if (!userRows.length) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: '找不到用戶資料' }
      });
    }

    const user = userRows[0];

    // 尚未進行任何分析
    if (user.overall_score === null) {
      return res.json({
        success: true,
        data: {
          hasAnalysis: false,
          message: '請先完成肌膚分析，即可解鎖同齡比較功能'
        }
      });
    }

    // 尚未填寫生日
    if (!user.birth_date) {
      return res.json({
        success: true,
        data: {
          hasBirthDate: false,
          message: '請在個人設定中填寫生日，即可解鎖同齡比較功能',
          userScores: extractUserScores(user)
        }
      });
    }

    // 3. 準備查詢條件（全部為伺服器計算值或白名單，無 SQL injection 風險）
    const safeGender = ALLOWED_GENDERS.includes(user.gender) ? user.gender : null;
    const ageGroupStart = user.age_group_start;
    const ageGroupEnd = ageGroupStart + 4;

    const scores = {
      overall:     Math.round(user.overall_score),
      moisture:    Math.round(user.score_moisture     ?? 50),
      oil:         Math.round(user.score_oil          ?? 50),
      wrinkle:     Math.round(user.score_wrinkle      ?? 50),
      pigment:     Math.round(user.score_pigment      ?? 50),
      sensitivity: Math.round(user.score_sensitivity  ?? 50),
      acne:        Math.round(user.score_acne         ?? 50)
    };

    const genderClause = safeGender ? `AND p.gender = '${safeGender}'` : '';
    const primaryAgeClause = `AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birth_date::date)) BETWEEN ${ageGroupStart} AND ${ageGroupEnd}`;

    // 4. 主要查詢：同年齡層 + 同性別
    const primaryCacheKey = `peer:${safeGender ?? 'all'}:${ageGroupStart}:avgs`;
    let peerData = null;

    // 嘗試從快取取群體平均（但 below_X 依賴用戶分數，每次都需重新計算）
    // → 為保持單一查詢簡潔，本端直接執行（表格小時效能可接受）
    const primarySQL = buildComparisonSQL(scores, genderClause, primaryAgeClause);
    const primaryResult = await runSQL(primarySQL);
    const primaryRows = parseSQL(primaryResult);
    peerData = primaryRows[0] || { total: 0 };

    let groupScope = 'primary';
    let genderLabel = safeGender === 'female' ? '女性' : safeGender === 'male' ? '男性' : '';
    let groupLabel = `${ageGroupStart}-${ageGroupEnd} 歲${genderLabel}`;

    // 5. 冷啟動降級：樣本不足時擴展到全年齡層
    if ((peerData.total || 0) < MIN_SAMPLE) {
      const fallbackSQL = buildComparisonSQL(scores, genderClause, '');
      const fallbackResult = await runSQL(fallbackSQL);
      const fallbackRows = parseSQL(fallbackResult);
      const fallbackData = fallbackRows[0] || { total: 0 };

      if ((fallbackData.total || 0) >= MIN_SAMPLE) {
        peerData = fallbackData;
        groupScope = 'all_ages';
        groupLabel = genderLabel ? `所有年齡層${genderLabel}` : '所有用戶';
      } else {
        // 連全年齡層都不夠，回傳等待狀態
        return res.json({
          success: true,
          data: {
            insufficientData: true,
            message: '同齡比較資料蒐集中，敬請期待 ✨',
            userScores: scores
          }
        });
      }
    }

    // 6. 計算各項指標百分位
    const total = peerData.total;
    const metricKeys = ['overall', 'moisture', 'oil', 'wrinkle', 'pigment', 'sensitivity', 'acne'];
    const metrics = {};

    for (const key of metricKeys) {
      const belowCount = peerData[`below_${key}`] ?? 0;
      const peerAvg    = peerData[`avg_${key}`]   ?? null;
      const topPct     = computeTopPercent(belowCount, total);

      metrics[key] = {
        label:        METRIC_LABELS[key],
        userScore:    scores[key],
        peerAvg:      peerAvg !== null ? Math.round(peerAvg) : null,
        topPercent:   topPct,
        aboveAverage: scores[key] > (peerAvg ?? 50),
        ...rankLabel(topPct)
      };
    }

    // 7. 回傳結果
    res.json({
      success: true,
      data: {
        hasAnalysis:  true,
        hasBirthDate: true,
        groupScope,
        groupLabel,
        peerCount:    total,
        userAge:      user.age,
        userGender:   safeGender,
        metrics,
        summary: {
          ...metrics.overall,
          description: buildSummary(metrics.overall, groupLabel, total)
        },
        dataNote: '基於近 30 天分析記錄，每次查詢即時計算'
      }
    });

  } catch (error) {
    console.error('[benchmarks] peer-comparison 錯誤:', error.message);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: '同齡比較查詢失敗' }
    });
  }
});

// ─── 輔助：擷取用戶分數物件 ────────────────────────────────────────────────
function extractUserScores(user) {
  return {
    overall:     user.overall_score  != null ? Math.round(user.overall_score)     : null,
    moisture:    user.score_moisture != null ? Math.round(user.score_moisture)    : null,
    oil:         user.score_oil      != null ? Math.round(user.score_oil)         : null,
    wrinkle:     user.score_wrinkle  != null ? Math.round(user.score_wrinkle)     : null,
    pigment:     user.score_pigment  != null ? Math.round(user.score_pigment)     : null,
    sensitivity: user.score_sensitivity != null ? Math.round(user.score_sensitivity) : null,
    acne:        user.score_acne     != null ? Math.round(user.score_acne)        : null
  };
}

module.exports = router;
