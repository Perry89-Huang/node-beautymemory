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

// 將 timestamp 陣列按日期分組計數 (台灣時間 UTC+8)
function groupByDate(rows, field) {
  const counts = {};
  for (const row of rows) {
    const ts = row[field];
    if (!ts) continue;
    const d = new Date(ts);
    // 台灣時間 = UTC+8
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hour = d.getUTCHours() + 8;
    // 如果加 8 小時後跨天
    const local = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate(), hour));
    const key = local.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }
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
  const adminPassword = process.env.ADMIN_PASSWORD || 'beauty-admin-2024';

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

    const loginQuery = `
      query AdminLogins($startDate: timestamp!) {
        user_profiles(
          where: { last_login: { _gte: $startDate } }
          order_by: { last_login: asc }
        ) {
          last_login
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
        }
      }
    `;

    const vars = { startDate: startISO };
    const [regData, loginData, analysisData] = await Promise.all([
      graphqlRequest(regQuery, vars),
      graphqlRequest(loginQuery, vars),
      graphqlRequest(analysisQuery, vars)
    ]);

    const regByDate      = groupByDate(regData.user_profiles,             'member_since');
    const loginByDate    = groupByDate(loginData.user_profiles,            'last_login');
    const analysisByDate = groupByDate(analysisData.skin_analysis_records, 'created_at');

    const dates = buildDateRange(days);
    const dailyStats = dates.map(date => ({
      date,
      registrations: regByDate[date]      || 0,
      logins:        loginByDate[date]     || 0,
      analyses:      analysisByDate[date]  || 0
    }));

    res.json({
      success: true,
      data: {
        days,
        dailyStats,
        totals: {
          registrations: regData.user_profiles.length,
          logins:        loginData.user_profiles.length,
          analyses:      analysisData.skin_analysis_records.length
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
    const query = `
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
    const data = await graphqlRequest(query, { limit });
    res.json({ success: true, data: { users: data.user_profiles } });
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

module.exports = router;
