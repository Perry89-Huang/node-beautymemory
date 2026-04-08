// routes/admin.js
// 後台管理員 API

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { nhost } = require('../config/nhost');
const { authenticateAdmin, ADMIN_JWT_SECRET } = require('../middleware/adminAuth');
const { getTaiwanISO } = require('../utils/timezone');

// GraphQL helper
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
    throw new Error(response.data.errors[0].message);
  }
  return response.data.data;
}

// 將 timestamp 陣列按日期分組計數 (台灣時間 UTC+8)
function groupByDate(timestamps, field) {
  const counts = {};
  for (const row of timestamps) {
    const ts = row[field];
    if (!ts) continue;
    // 轉為台灣時間 (UTC+8)
    const d = new Date(ts);
    d.setHours(d.getHours() + 8);
    const dateKey = d.toISOString().slice(0, 10); // YYYY-MM-DD
    counts[dateKey] = (counts[dateKey] || 0) + 1;
  }
  return counts;
}

// 建立過去 N 天的日期陣列 (填入 0)
function buildDateRange(days) {
  const result = [];
  const today = new Date();
  today.setHours(today.getHours() + 8); // 台灣時間
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
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

  const token = jwt.sign(
    { username, role: 'admin' },
    ADMIN_JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    success: true,
    data: { token, username, expiresIn: '8h' }
  });
});

// ========================================
// GET /api/admin/overview — 總覽數據
// ========================================
router.get('/overview', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      query AdminOverview {
        totalUsers: user_profiles_aggregate {
          aggregate { count }
        }
        totalAnalyses: skin_analysis_records_aggregate {
          aggregate { count }
        }
        freeUsers: user_profiles_aggregate(where: { subscription_type: { _eq: "free" } }) {
          aggregate { count }
        }
        intermediateUsers: user_profiles_aggregate(where: { subscription_type: { _eq: "intermediate" } }) {
          aggregate { count }
        }
        expertUsers: user_profiles_aggregate(where: { subscription_type: { _eq: "expert" } }) {
          aggregate { count }
        }
        enterpriseUsers: user_profiles_aggregate(where: { subscription_type: { _eq: "enterprise" } }) {
          aggregate { count }
        }
        avgScore: skin_analysis_records_aggregate {
          aggregate { avg { overall_score } }
        }
      }
    `;

    const data = await graphqlRequest(query);

    res.json({
      success: true,
      data: {
        totalUsers: data.totalUsers.aggregate.count,
        totalAnalyses: data.totalAnalyses.aggregate.count,
        avgScore: data.avgScore.aggregate.avg?.overall_score
          ? Math.round(data.avgScore.aggregate.avg.overall_score)
          : 0,
        subscriptionBreakdown: [
          { name: '免費', value: data.freeUsers.aggregate.count, key: 'free' },
          { name: '進階', value: data.intermediateUsers.aggregate.count, key: 'intermediate' },
          { name: '專業', value: data.expertUsers.aggregate.count, key: 'expert' },
          { name: '企業', value: data.enterpriseUsers.aggregate.count, key: 'enterprise' }
        ]
      }
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: '取得總覽資料失敗' } });
  }
});

// ========================================
// GET /api/admin/daily-stats?days=30 — 每日統計
// ========================================
router.get('/daily-stats', authenticateAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);
    const startISO = startDate.toISOString();

    const query = `
      query AdminDailyStats($startDate: timestamptz!) {
        registrations: user_profiles(
          where: { member_since: { _gte: $startDate } }
          order_by: { member_since: asc }
        ) {
          member_since
        }
        logins: user_profiles(
          where: { last_login: { _gte: $startDate } }
          order_by: { last_login: asc }
        ) {
          last_login
        }
        analyses: skin_analysis_records(
          where: { created_at: { _gte: $startDate } }
          order_by: { created_at: asc }
        ) {
          created_at
        }
      }
    `;

    const data = await graphqlRequest(query, { startDate: startISO });

    const regByDate = groupByDate(data.registrations, 'member_since');
    const loginByDate = groupByDate(data.logins, 'last_login');
    const analysisByDate = groupByDate(data.analyses, 'created_at');

    const dates = buildDateRange(days);
    const dailyStats = dates.map(date => ({
      date,
      registrations: regByDate[date] || 0,
      logins: loginByDate[date] || 0,
      analyses: analysisByDate[date] || 0
    }));

    res.json({
      success: true,
      data: {
        days,
        dailyStats,
        totals: {
          registrations: data.registrations.length,
          logins: data.logins.length,
          analyses: data.analyses.length
        }
      }
    });
  } catch (error) {
    console.error('Admin daily stats error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: '取得每日統計失敗' } });
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

    res.json({
      success: true,
      data: { users: data.user_profiles }
    });
  } catch (error) {
    console.error('Admin recent users error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: '取得用戶列表失敗' } });
  }
});

// ========================================
// GET /api/admin/analysis-stats — 肌膚檢測詳細統計
// ========================================
router.get('/analysis-stats', authenticateAdmin, async (req, res) => {
  try {
    const query = `
      query AdminAnalysisStats {
        scoreDistribution: skin_analysis_records_aggregate {
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
    const stats = data.scoreDistribution.aggregate;

    res.json({
      success: true,
      data: {
        avgScore: stats.avg?.overall_score ? Math.round(stats.avg.overall_score) : 0,
        maxScore: stats.max?.overall_score || 0,
        minScore: stats.min?.overall_score || 0,
        scoreDistribution: [
          { range: '優秀 (80-100)', count: data.excellent.aggregate.count },
          { range: '良好 (60-79)', count: data.good.aggregate.count },
          { range: '普通 (40-59)', count: data.fair.aggregate.count },
          { range: '待改善 (<40)', count: data.poor.aggregate.count }
        ]
      }
    });
  } catch (error) {
    console.error('Admin analysis stats error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: '取得肌膚檢測統計失敗' } });
  }
});

module.exports = router;
