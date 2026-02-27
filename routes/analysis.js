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
const { getTaiwanHour, getTaiwanISO } = require('../utils/timezone');

// 生成個人化專屬保養方案
function generateSkincareRoutine(analysisData, overallScore) {
  const routine = {
    morning: [],
    evening: [],
    weekly: [],
    products: [],
    lifestyle: []
  };

  const skinType = analysisData.skin_type?.skin_type;
  const hasPores = analysisData.pores_left_cheek?.value >= 1 || analysisData.pores_right_cheek?.value >= 1;
  const hasWrinkles = analysisData.nasolabial_fold?.value >= 1 || analysisData.forehead_wrinkle?.value >= 1;
  const hasEyeIssues = analysisData.eye_pouch?.value >= 1 || analysisData.dark_circle?.value >= 1;
  const hasPigmentation = analysisData.skin_spot?.value >= 1;
  const hasAcne = analysisData.acne?.value >= 1;
  const isSensitive = analysisData.sensitivity?.sensitivity_area > 0.1;

  // 早晨保養程序
  routine.morning.push({ step: 1, name: '溫和潔面', desc: '使用溫水配合溫和潔面產品，避免過度清潔破壞肌膚屏障' });
  routine.morning.push({ step: 2, name: '荷顏靚膚液升級版', desc: '平衡肌膚水油，調理膚質，為後續保養做準備' });
  
  if (hasWrinkles || overallScore < 75) {
    routine.morning.push({ step: 3, name: '荷顏精華液', desc: '深層滋養，提升肌膚彈性，改善細紋' });
  }
  
  routine.morning.push({ step: 4, name: '荷顏防曬隔離霜 SPF50+', desc: '每日必備！抵禦紫外線傷害，預防色斑與老化' });

  // 晚間保養程序
  routine.evening.push({ step: 1, name: '深層卸妝清潔', desc: '徹底卸除彩妝與污垢，保持毛孔暢通' });
  routine.evening.push({ step: 2, name: '荷顏靚膚液升級版', desc: '二次清潔並平衡肌膚 pH 值' });
  routine.evening.push({ step: 3, name: '荷顏精華液', desc: '夜間黃金修護時間，深層滋養肌膚' });
  
  if (hasWrinkles || hasEyeIssues) {
    routine.evening.push({ step: 4, name: '荷顏煥采肌活蛋白霜', desc: '重點加強皺紋與眼周部位，配合按摩手法促進吸收' });
  } else {
    routine.evening.push({ step: 4, name: '保濕面霜', desc: '鎖住水分，修護肌膚屏障' });
  }

  // 每週保養
  if (hasPores || hasAcne) {
    routine.weekly.push({ freq: '每週 2-3 次', name: '荷顏 SOD 面膜', desc: '深層清潔毛孔，淨化肌膚，改善痘痘粉刺問題' });
  } else {
    routine.weekly.push({ freq: '每週 2-3 次', name: '荷顏 SOD 面膜', desc: '補充營養，提升肌膚光澤與彈性' });
  }

  // 推薦產品組合
  if (hasWrinkles && hasPigmentation) {
    routine.products.push('🌟 抗老淡斑套組：煥采肌活蛋白霜 + 精華液 + 防曬隔離霜');
  } else if (hasWrinkles) {
    routine.products.push('🌟 抗老修護套組：煥采肌活蛋白霜 + 精華液 + 靚膚液');
  } else if (hasPores || hasAcne) {
    routine.products.push('🌟 淨膚調理套組：靚膚液升級版 + SOD 面膜 + 溫和清潔');
  }

  if (isSensitive) {
    routine.products.push('💧 敏感肌專用：選擇溫和無刺激配方，避免含酒精或香料產品');
  }

  // 生活建議
  routine.lifestyle.push('💤 充足睡眠：每天 7-8 小時，晚上 11 點前入睡最佳');
  routine.lifestyle.push('💧 補充水分：每日至少 2000ml 白開水，促進新陳代謝');
  routine.lifestyle.push('🥗 均衡飲食：多攝取維生素 C、E，少吃油炸與高糖食物');
  routine.lifestyle.push('🏃 適度運動：每週 3 次有氧運動，促進血液循環');


  return routine;
}

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

      // 如果是登入用戶，檢查並設置配額資訊
      if (req.user && req.user.id) {
        const quotaQuery = `
          query GetUserQuota($userId: uuid!) {
            user_profiles(where: { user_id: { _eq: $userId } }) {
              remaining_analyses
              subscription_type
              is_active
            }
          }
        `;
        const { data: quotaData, error: quotaError } = await graphqlRequest(quotaQuery, { userId: req.user.id });
        
        if (!quotaError && quotaData?.user_profiles?.[0]) {
          const profile = quotaData.user_profiles[0];
          
          // 檢查帳號是否啟用
          if (!profile.is_active) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'ACCOUNT_DISABLED',
                message: '您的帳號已停用，請聯繫客服'
              }
            });
          }
          
          // 企業版無限次數
          if (profile.subscription_type === 'enterprise') {
            req.quotaInfo = {
              hasQuota: true,
              remaining: -1,
              unlimited: true
            };
          } else {
            // 檢查剩餘次數
            if (profile.remaining_analyses <= 0) {
              return res.status(403).json({
                success: false,
                error: {
                  code: 'QUOTA_EXCEEDED',
                  message: '分析次數已用完',
                  subscriptionType: profile.subscription_type,
                  upgradeMessage: profile.subscription_type === 'free' 
                    ? '升級至專業版可獲得更多分析次數'
                    : '請聯繫客服升級方案'
                }
              });
            }
            
            req.quotaInfo = {
              hasQuota: true,
              remaining: profile.remaining_analyses,
              unlimited: false
            };
          }
        }
      }

      // 執行 AI 分析
      const analysisResult = await analyzer.analyzeFromBuffer(
        req.file.buffer,
        req.file.originalname
      );

      if (!analysisResult.success) {
        // 提供更友善的錯誤訊息
        const errorCode = analysisResult.error?.code || analysisResult.error_code_str;
        let userMessage = '圖片分析失敗';
        let suggestions = [];

        if (errorCode === 'PROCESSING_FAILURE') {
          userMessage = '圖片無法分析，請檢查以下條件：';
          suggestions = [
            '✓ 確保臉部清晰可見，無遮擋物（口罩、眼鏡、瀏海等）',
            '✓ 光線充足均勻，避免過亮或過暗',
            '✓ 正面拍攝，臉部佔畫面 60% 以上',
            '✓ 使用 JPG/JPEG 格式，檔案大小 100KB-5MB',
            '✓ 圖片解析度建議 800x800 以上'
          ];
        } else if (errorCode === 'INVALID_IMAGE_FORMAT') {
          userMessage = '圖片格式不支援';
          suggestions = ['請使用 JPG 或 JPEG 格式的圖片'];
        } else if (errorCode === 'IMAGE_TOO_LARGE') {
          userMessage = '圖片檔案過大';
          suggestions = ['請將圖片壓縮至 5MB 以下'];
        }

        return res.status(400).json({
          success: false,
          error: {
            code: errorCode || 'ANALYSIS_FAILED',
            message: userMessage,
            suggestions: suggestions,
            detail: analysisResult.error?.message || analysisResult.error_msg
          }
        });
      }

      const summary = analyzer.generateSummary(analysisResult);
      
      // 生成個人化專屬保養方案
      const skincareRoutine = generateSkincareRoutine(
        analysisResult.data, 
        summary.overall_score
      );

      // 上傳圖片到 Nhost Storage
      let imageUrl = null;
      try {
        const FormData = require('form-data');
        const NHOST_SUBDOMAIN = process.env.NHOST_SUBDOMAIN;
        const NHOST_REGION    = process.env.NHOST_REGION || 'ap-southeast-1';
        const uploadForm = new FormData();
        uploadForm.append('file[]', req.file.buffer, {
          filename: `skin_${Date.now()}.jpg`,
          contentType: req.file.mimetype || 'image/jpeg'
        });
        const uploadResp = await axios.post(
          `https://${NHOST_SUBDOMAIN}.storage.${NHOST_REGION}.nhost.run/v1/files`,
          uploadForm,
          {
            headers: {
              ...uploadForm.getHeaders(),
              'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
            },
            timeout: 15000
          }
        );
        const fileId = uploadResp.data?.processedFiles?.[0]?.id;
        if (fileId) {
          imageUrl = `https://${NHOST_SUBDOMAIN}.storage.${NHOST_REGION}.nhost.run/v1/files/${fileId}`;
          console.log('✅ 圖片已上傳至 Nhost Storage:', imageUrl);
        }
      } catch (uploadError) {
        console.warn('⚠️  圖片上傳失敗（分析結果仍有效）:', uploadError.message);
      }

      // 接收前端縮圖（base64 data URL），存入 full_analysis_data
      const thumbnailData = req.body?.thumbnail || null;

      // 儲存分析記錄
      const saveQuery = `
        mutation SaveAnalysisRecord(
          $userId: uuid!
          $imageUrl: String
          $overallScore: Int!
          $skinAge: Int
          $hydrationScore: Int
          $radianceScore: Int
          $firmnessScore: Int
          $textureScore: Int
          $wrinklesScore: Int
          $poresScore: Int
          $pigmentationScore: Int
          $fullAnalysisData: jsonb!
          $recommendations: jsonb!
          $skincareRoutine: jsonb!
          $analysisHour: Int!
          $createdAt: timestamp
        ) {
          insert_skin_analysis_records_one(object: {
            user_id: $userId
            image_url: $imageUrl
            overall_score: $overallScore
            skin_age: $skinAge
            hydration_score: $hydrationScore
            radiance_score: $radianceScore
            firmness_score: $firmnessScore
            texture_score: $textureScore
            wrinkles_score: $wrinklesScore
            pores_score: $poresScore
            pigmentation_score: $pigmentationScore
            full_analysis_data: $fullAnalysisData
            recommendations: $recommendations
            skincare_routine: $skincareRoutine
            analysis_hour: $analysisHour
            created_at: $createdAt
          }) {
            id
            created_at
          }
        }
      `;
      
      let recordId = null;
      let analyzedAt = getTaiwanISO();
      
      // 只有登入用戶才儲存到資料庫
      if (req.user && req.user.id) {
        const { data: recordData, error: dbError } = await graphqlRequest(saveQuery, {
          userId: req.user.id,
          imageUrl,
          overallScore: summary.overall_score,
          skinAge: summary.skin_age,
          hydrationScore: summary.scores?.hydration,
          radianceScore: summary.scores?.radiance,
          firmnessScore: summary.scores?.firmness,
          textureScore: summary.scores?.texture,
          wrinklesScore: summary.scores?.wrinkles,
          poresScore: summary.scores?.pores,
          pigmentationScore: summary.scores?.pigmentation,
          fullAnalysisData: thumbnailData
            ? { ...analysisResult.data, _thumbnail: thumbnailData }
            : analysisResult.data,
          recommendations: summary.recommendations,
          skincareRoutine: skincareRoutine,
          analysisHour: getTaiwanHour(),
          createdAt: getTaiwanISO()
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
          raw_pro_api_response: analysisResult.raw_string || null,
          skincareRoutine: skincareRoutine,
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
// 查詢歷史分析記錄（增強版）
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
          skin_age
          hydration_score
          radiance_score
          firmness_score
          texture_score
          wrinkles_score
          pores_score
          pigmentation_score
          image_url
          feng_shui_element
          feng_shui_blessing
          is_favorite
          created_at
          full_analysis_data
          recommendations
          skincare_routine
        }
        skin_analysis_records_aggregate(where: { user_id: { _eq: $userId } }) {
          aggregate {
            count
            avg {
              overall_score
            }
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
        },
        statistics: {
          totalRecords: data.skin_analysis_records_aggregate.aggregate.count,
          averageScore: data.skin_analysis_records_aggregate.aggregate.avg?.overall_score?.toFixed(1)
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
// 查詢單筆詳細記錄
// ========================================
router.get('/history/:recordId', authenticateToken, async (req, res) => {
  try {
    const { recordId } = req.params;

    const detailQuery = `
      query GetRecordDetail($recordId: uuid!, $userId: uuid!) {
        skin_analysis_records_by_pk(id: $recordId) {
          id
          user_id
          overall_score
          hydration_score
          radiance_score
          firmness_score
          texture_score
          wrinkles_score
          pores_score
          pigmentation_score
          image_url
          feng_shui_element
          feng_shui_blessing
          is_favorite
          created_at
          full_analysis_data
          recommendations
          skincare_routine
        }
      }
    `;
    
    const { data, error } = await graphqlRequest(detailQuery, {
      recordId,
      userId: req.user.id
    });

    if (error) {
      throw error;
    }

    const record = data.skin_analysis_records_by_pk;
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RECORD_NOT_FOUND',
          message: '找不到該記錄'
        }
      });
    }

    // 確保只有記錄擁有者可以查看
    if (record.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '無權查看該記錄'
        }
      });
    }

    res.json({
      success: true,
      data: record
    });

  } catch (error) {
    console.error('查詢記錄詳情錯誤:', error);
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

module.exports = router;
