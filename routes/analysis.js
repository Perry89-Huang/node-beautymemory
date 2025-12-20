// routes/analysis.js
// 美魔力 AI 肌膚檢測 API (使用 user_profiles 版本)

const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const { nhost } = require('../config/nhost');
const { 
  authenticateToken, 
  checkAnalysisQuota,
  optionalAuth 
} = require('../middleware/auth');
const SuluSkinAnalyzer = require('../SkinAnalyzer');

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

// 初始化分析器
const analyzer = new SuluSkinAnalyzer(process.env.SULU_API_KEY);

// 設定檔案上傳
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只接受圖片檔案'));
    }
  }
});

// ========================================
// 檢測前檢查
// ========================================
router.get('/check-permission', optionalAuth, async (req, res) => {
  try {
    console.log('[check-permission] 收到請求');
    console.log('[check-permission] req.user:', req.user);
    console.log('[check-permission] req.isGuest:', req.isGuest);
    console.log('[check-permission] Authorization header:', req.headers['authorization'] ? '存在' : '不存在');
    
    if (req.isGuest || !req.user) {
      console.log('[check-permission] 用戶未登入，返回 GUEST_MODE');
      return res.json({
        success: true,
        canAnalyze: false,
        reason: 'GUEST_MODE',
        message: '肌膚檢測功能僅限會員使用',
        action: {
          type: 'REGISTER',
          message: '立即註冊即可獲得 3 次免費檢測',
          url: '/register'
        }
      });
    }

    // 查詢 profile
    const query = `
      query CheckAnalysisPermission($userId: uuid!) {
        user_profiles(where: { user_id: { _eq: $userId } }) {
          remaining_analyses
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

    if (!profile.is_active) {
      return res.json({
        success: true,
        canAnalyze: false,
        reason: 'ACCOUNT_DISABLED',
        message: '您的帳號已停用,請聯繫客服'
      });
    }

    if (profile.subscription_end && new Date(profile.subscription_end) < new Date()) {
      return res.json({
        success: true,
        canAnalyze: false,
        reason: 'SUBSCRIPTION_EXPIRED',
        message: '您的訂閱已過期',
        action: {
          type: 'RENEW',
          message: '續訂以繼續使用',
          url: '/subscribe'
        }
      });
    }

    if (profile.subscription_type === 'enterprise') {
      return res.json({
        success: true,
        canAnalyze: true,
        unlimited: true,
        message: '企業版會員享有無限次分析'
      });
    }

    if (profile.remaining_analyses <= 0) {
      return res.json({
        success: true,
        canAnalyze: false,
        reason: 'QUOTA_EXCEEDED',
        message: '分析次數已用完',
        action: {
          type: 'UPGRADE',
          message: profile.subscription_type === 'free' 
            ? '升級至專業版可獲得 50 次分析'
            : '升級方案以獲得更多分析次數',
          url: '/upgrade'
        }
      });
    }

    return res.json({
      success: true,
      canAnalyze: true,
      remaining: profile.remaining_analyses,
      subscriptionType: profile.subscription_type,
      message: `剩餘 ${profile.remaining_analyses} 次分析機會`
    });

  } catch (error) {
    console.error('權限檢查錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '權限檢查失敗'
      }
    });
  }
});

// ========================================
// AI 肌膚檢測
// ========================================
router.post(
  '/analyze',
  optionalAuth,  // 改為可選認證，未登入用戶也能使用
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_IMAGE',
            message: '請上傳圖片檔案'
          }
        });
      }

      const userEmail = req.user?.email || 'guest';
      console.log(`[${userEmail}] 開始肌膚分析...`);

      // 執行 AI 分析
      const analysisResult = await analyzer.analyzeFromBuffer(
        req.file.buffer,
        req.file.originalname
      );

      if (!analysisResult.success) {
        return res.status(400).json(analysisResult);
      }

      const summary = analyzer.generateSummary(analysisResult);
      const currentHour = new Date().getHours();
      const fengShuiInfo = getFengShuiInfo(currentHour);

      // 上傳圖片到 Nhost Storage
      let imageUrl = null;
      try {
        // 跳過圖片上傳功能，直接使用 null
        // Nhost storage API 需要特殊配置，暫時省略
        console.log('⚠️  圖片上傳功能已停用');
      } catch (uploadError) {
        console.error('圖片上傳錯誤:', uploadError);
      }

      // 儲存分析記錄
      const saveQuery = `
        mutation SaveAnalysisRecord(
          $userId: uuid!
          $imageUrl: String
          $overallScore: Int!
          $hydrationScore: Int
          $radianceScore: Int
          $firmnessScore: Int
          $textureScore: Int
          $wrinklesScore: Int
          $poresScore: Int
          $pigmentationScore: Int
          $fullAnalysisData: jsonb!
          $recommendations: jsonb!
          $analysisHour: Int!
          $fengShuiElement: String!
          $fengShuiBlessing: String!
        ) {
          insert_skin_analysis_records_one(object: {
            user_id: $userId
            image_url: $imageUrl
            overall_score: $overallScore
            hydration_score: $hydrationScore
            radiance_score: $radianceScore
            firmness_score: $firmnessScore
            texture_score: $textureScore
            wrinkles_score: $wrinklesScore
            pores_score: $poresScore
            pigmentation_score: $pigmentationScore
            full_analysis_data: $fullAnalysisData
            recommendations: $recommendations
            analysis_hour: $analysisHour
            feng_shui_element: $fengShuiElement
            feng_shui_blessing: $fengShuiBlessing
          }) {
            id
            created_at
          }
        }
      `;
      
      let recordId = null;
      let analyzedAt = new Date().toISOString();
      
      // 只有登入用戶才儲存到資料庫
      if (req.user && req.user.id) {
        const { data: recordData, error: dbError } = await graphqlRequest(saveQuery, {
          userId: req.user.id,
          imageUrl,
          overallScore: summary.overall_score,
          hydrationScore: summary.scores?.hydration,
          radianceScore: summary.scores?.radiance,
          firmnessScore: summary.scores?.firmness,
          textureScore: summary.scores?.texture,
          wrinklesScore: summary.scores?.wrinkles,
          poresScore: summary.scores?.pores,
          pigmentationScore: summary.scores?.pigmentation,
          fullAnalysisData: analysisResult.data,
          recommendations: summary.recommendations,
          analysisHour: currentHour,
          fengShuiElement: fengShuiInfo.element,
          fengShuiBlessing: fengShuiInfo.blessing
        });
        
        if (recordData?.insert_skin_analysis_records_one) {
          recordId = recordData.insert_skin_analysis_records_one.id;
          analyzedAt = recordData.insert_skin_analysis_records_one.created_at;
        }

        // 扣除分析次數
        if (req.quotaInfo && !req.quotaInfo.unlimited) {
          const deductQuery = `
            mutation DeductAnalysis($userId: uuid!) {
              update_user_profiles(
                where: { user_id: { _eq: $userId } }
                _inc: { 
                  total_analyses: 1
                  remaining_analyses: -1
                }
              ) {
                affected_rows
              }
            }
          `;
          await graphqlRequest(deductQuery, { userId: req.user.id });
        }
      } else {
        console.log('ℹ️  訪客模式 - 不儲存記錄到資料庫');
      }

      console.log(`✅ 分析完成 | 評分: ${summary.overall_score} | 用戶: ${userEmail}`);
      
      // 記錄返回數據結構以便調試
      console.log('📤 返回數據結構:', {
        hasResult: !!analysisResult.data?.result,
        resultKeys: analysisResult.data?.result ? Object.keys(analysisResult.data.result).slice(0, 5) : [],
        summaryScore: summary.overall_score,
        summaryAge: summary.skin_age
      });

      res.json({
        success: true,
        message: 'AI 肌膚分析完成',
        data: {
          recordId: recordId,
          summary: {
            overall_score: summary.overall_score,
            skin_age: summary.skin_age,
            scores: summary.scores,
            key_concerns: summary.key_concerns,
            recommendations: summary.recommendations
          },
          analysis: {
            result: analysisResult.data.result || analysisResult.data,
            face_rectangle: analysisResult.data.face_rectangle,
            face_maps: analysisResult.data.face_maps,
            sensitivity: analysisResult.data.sensitivity
          },
          fengShui: fengShuiInfo,
          quota: req.user && req.quotaInfo
            ? (req.quotaInfo.unlimited 
                ? { unlimited: true }
                : { 
                    remaining: req.quotaInfo.remaining - 1,
                    used: 1
                  })
            : { guest: true, message: '訪客模式，不計入配額' },
          imageUrl,
          analyzedAt: analyzedAt,
          userMode: req.user ? 'member' : 'guest'
        }
      });

    } catch (error) {
      console.error('分析錯誤:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ANALYSIS_ERROR',
          message: '分析過程發生錯誤',
          detail: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      });
    }
  }
);

// ========================================
// 查詢歷史分析記錄
// ========================================
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    const historyQuery = `
      query GetAnalysisHistory(
        $userId: uuid!
        $limit: Int!
        $offset: Int!
      ) {
        skin_analysis_records(
          where: { user_id: { _eq: $userId } }
          limit: $limit
          offset: $offset
          order_by: { created_at: desc }
        ) {
          id
          overall_score
          hydration_score
          radiance_score
          firmness_score
          texture_score
          image_url
          feng_shui_element
          feng_shui_blessing
          is_favorite
          created_at
        }
        skin_analysis_records_aggregate(where: { user_id: { _eq: $userId } }) {
          aggregate {
            count
          }
        }
      }
    `;
    const { data, error } = await graphqlRequest(historyQuery, {
      userId: req.user.id,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        records: data.skin_analysis_records,
        pagination: {
          total: data.skin_analysis_records_aggregate.aggregate.count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: data.skin_analysis_records_aggregate.aggregate.count > parseInt(offset) + parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('查詢歷史記錄錯誤:', error);
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
// 輔助函數
// ========================================

function getFengShuiInfo(hour) {
  const fengShuiConfig = {
    fire: { 
      hours: [7, 8, 9, 11, 12, 13], 
      element: '火',
      blessing: '離火時辰,美白提亮正當時,肌膚綻放光彩' 
    },
    water: { 
      hours: [19, 20, 21, 23, 0, 1], 
      element: '水',
      blessing: '水元素滋養,深層保濕好時機,肌膚水潤飽滿' 
    },
    earth: { 
      hours: [14, 15, 16, 17, 18], 
      element: '土',
      blessing: '土元素穩固,基礎保養最佳時,築牢美麗根基' 
    },
    metal: { 
      hours: [2, 3, 4, 5, 6], 
      element: '金',
      blessing: '金元素緊緻,抗老修復好時光,肌膚重現彈性' 
    },
    wood: { 
      hours: [9, 10, 11], 
      element: '木',
      blessing: '木元素清新,排毒淨化正當時,肌膚煥然一新' 
    }
  };

  for (const [key, config] of Object.entries(fengShuiConfig)) {
    if (config.hours.includes(hour)) {
      return {
        element: config.element,
        blessing: config.blessing,
        elementKey: key,
        hour
      };
    }
  }

  return {
    element: '平衡',
    blessing: '陰陽調和,任何時刻都是美麗時刻',
    elementKey: 'balanced',
    hour
  };
}

module.exports = router;
