// routes/admin.js
// 後台管理員 API

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { nhost } = require('../config/nhost');
const { authenticateAdmin, ADMIN_JWT_SECRET } = require('../middleware/adminAuth');

// GraphQL helper — 使用 admin secret，回傳 data；失敗時 throw 含詳細訊息的 Error
async function graphqlRequest(query, variables = {}) {
  const response = await axios.post(
    nhost.graphql.url,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      }
    }
  );
  if (response.data.errors) {
    const msg = response.data.errors.map(e => e.message).join('; ');
    throw new Error(`GraphQL Error: ${msg}`);
  }
  return response.data.data;
}

// timestamp → 台灣時間日期字串 (YYYY-MM-DD)
function toTWDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const local = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

// 按日期分組計數
function groupByDate(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = toTWDate(row[field]);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// 按日期計算不重複 user_id 數（活躍用戶）
function groupUniqueUsersByDate(rows, dateField, userField) {
  const sets = {};
  for (const row of rows) {
    const key = toTWDate(row[dateField]);
    if (!key || !row[userField]) continue;
    if (!sets[key]) sets[key] = new Set();
    sets[key].add(row[userField]);
  }
  const counts = {};
  for (const [key, s] of Object.entries(sets)) counts[key] = s.size;
  return counts;
}

// 建立過去 N 天的日期陣列（台灣時間，填入 0）
function buildDateRange(days) {
  const result = [];
  // 取今天台灣日期
  const now = new Date();
  const twOffset = 8 * 60 * 60 * 1000;
  const twNow = new Date(now.getTime() + twOffset);
  const todayStr = twNow.toISOString().slice(0, 10);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(twNow.getTime() - i * 24 * 60 * 60 * 1000);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

// 標準錯誤回應
function errRes(res, code, message, detail) {
  const body = { success: false, error: { code, message } };
  if (detail) body.error.detail = detail;
  return res.status(500).json(body);
}

// ========================================
// POST /api/admin/login — 管理員登入
// ========================================
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'qwerty';

  if (username !== adminUsername || password !== adminPassword) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: '帳號或密碼錯誤' }
    });
  }

  const token = jwt.sign({ username, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, data: { token, username, expiresIn: '8h' } });
});

// ========================================
// GET /api/admin/overview — 總覽數據
// ========================================
router.get('/overview', authenticateAdmin, async (req, res) => {
  try {
    // 分開兩個查詢避免 Hasura aliased-aggregate 問題
    const query1 = `
      query AdminOverviewMain {
        totalUsers: user_profiles_aggregate {
          aggregate { count }
        }
        totalAnalyses: skin_analysis_records_aggregate {
          aggregate { count }
        }
        avgScore: skin_analysis_records_aggregate {
          aggregate { avg { overall_score } }
        }
      }
    `;

    const query2 = `
      query AdminOverviewSubs {
        free: user_profiles_aggregate(where: { subscription_type: { _eq: "free" } }) {
          aggregate { count }
        }
        intermediate: user_profiles_aggregate(where: { subscription_type: { _eq: "intermediate" } }) {
          aggregate { count }
        }
        expert: user_profiles_aggregate(where: { subscription_type: { _eq: "expert" } }) {
          aggregate { count }
        }
        enterprise: user_profiles_aggregate(where: { subscription_type: { _eq: "enterprise" } }) {
          aggregate { count }
        }
      }
    `;

    const [d1, d2] = await Promise.all([
      graphqlRequest(query1),
      graphqlRequest(query2)
    ]);

    res.json({
      success: true,
      data: {
        totalUsers: d1.totalUsers.aggregate.count,
        totalAnalyses: d1.totalAnalyses.aggregate.count,
        avgScore: d1.avgScore.aggregate.avg?.overall_score
          ? Math.round(d1.avgScore.aggregate.avg.overall_score)
          : 0,
        subscriptionBreakdown: [
          { name: '免費', value: d2.free.aggregate.count, key: 'free' },
          { name: '進階', value: d2.intermediate.aggregate.count, key: 'intermediate' },
          { name: '專業', value: d2.expert.aggregate.count, key: 'expert' },
          { name: '企業', value: d2.enterprise.aggregate.count, key: 'enterprise' }
        ]
      }
    });
  } catch (error) {
    console.error('Admin overview error:', error.message);
    return errRes(res, 'SERVER_ERROR', '取得總覽資料失敗', error.message);
  }
});

// ========================================
// GET /api/admin/daily-stats?days=30 — 每日統計
// ========================================
router.get('/daily-stats', authenticateAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);

    // 起始時間：days 天前的 00:00:00 UTC
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - days + 1);
    startDate.setUTCHours(0, 0, 0, 0);
    const startISO = startDate.toISOString(); // e.g. "2024-03-01T00:00:00.000Z"

    // 分三個獨立查詢，避免複雜度
    const regQuery = `
      query AdminRegistrations($startDate: timestamp!) {
        user_profiles(
          where: { member_since: { _gte: $startDate } }
          order_by: { member_since: asc }
        ) {
          member_since
        }
      }
    `;

    const analysisQuery = `
      query AdminAnalyses($startDate: timestamp!) {
        skin_analysis_records(
          where: { created_at: { _gte: $startDate } }
          order_by: { created_at: asc }
        ) {
          created_at
          user_id
        }
      }
    `;

    const vars = { startDate: startISO };
    const [regData, analysisData] = await Promise.all([
      graphqlRequest(regQuery, vars),
      graphqlRequest(analysisQuery, vars)
    ]);

    const records = analysisData.skin_analysis_records;
    const regByDate      = groupByDate(regData.user_profiles, 'member_since');
    const analysisByDate = groupByDate(records,                'created_at');
    const activeByDate   = groupUniqueUsersByDate(records,     'created_at', 'user_id');

    const dates = buildDateRange(days);
    const dailyStats = dates.map(date => ({
      date,
      registrations: regByDate[date]    || 0,
      analyses:      analysisByDate[date] || 0,
      activeUsers:   activeByDate[date]   || 0
    }));

    res.json({
      success: true,
      data: {
        days,
        dailyStats,
        totals: {
          registrations: regData.user_profiles.length,
          analyses:      records.length,
          activeUsers:   new Set(records.map(r => r.user_id)).size
        }
      }
    });
  } catch (error) {
    console.error('Admin daily-stats error:', error.message);
    return errRes(res, 'SERVER_ERROR', '取得每日統計失敗', error.message);
  }
});

// ========================================
// GET /api/admin/recent-users?limit=20 — 最近註冊用戶
// ========================================
router.get('/recent-users', authenticateAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    // Step 1: 取 user_profiles
    const profileQuery = `
      query AdminRecentUsers($limit: Int!) {
        user_profiles(
          order_by: { member_since: desc }
          limit: $limit
        ) {
          user_id
          member_level
          subscription_type
          member_since
          last_login
          total_analyses
          remaining_analyses
        }
      }
    `;
    const profileData = await graphqlRequest(profileQuery, { limit });
    const profiles = profileData.user_profiles;

    // Step 2: 取 auth.users 的 displayName / email
    const userIds = profiles.map(p => p.user_id);
    let userMap = {};
    if (userIds.length > 0) {
      const userQuery = `
        query AdminUserNames($ids: [uuid!]!) {
          users(where: { id: { _in: $ids } }) {
            id
            displayName
            email
          }
        }
      `;
      const userData = await graphqlRequest(userQuery, { ids: userIds });
      userData.users.forEach(u => { userMap[u.id] = u; });
    }

    // Step 3: 合併
    const users = profiles.map(p => ({
      ...p,
      displayName: userMap[p.user_id]?.displayName || null,
      email:       userMap[p.user_id]?.email       || null
    }));

    res.json({ success: true, data: { users } });
  } catch (error) {
    console.error('Admin recent-users error:', error.message);
    return errRes(res, 'SERVER_ERROR', '取得用戶列表失敗', error.message);
  }
});

// ========================================
// GET /api/admin/analysis-stats — 肌膚檢測詳細統計
// ========================================
router.get('/analysis-stats', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      query AdminAnalysisStats {
        all: skin_analysis_records_aggregate {
          aggregate {
            avg { overall_score }
            max { overall_score }
            min { overall_score }
          }
        }
        excellent: skin_analysis_records_aggregate(where: { overall_score: { _gte: 80 } }) {
          aggregate { count }
        }
        good: skin_analysis_records_aggregate(where: { overall_score: { _gte: 60, _lt: 80 } }) {
          aggregate { count }
        }
        fair: skin_analysis_records_aggregate(where: { overall_score: { _gte: 40, _lt: 60 } }) {
          aggregate { count }
        }
        poor: skin_analysis_records_aggregate(where: { overall_score: { _lt: 40 } }) {
          aggregate { count }
        }
      }
    `;
    const data = await graphqlRequest(query);
    const agg = data.all.aggregate;

    res.json({
      success: true,
      data: {
        avgScore: agg.avg?.overall_score ? Math.round(agg.avg.overall_score) : 0,
        maxScore: agg.max?.overall_score || 0,
        minScore: agg.min?.overall_score || 0,
        scoreDistribution: [
          { range: '優秀 (80-100)', count: data.excellent.aggregate.count },
          { range: '良好 (60-79)',  count: data.good.aggregate.count },
          { range: '普通 (40-59)',  count: data.fair.aggregate.count },
          { range: '待改善 (<40)', count: data.poor.aggregate.count }
        ]
      }
    });
  } catch (error) {
    console.error('Admin analysis-stats error:', error.message);
    return errRes(res, 'SERVER_ERROR', '取得肌膚檢測統計失敗', error.message);
  }
});

// ========================================
// DELETE /api/admin/users/:userId — 刪除用戶
// ========================================
router.delete('/users/:userId', authenticateAdmin, async (req, res) => {
  const { userId } = req.params;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!UUID_REGEX.test(userId)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_USER_ID', message: '無效的用戶 ID' }
    });
  }

  try {
    // Step 1: 刪除分析記錄
    await graphqlRequest(`
      mutation DeleteUserAnalyses($userId: uuid!) {
        delete_skin_analysis_records(where: { user_id: { _eq: $userId } }) {
          affected_rows
        }
      }
    `, { userId });

    // Step 2: 刪除 user_profiles
    await graphqlRequest(`
      mutation DeleteUserProfile($userId: uuid!) {
        delete_user_profiles(where: { user_id: { _eq: $userId } }) {
          affected_rows
        }
      }
    `, { userId });

    // Step 3: 透過 nhost auth admin REST API 刪除 auth.users
    const NHOST_SUBDOMAIN = process.env.NHOST_SUBDOMAIN;
    const NHOST_REGION    = process.env.NHOST_REGION || 'ap-southeast-1';
    const authAdminUrl    = `https://${NHOST_SUBDOMAIN}.auth.${NHOST_REGION}.nhost.run/v1/admin/users/${userId}`;

    console.log('[admin] 刪除 auth 用戶 URL:', authAdminUrl);
    await axios.delete(authAdminUrl, {
      headers: { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET }
    });

    console.log(`[admin] 已刪除用戶 ${userId}`);
    res.json({ success: true, data: { deletedUserId: userId } });

  } catch (error) {
    console.error('Admin delete-user error:', error.message);
    return errRes(res, 'SERVER_ERROR', '刪除用戶失敗', error.message);
  }
});

module.exports = router;
