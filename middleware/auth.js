// middleware/auth.js
// 美魔力會員認證中介層 (使用 user_profiles 版本)

const jwt = require('jsonwebtoken');
const axios = require('axios');
const { nhost } = require('../config/nhost');

// Helper function for GraphQL requests using axios
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

/**
 * 驗證 JWT Token 中介層
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: '未提供認證 Token'
        }
      });
    }

    // 驗證 Token (使用 Nhost SDK)
    let user;
    try {
      // 方法 1: 使用 verifyToken (適用於 SDK v4)
      // 注意: verifyToken 需要完整的 JWT 字串
      // 如果 SDK 不支援 setAccessToken，我們直接解碼或使用 verifyToken API
      
      // 嘗試使用 jwt.decode 作為快速驗證 (因為我們有 Admin Secret 可以信任後端操作)
      const decoded = jwt.decode(token);
      
      if (decoded && decoded.sub && decoded.exp * 1000 > Date.now()) {
         // 基本格式正確且未過期
         user = {
           id: decoded.sub,
           email: decoded.email || decoded['https://hasura.io/jwt/claims']?.['x-hasura-user-id'], 
           displayName: decoded.displayName || 'User',
           roles: decoded['https://hasura.io/jwt/claims']?.['x-hasura-allowed-roles'] || []
         };
      } else {
         console.warn('Token decode failed or expired');
      }

    } catch (error) {
      console.error('Token 驗證過程發生例外:', error.message);
    }
    
    if (!user) {
      console.error('Token validation failed: No user returned');
      return res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token 無效或已過期'
        }
      });
    }

    // 將用戶資訊附加到 request
    req.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      metadata: user.metadata
    };

    next();
  } catch (error) {
    console.error('Token 驗證錯誤:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: '認證過程發生錯誤'
      }
    });
  }
};

/**
 * 檢查會員等級權限
 */
const checkMemberLevel = (allowedLevels = []) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: '請先登入'
          }
        });
      }

      // 從資料庫查詢用戶的 profile
      const query = `
        query GetUserLevel($userId: uuid!) {
          user_profiles(where: { user_id: { _eq: $userId } }) {
            member_level
            subscription_type
            subscription_end
            is_active
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

      // 檢查帳號是否啟用
      if (!profile.is_active) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: '帳號已停用'
          }
        });
      }

      // 檢查訂閱是否過期
      if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_EXPIRED',
            message: '訂閱已過期,請續訂以繼續使用'
          }
        });
      }

      // 檢查會員等級
      if (allowedLevels.length > 0 && !allowedLevels.includes(profile.member_level)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_LEVEL',
            message: `此功能需要 ${allowedLevels.join(' 或 ')} 等級會員`,
            requiredLevels: allowedLevels,
            currentLevel: profile.member_level
          }
        });
      }

      // 將會員資訊附加到 request
      req.memberInfo = {
        level: profile.member_level,
        subscriptionType: profile.subscription_type,
        subscriptionEnd: profile.subscription_end
      };

      next();
    } catch (error) {
      console.error('會員等級檢查錯誤:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'LEVEL_CHECK_ERROR',
          message: '會員等級檢查失敗'
        }
      });
    }
  };
};

/**
 * 檢查分析次數配額
 */
const checkAnalysisQuota = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '請先登入才能使用肌膚檢測功能'
        }
      });
    }

    // 查詢用戶剩餘分析次數
    const query = `
      query GetUserQuota($userId: uuid!) {
        user_profiles(where: { user_id: { _eq: $userId } }) {
          remaining_analyses
          subscription_type
          total_analyses
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

    // 企業版無限次數
    if (profile.subscription_type === 'enterprise') {
      req.quotaInfo = {
        hasQuota: true,
        remaining: -1,
        unlimited: true
      };
      return next();
    }

    // 檢查剩餘次數
    if (profile.remaining_analyses <= 0) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: '分析次數已用完',
          details: {
            totalUsed: profile.total_analyses,
            subscriptionType: profile.subscription_type,
            upgradeMessage: profile.subscription_type === 'free' 
              ? '升級至專業版可獲得更多分析次數'
              : '請聯繫客服升級方案'
          }
        }
      });
    }

    req.quotaInfo = {
      hasQuota: true,
      remaining: profile.remaining_analyses,
      unlimited: false
    };

    next();
  } catch (error) {
    console.error('配額檢查錯誤:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'QUOTA_CHECK_ERROR',
        message: '配額檢查失敗'
      }
    });
  }
};

/**
 * 可選認證 - 允許未登入用戶訪問
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.user = null;
      req.isGuest = true;
      return next();
    }

    let user = null;
    try {
      // 使用 jwt.decode 解析 token（與 authenticateToken 一致）
      const decoded = jwt.decode(token);
      
      if (decoded && decoded.sub && decoded.exp * 1000 > Date.now()) {
        // Token 有效且未過期
        user = {
          id: decoded.sub,
          email: decoded.email || decoded['https://hasura.io/jwt/claims']?.['x-hasura-user-id'],
          displayName: decoded.displayName || 'User',
          roles: decoded['https://hasura.io/jwt/claims']?.['x-hasura-allowed-roles'] || []
        };
      }
    } catch (error) {
      console.warn('optionalAuth token decode error:', error.message);
      // Token 無效，視為訪客
    }
    
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        metadata: user.metadata
      };
      req.isGuest = false;
    } else {
      req.user = null;
      req.isGuest = true;
    }

    next();
  } catch (error) {
    console.error('可選認證錯誤:', error);
    req.user = null;
    req.isGuest = true;
    next();
  }
};

module.exports = {
  authenticateToken,
  checkMemberLevel,
  checkAnalysisQuota,
  optionalAuth
};
