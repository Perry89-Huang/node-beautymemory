// routes/members.js
// 美魔力會員管理 API (使用 user_profiles 版本)

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { nhost } = require('../config/nhost');
const { 
  authenticateToken, 
  checkMemberLevel, 
  checkAnalysisQuota 
} = require('../middleware/auth');

// Helper function for GraphQL requests using axios (more reliable than SDK)
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
    const error = new Error(response.data.errors[0].message);
    error.errors = response.data.errors;
    throw error;
  }
  
  return { data: response.data.data, error: null };
}

// ========================================
// 會員註冊
// ========================================
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName, phone } = req.body;

    // 驗證必填欄位
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: '請提供 email 和 password'
        }
      });
    }

    // 使用 Nhost 註冊
    let session;
    try {
      const { body } = await nhost.auth.signUpEmailPassword({
        email,
        password,
        options: {
          displayName,
          metadata: {
            phone,
            registrationSource: 'beautymemory_web'
          }
        }
      });
      session = body.session;
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: error.message || '註冊失敗'
        }
      });
    }

    if (!session) {
       return res.json({
        success: true,
        message: '註冊成功! 請檢查您的 Email 信箱並完成驗證後登入。',
        data: {
          requiresVerification: true
        }
      });
    }

    // user_profile 會由觸發器自動建立,這裡可以選擇性更新手機號碼
    if (phone) {
      const query = `
        mutation UpdateUserProfile($userId: uuid!, $phone: String) {
          update_user_profiles(
            where: { user_id: { _eq: $userId } }
            _set: { phone: $phone }
          ) {
            affected_rows
          }
        }
      `;
      await graphqlRequest(query, { userId: session.user.id, phone });
    }

    // 查詢完整資料
    const query = `
      query GetUserWithProfile($userId: uuid!) {
        user(id: $userId) {
          id
          email
          displayName
        }
        user_profiles(where: { user_id: { _eq: $userId } }) {
          member_level
          remaining_analyses
          subscription_type
        }
      }
    `;

    const { data: userData } = await graphqlRequest(query, { userId: session.user.id });

    const user = userData.user;
    if (user) {
        user.user_profile = userData.user_profiles?.[0] || null;
    }

    res.json({
      success: true,
      message: '註冊成功!歡迎加入美魔力',
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          memberLevel: user.user_profile?.member_level || 'beginner',
          remainingAnalyses: user.user_profile?.remaining_analyses || 3
        },
        accessToken: session.accessToken,
        welcomeBonus: {
          freeAnalyses: 3,
          message: '恭喜獲得 3 次免費 AI 肌膚檢測!'
        }
      }
    });

  } catch (error) {
    console.error('註冊錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '註冊過程發生錯誤'
      }
    });
  }
});

// ========================================
// OAuth Token 刷新 - 使用 refreshToken 換取 accessToken
// ========================================
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: '缺少 refreshToken'
        }
      });
    }

    // 直接調用 Nhost Auth API 刷新 token
    const subdomain = process.env.NHOST_SUBDOMAIN;
    const region = process.env.NHOST_REGION || 'ap-southeast-1';
    const authUrl = `https://${subdomain}.auth.${region}.nhost.run/v1/token`;

    const tokenResponse = await axios.post(authUrl, {
      refreshToken: refreshToken
    });

    if (!tokenResponse.data || !tokenResponse.data.accessToken) {
      console.error('RefreshToken 回應錯誤:', tokenResponse.data);
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'RefreshToken 無效或已過期'
        }
      });
    }

    const sessionData = tokenResponse.data;
    const userId = sessionData.user.id;

    // 查詢用戶完整資料
    const query = `
      query GetUserInfo($userId: uuid!) {
        user(id: $userId) {
          id
          email
          displayName
          avatarUrl
        }
        user_profiles(where: { user_id: { _eq: $userId } }) {
          member_level
          remaining_analyses
          total_analyses
        }
      }
    `;
    
    const { data: userData } = await graphqlRequest(query, { userId: userId });
    
    if (!userData || !userData.user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '找不到用戶資料'
        }
      });
    }

    const user = userData.user;
    const profile = userData.user_profiles?.[0];

    // 更新最後登入時間
    try {
      const updateQuery = `
        mutation UpdateLastLogin($userId: uuid!) {
          update_user_profiles(
            where: { user_id: { _eq: $userId } }
            _set: { last_login: "now()" }
          ) {
            affected_rows
          }
        }
      `;
      await graphqlRequest(updateQuery, { userId: userId });
    } catch (e) {
      // 忽略更新失敗
    }

    res.json({
      success: true,
      message: 'Token 刷新成功',
      data: {
        accessToken: sessionData.accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          memberLevel: profile?.member_level || 'beginner',
          remainingAnalyses: profile?.remaining_analyses || 0,
          totalAnalyses: profile?.total_analyses || 0
        }
      }
    });

  } catch (error) {
    console.error('Token 刷新錯誤:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Token 刷新失敗: ' + (error.response?.data?.message || error.message)
      }
    });
  }
});

// ========================================
// Google OAuth 登入 - 取得授權 URL
// ========================================
router.get('/auth/google', async (req, res) => {
  try {
    // 使用 Nhost 的 Google OAuth URL（新格式）
    const subdomain = process.env.NHOST_SUBDOMAIN;
    const region = process.env.NHOST_REGION || 'ap-southeast-1';
    
    // 優先使用前端傳來的 redirectTo，這樣可以支援 localhost 測試
    const redirectTo = req.query.redirectTo || process.env.FRONTEND_URL || 'http://localhost:3001';
    
    if (!subdomain) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Nhost 配置未完成'
        }
      });
    }

    // Nhost Google OAuth URL 格式
    // 使用 redirectTo 參數，讓 OAuth 登入後導回到發起登入的 origin
    const authUrl = `https://${subdomain}.auth.${region}.nhost.run/v1/signin/provider/google?redirectTo=${encodeURIComponent(redirectTo)}`;
    
    // 調試日誌
    console.log('🔐 Google OAuth Request:', {
      receivedRedirectTo: req.query.redirectTo,
      finalRedirectTo: redirectTo,
      authUrl: authUrl
    });
    
    res.json({
      success: true,
      data: {
        authUrl,
        provider: 'google',
        redirectUrl: redirectTo,
        note: `將在登入後重定向至: ${redirectTo}。請確保此 URL 已在 Nhost Dashboard 中的 Allowed Redirect URLs 設定`
      }
    });

  } catch (error) {
    console.error('Google OAuth URL 錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Google 登入初始化失敗'
      }
    });
  }
});

// ========================================
// Google OAuth 回調處理
// ========================================
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { refreshToken } = req.query;

    if (!refreshToken) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}?error=oauth_failed`);
    }

    // 使用 refreshToken 換取 session
    const { body } = await nhost.auth.refreshSession(refreshToken);
    
    if (!body.session) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}?error=session_failed`);
    }

    const session = body.session;

    // 檢查是否為新用戶（需要建立 user_profile）
    const checkProfileQuery = `
      query CheckProfile($userId: uuid!) {
        user_profiles(where: { user_id: { _eq: $userId } }) {
          user_id
        }
      }
    `;

    const { data: profileData } = await graphqlRequest(checkProfileQuery, { userId: session.user.id });

    // 如果是新用戶，確保 profile 已建立（通常由觸發器自動建立）
    if (!profileData.user_profiles || profileData.user_profiles.length === 0) {
      console.log('New Google user, profile will be created by trigger');
      // 等待一下讓觸發器完成
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 更新最後登入時間
    const updateLoginQuery = `
      mutation UpdateLastLogin($userId: uuid!) {
        update_user_profiles(
          where: { user_id: { _eq: $userId } }
          _set: { last_login: "now()" }
        ) {
          affected_rows
        }
      }
    `;
    await graphqlRequest(updateLoginQuery, { userId: session.user.id });

    // 重導向回前端，帶上 tokens
    const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:3001');
    redirectUrl.searchParams.set('accessToken', session.accessToken);
    redirectUrl.searchParams.set('refreshToken', session.refreshToken);
    
    res.redirect(redirectUrl.toString());

  } catch (error) {
    console.error('Google OAuth 回調錯誤:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}?error=callback_failed`);
  }
});

// ========================================
// 會員登入
// ========================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: '請提供 email 和 password'
        }
      });
    }

    // Nhost 登入
    let session;
    try {
      const { body } = await nhost.auth.signInEmailPassword({
        email,
        password
      });
      session = body.session;
    } catch (error) {
      console.error('Login error:', error);
      return res.status(401).json({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: error.message || '登入失敗,請檢查帳號密碼'
        }
      });
    }

    if (!session) {
       return res.status(401).json({
        success: false,
        error: {
          code: 'LOGIN_FAILED',
          message: '登入失敗，未取得 Session'
        }
      });
    }

    // 查詢完整用戶資料 (含 profile)
    let userData;
    try {
      // 分開查詢 user 和 user_profiles，因為關聯可能未建立
      const query = `
        query GetUserInfo($userId: uuid!) {
          user(id: $userId) {
            id
            email
            displayName
            avatarUrl
          }
          user_profiles(where: { user_id: { _eq: $userId } }) {
            member_level
            subscription_type
            remaining_analyses
            total_analyses
            last_login
          }
        }
      `;
      
      const response = await graphqlRequest(query, { userId: session.user.id });
      
      if (response.error) {
        console.error('GraphQL returned error:', response.error);
      }
      userData = response.data;
      
      // 手動合併資料
      if (userData && userData.user) {
          userData.user.user_profile = userData.user_profiles?.[0] || null;
      }

    } catch (gqlError) {
      console.error('GraphQL request failed:', gqlError);
      // Continue execution to return basic session info
    }

    const user = userData?.user;

    if (!user) {
      // 如果找不到使用者資料，可能是同步延遲或資料不一致
      // 這裡我們至少返回 session 中的基本資訊
      console.warn(`User profile not found for ID: ${session.user.id}. Using session data.`);
      return res.json({
        success: true,
        message: '登入成功',
        data: {
          user: {
            id: session.user.id,
            email: session.user.email,
            displayName: session.user.displayName,
            avatarUrl: session.user.avatarUrl,
            memberLevel: 'beginner', // Default
            remainingAnalyses: 3,    // Default fallback
            totalAnalyses: 0
          },
          accessToken: session.accessToken,
          refreshToken: session.refreshToken
        }
      });
    }

    // 更新最後登入時間
    try {
      const query = `
        mutation UpdateLastLogin($userId: uuid!) {
          update_user_profiles(
            where: { user_id: { _eq: $userId } }
            _set: { last_login: "now()" }
          ) {
            affected_rows
          }
        }
      `;
      await graphqlRequest(query, { userId: session.user.id });
    } catch (e) {
      console.warn('Failed to update last login:', e.message);
    }

    res.json({
      success: true,
      message: '登入成功',
      data: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          memberLevel: user.user_profile?.member_level,
          subscriptionType: user.user_profile?.subscription_type,
          remainingAnalyses: user.user_profile?.remaining_analyses,
          totalAnalyses: user.user_profile?.total_analyses
        },
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      }
    });

  } catch (error) {
    console.error('登入錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '登入過程發生錯誤'
      }
    });
  }
});

// ========================================
// 取得個人資料 (需登入)
// ========================================
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const query = `
      query GetFullProfile($userId: uuid!) {
        user(id: $userId) {
          id
          email
          displayName
          avatarUrl
          createdAt
        }
        user_profiles(where: { user_id: { _eq: $userId } }) {
          phone
          birth_date
          gender
          member_level
          member_since
          total_analyses
          remaining_analyses
          subscription_type
          subscription_start
          subscription_end
          feng_shui_element
          preferred_analysis_time
          last_login
        }
      }
    `;

    const { data: userData, error } = await graphqlRequest(query, { userId: req.user.id });

    if (error || !userData?.user) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '找不到用戶資料'
        }
      });
    }

    const user = userData.user;
    const profile = userData.user_profiles?.[0] || {};

    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        phone: profile.phone,
        birthDate: profile.birth_date,
        gender: profile.gender,
        memberLevel: profile.member_level,
        memberSince: profile.member_since,
        totalAnalyses: profile.total_analyses,
        remainingAnalyses: profile.remaining_analyses,
        subscriptionType: profile.subscription_type,
        subscriptionStart: profile.subscription_start,
        subscriptionEnd: profile.subscription_end,
        fengShuiElement: profile.feng_shui_element,
        preferredAnalysisTime: profile.preferred_analysis_time,
        createdAt: user.createdAt,
        lastLogin: profile.last_login
      }
    });

  } catch (error) {
    console.error('取得個人資料錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '取得資料失敗'
      }
    });
  }
});

// ========================================
// 更新個人資料 (需登入)
// ========================================
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { displayName, phone, birthDate, gender, fengShuiElement, preferredAnalysisTime } = req.body;

    // 更新 auth.users 的 displayName (如果有提供)
    if (displayName) {
      const query = `
        mutation UpdateDisplayName($userId: uuid!, $displayName: String!) {
          updateUser(pk_columns: { id: $userId }, _set: { displayName: $displayName }) {
            id
          }
        }
      `;
      await graphqlRequest(query, { userId: req.user.id, displayName });
    }

    // 更新 user_profiles
    const query = `
      mutation UpdateProfile(
        $userId: uuid!
        $phone: String
        $birthDate: date
        $gender: String
        $fengShuiElement: String
        $preferredAnalysisTime: Int
      ) {
        update_user_profiles(
          where: { user_id: { _eq: $userId } }
          _set: {
            phone: $phone
            birth_date: $birthDate
            gender: $gender
            feng_shui_element: $fengShuiElement
            preferred_analysis_time: $preferredAnalysisTime
            updated_at: "now()"
          }
        ) {
          returning {
            phone
            birth_date
            gender
            feng_shui_element
            preferred_analysis_time
          }
        }
      }
    `;

    const { data: updatedData, error } = await graphqlRequest(query, {
      userId: req.user.id,
      phone,
      birthDate,
      gender,
      fengShuiElement,
      preferredAnalysisTime
    });

    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: '更新失敗'
        }
      });
    }

    res.json({
      success: true,
      message: '個人資料更新成功',
      data: updatedData.update_user_profiles.returning[0]
    });

  } catch (error) {
    console.error('更新個人資料錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '更新失敗'
      }
    });
  }
});

// ========================================
// 查詢分析次數配額 (需登入)
// ========================================
router.get('/quota', authenticateToken, async (req, res) => {
  try {
    const query = `
      query GetQuota($userId: uuid!) {
        user_profiles(where: { user_id: { _eq: $userId } }) {
          remaining_analyses
          total_analyses
          subscription_type
          subscription_end
        }
      }
    `;

    const { data: userData, error } = await graphqlRequest(query, { userId: req.user.id });

    if (error || !userData?.user_profiles?.[0]) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: '找不到用戶資料'
        }
      });
    }

    const profile = userData.user_profiles[0];
    const isUnlimited = profile.subscription_type === 'enterprise';

    res.json({
      success: true,
      data: {
        remaining: isUnlimited ? -1 : profile.remaining_analyses,
        total: profile.total_analyses,
        subscriptionType: profile.subscription_type,
        subscriptionEnd: profile.subscription_end,
        unlimited: isUnlimited,
        message: isUnlimited 
          ? '企業版會員享有無限次分析'
          : `剩餘 ${profile.remaining_analyses} 次分析機會`
      }
    });

  } catch (error) {
    console.error('查詢配額錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '查詢失敗'
      }
    });
  }
});

// ========================================
// 取得會員統計資料 (需登入)
// ========================================
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const query = `
      query GetStatistics($userId: uuid!) {
        user_profiles(where: { user_id: { _eq: $userId } }) {
          total_analyses
          member_level
          member_since
        }
        skin_analysis_records_aggregate(where: { user_id: { _eq: $userId } }) {
          aggregate {
            count
            avg {
              overall_score
            }
            max {
              overall_score
            }
          }
        }
        user_achievements_aggregate(where: { user_id: { _eq: $userId } }) {
          aggregate {
            count
          }
        }
        beauty_memories_aggregate(where: { user_id: { _eq: $userId } }) {
          aggregate {
            count
          }
        }
      }
    `;

    const { data, error } = await graphqlRequest(query, { userId: req.user.id });

    if (error) {
      throw error;
    }

    const profile = data.user_profiles[0];
    const analysisStats = data.skin_analysis_records_aggregate.aggregate;
    const achievementCount = data.user_achievements_aggregate.aggregate.count;
    const memoryCount = data.beauty_memories_aggregate.aggregate.count;

    // 計算會員天數
    const memberDays = profile?.member_since 
      ? Math.floor((new Date() - new Date(profile.member_since)) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      success: true,
      data: {
        memberLevel: profile?.member_level || 'beginner',
        memberSince: profile?.member_since,
        memberDays,
        totalAnalyses: analysisStats.count || 0,
        averageScore: analysisStats.avg?.overall_score 
          ? Math.round(analysisStats.avg.overall_score) 
          : 0,
        bestScore: analysisStats.max?.overall_score || 0,
        achievementsUnlocked: achievementCount,
        beautifulMemories: memoryCount
      }
    });

  } catch (error) {
    console.error('統計資料錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '取得統計資料失敗'
      }
    });
  }
});

// ========================================
// Google OAuth 登入
// ========================================

// Step 1: 取得 Google OAuth 授權 URL
router.get('/auth/google', async (req, res) => {
  try {
    const redirectTo = req.query.redirectTo || 'http://localhost:3001';
    
    console.log('🔐 Google OAuth 請求:', {
      redirectTo,
      backendUrl: process.env.BACKEND_URL || 'http://localhost:3000'
    });

    // 建立 OAuth URL
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const callbackUrl = `${backendUrl}/api/members/auth/google/callback`;
    
    // Nhost Google OAuth URL
    const nhostSubdomain = process.env.NHOST_SUBDOMAIN;
    const nhostRegion = process.env.NHOST_REGION || 'ap-southeast-1';
    
    // 使用 Nhost 的 OAuth endpoint，並指定 callback URL
    const authUrl = `https://${nhostSubdomain}.nhost.run/v1/auth/signin/provider/google?redirectTo=${encodeURIComponent(callbackUrl + '?frontendRedirect=' + encodeURIComponent(redirectTo))}`;

    console.log('✅ 產生 OAuth URL:', authUrl);

    res.json({
      success: true,
      data: {
        authUrl,
        callbackUrl
      }
    });

  } catch (error) {
    console.error('❌ Google OAuth URL 產生失敗:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'OAUTH_URL_FAILED',
        message: 'Google 登入初始化失敗'
      }
    });
  }
});

// Step 2: 處理 Google OAuth 回調
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { refreshToken, frontendRedirect } = req.query;
    
    console.log('🔐 OAuth Callback 收到:', {
      hasRefreshToken: !!refreshToken,
      frontendRedirect
    });

    if (!refreshToken) {
      // 如果沒有 refreshToken，可能是錯誤或用戶取消
      const errorRedirect = `${frontendRedirect || 'http://localhost:3001'}?error=oauth_cancelled`;
      return res.redirect(errorRedirect);
    }

    // 使用 refreshToken 換取完整 session
    const { body } = await nhost.auth.refreshSession(refreshToken);
    const session = body.session;

    if (!session) {
      console.error('❌ 無法取得 session');
      const errorRedirect = `${frontendRedirect || 'http://localhost:3001'}?error=session_failed`;
      return res.redirect(errorRedirect);
    }

    const userId = session.user.id;
    console.log('✅ 用戶登入成功:', userId);

    // 檢查是否為新用戶 (user_profile 是否存在)
    const checkQuery = `
      query CheckUserProfile($userId: uuid!) {
        user_profiles(where: { user_id: { _eq: $userId } }) {
          user_id
          member_level
        }
      }
    `;

    const { data: checkData } = await graphqlRequest(checkQuery, { userId });
    const isNewUser = !checkData?.user_profiles || checkData.user_profiles.length === 0;

    if (isNewUser) {
      console.log('🎉 新用戶，建立 user_profile...');
      // 建立 user_profile（應該由觸發器自動建立，這裡是備用）
      const createProfileQuery = `
        mutation CreateUserProfile($userId: uuid!, $email: String, $displayName: String) {
          insert_user_profiles_one(
            object: {
              user_id: $userId
              member_level: "beginner"
              remaining_analyses: 3
              total_analyses: 0
              subscription_type: "free"
            }
            on_conflict: {
              constraint: user_profiles_pkey
              update_columns: [member_level]
            }
          ) {
            user_id
            member_level
            remaining_analyses
          }
        }
      `;
      
      await graphqlRequest(createProfileQuery, {
        userId,
        email: session.user.email,
        displayName: session.user.displayName
      });
    }

    // 更新最後登入時間
    const updateLoginQuery = `
      mutation UpdateLastLogin($userId: uuid!) {
        update_user_profiles(
          where: { user_id: { _eq: $userId } }
          _set: { last_login: "now()" }
        ) {
          affected_rows
        }
      }
    `;
    await graphqlRequest(updateLoginQuery, { userId });

    // 重定向回前端，帶上 tokens
    const redirectUrl = `${frontendRedirect || 'http://localhost:3001'}?refreshToken=${encodeURIComponent(refreshToken)}&newUser=${isNewUser}`;
    
    console.log('🔄 重定向到:', redirectUrl);
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('❌ OAuth Callback 錯誤:', error);
    const errorRedirect = `${req.query.frontendRedirect || 'http://localhost:3001'}?error=oauth_failed`;
    res.redirect(errorRedirect);
  }
});

// ========================================
// 使用 Refresh Token 換取 Access Token
// ========================================
router.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: '缺少 refreshToken'
        }
      });
    }

    // 使用 Nhost SDK 刷新 session
    const { body } = await nhost.auth.refreshSession(refreshToken);
    const session = body.session;

    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'refreshToken 無效或已過期'
        }
      });
    }

    // 取得用戶完整資料
    const query = `
      query GetUserWithProfile($userId: uuid!) {
        user(id: $userId) {
          id
          email
          displayName
          avatarUrl
        }
        user_profiles(where: { user_id: { _eq: $userId } }) {
          member_level
          subscription_type
          remaining_analyses
          total_analyses
        }
      }
    `;

    const { data: userData } = await graphqlRequest(query, { userId: session.user.id });
    const user = userData?.user;
    const profile = userData?.user_profiles?.[0];

    res.json({
      success: true,
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          memberLevel: profile?.member_level || 'beginner',
          subscriptionType: profile?.subscription_type || 'free',
          remainingAnalyses: profile?.remaining_analyses || 0,
          totalAnalyses: profile?.total_analyses || 0
        }
      }
    });

  } catch (error) {
    console.error('Token 刷新錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_FAILED',
        message: 'Token 刷新失敗'
      }
    });
  }
});

module.exports = router;
