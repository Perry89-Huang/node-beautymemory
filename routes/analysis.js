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
      const thumbnailData  = req.body?.thumbnail || null;
      // 接收拍照時的原始畫布尺寸，用於 CompareView 臉部對齊
      const captureSizeRaw = req.body?.capture_size || null;
      const captureSize    = captureSizeRaw
        ? (typeof captureSizeRaw === 'string' ? JSON.parse(captureSizeRaw) : captureSizeRaw)
        : null;

      // ── 用 sharp 壓縮 face_maps，直接存入 DB（無需 Storage 容量）─────────────
      // 每張壓縮至 400px 寬、JPEG Q55，約 15-40 KB / 張（原始約 100-400 KB）
      // 6 張合計約 90-240 KB，在 Hasura JSONB 欄位可接受範圍內
      const sharp = require('sharp');
      let compressedFaceMaps = {};
      // ⚠️ AILab Pro API 將 face_maps 放在 result 內部（data.result.face_maps），
      //    而非頂層 data.face_maps（後者為 null）。需從 result 內讀取。
      const rawFaceMaps = analysisResult.data?.result?.face_maps || analysisResult.data?.face_maps;
      console.log(`🗺️ rawFaceMaps 來源: ${analysisResult.data?.result?.face_maps ? 'result內部' : analysisResult.data?.face_maps ? '頂層' : '無'}, keys: ${rawFaceMaps ? Object.keys(rawFaceMaps).join(', ') : '(無)'}`);
      if (rawFaceMaps) {
        const faceMapKeys = [
          'texture_enhanced_oily_area',
          'water_area',
          'brown_area',
          'texture_enhanced_lines',
          'red_area',
          'roi_outline_map'
        ];
        await Promise.all(faceMapKeys.map(async (key) => {
          const base64Data = rawFaceMaps[key];
          if (!base64Data) return;
          try {
            const pureBase64 = base64Data.replace(/^data:image\/[a-z+]+;base64,/, '');
            const imgBuffer  = Buffer.from(pureBase64, 'base64');
            const compressed = await sharp(imgBuffer)
              .resize({ width: 400, withoutEnlargement: true })
              .jpeg({ quality: 55 })
              .toBuffer();
            compressedFaceMaps[key] = `data:image/jpeg;base64,${compressed.toString('base64')}`;
          } catch (compressErr) {
            console.warn(`⚠️  face_map[${key}] 壓縮失敗，跳過:`, compressErr.message);
          }
        }));
        const count = Object.keys(compressedFaceMaps).length;
        if (count > 0) {
          console.log(`✅ face_maps 已壓縮完成 (${count} 張)，將存入 DB`);
        }
      }

      // ── 六力分數：直接使用 AILabTools Pro API 原始分數 ──────────────────
      const scoreInfo = analysisResult.data?.result?.score_info || {};
      const sixForceScores = {
        oil:         Math.round(scoreInfo.oily_intensity_score ?? 50),
        moisture:    Math.round(scoreInfo.water_score          ?? 50),
        pigment:     Math.round(scoreInfo.melanin_score        ?? 50),
        wrinkle:     Math.round(scoreInfo.wrinkle_score        ?? 50),
        sensitivity: Math.round(scoreInfo.sensitivity_score    ?? 50),
        acne:        Math.round(scoreInfo.acne_score           ?? 50),
      };

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
          $scoreOil: Int
          $scoreMoisture: Int
          $scorePigment: Int
          $scoreWrinkle: Int
          $scoreSensitivity: Int
          $scoreAcne: Int
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
            score_oil: $scoreOil
            score_moisture: $scoreMoisture
            score_pigment: $scorePigment
            score_wrinkle: $scoreWrinkle
            score_sensitivity: $scoreSensitivity
            score_acne: $scoreAcne
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
      let recordSaved = false;

      // 只有登入用戶才儲存到資料庫
      if (req.user && req.user.id) {
        try {
          // 移除 face_maps（大型 base64 圖片），避免 JSONB 欄位過大導致 Hasura 拒絕或查詢緩慢
          // face_maps 在 AILab API 中存於 result 內部，以及可能的頂層，兩處都需清除
          const analysisDataForDB = { ...analysisResult.data };
          delete analysisDataForDB.face_maps;  // 頂層（通常為 null，預防性清除）
          if (analysisDataForDB.result?.face_maps) {
            // result 內部有 face_maps（raw base64，很大），需深拷貝後移除
            analysisDataForDB.result = { ...analysisDataForDB.result };
            delete analysisDataForDB.result.face_maps;
          }
          // 壓縮版 face_maps 將以 compressedFaceMaps 獨立欄位存回
          const faceMapCount = Object.keys(compressedFaceMaps).length;
          console.log(`💾 準備存入 DB：compressedFaceMaps 有 ${faceMapCount} 張, result.face_maps 已清除`);

          const { data: recordData } = await graphqlRequest(saveQuery, {
            userId: req.user.id,
            imageUrl,
            overallScore: Math.round(scoreInfo.total_score || summary.overall_score || 0),
            skinAge: summary.skin_age ? Math.round(summary.skin_age) : null,
            hydrationScore: summary.scores?.hydration ? Math.round(summary.scores.hydration) : null,
            radianceScore: summary.scores?.radiance ? Math.round(summary.scores.radiance) : null,
            firmnessScore: summary.scores?.firmness ? Math.round(summary.scores.firmness) : null,
            textureScore: summary.scores?.texture ? Math.round(summary.scores.texture) : null,
            wrinklesScore: summary.scores?.wrinkles ? Math.round(summary.scores.wrinkles) : null,
            poresScore: summary.scores?.pores ? Math.round(summary.scores.pores) : null,
            pigmentationScore: summary.scores?.pigmentation ? Math.round(summary.scores.pigmentation) : null,
            // 六力分數（對應 SkinAnalysisReport 雷達圖）
            scoreOil:         sixForceScores.oil,
            scoreMoisture:    sixForceScores.moisture,
            scorePigment:     sixForceScores.pigment,
            scoreWrinkle:     sixForceScores.wrinkle,
            scoreSensitivity: sixForceScores.sensitivity,
            scoreAcne:        sixForceScores.acne,
            fullAnalysisData: {
              ...analysisDataForDB,
              face_maps: compressedFaceMaps,
              ...(thumbnailData  ? { _thumbnail: thumbnailData }   : {}),
              ...(captureSize    ? { _capture_size: captureSize }  : {}),
            },
            recommendations: summary.recommendations,
            skincareRoutine: skincareRoutine,
            analysisHour: getTaiwanHour(),
            createdAt: getTaiwanISO()
          });

          if (recordData?.insert_skin_analysis_records_one) {
            recordId = recordData.insert_skin_analysis_records_one.id;
            analyzedAt = recordData.insert_skin_analysis_records_one.created_at;
            recordSaved = true;
            console.log(`✅ 分析記錄已儲存 | recordId: ${recordId}`);
          } else {
            console.error('⚠️ DB save returned null - record may not have been inserted (check Hasura permissions or constraints)');
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
        } catch (saveError) {
          // DB 儲存失敗不影響分析結果回傳，但要記錄錯誤供偵錯
          console.error('❌ DB save failed (analysis result will still be returned to user):', saveError.message);
          if (saveError.errors) {
            console.error('   GraphQL errors:', JSON.stringify(saveError.errors));
          }
        }
      } else {
        console.log('ℹ️  訪客模式 - 不儲存記錄到資料庫');
      }

      const finalOverallScore = Math.round(scoreInfo.total_score || summary.overall_score || 0);
      console.log(`✅ 分析完成 | 評分: ${finalOverallScore} | 用戶: ${userEmail}`);

      // 記錄返回數據結構以便調試
      console.log('📤 返回數據結構:', {
        hasResult: !!analysisResult.data?.result,
        resultKeys: analysisResult.data?.result ? Object.keys(analysisResult.data.result).slice(0, 5) : [],
        summaryScore: finalOverallScore,
        summaryAge: summary.skin_age
      });

      res.json({
        success: true,
        message: 'AI 肌膚分析完成',
        data: {
          recordId: recordId,
          summary: {
            overall_score: finalOverallScore,
            skin_age: summary.skin_age,
            scores: summary.scores,
            key_concerns: summary.key_concerns,
            recommendations: summary.recommendations
          },
          analysis: {
            result: analysisResult.data.result || analysisResult.data,
            face_rectangle: analysisResult.data.face_rectangle,
            // AILab Pro API puts face_maps inside result, not at top level.
            // Return the already-compressed maps (each value is a full data URL).
            face_maps: compressedFaceMaps,
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
          userMode: req.user ? 'member' : 'guest',
          recordSaved: recordSaved
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
          score_oil
          score_moisture
          score_pigment
          score_wrinkle
          score_sensitivity
          score_acne
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
// 兩筆記錄對比分析
// ========================================
router.get('/compare', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.query; // "uuid1,uuid2"
    if (!ids) return res.status(400).json({ success: false, error: { code: 'MISSING_IDS', message: '缺少 ids 參數' } });

    const idList = ids.split(',').map(s => s.trim()).filter(Boolean);
    if (idList.length !== 2) return res.status(400).json({ success: false, error: { code: 'INVALID_IDS', message: '需要恰好 2 個 id' } });

    const query = `
      query GetCompareRecords($id1: uuid!, $id2: uuid!) {
        r1: skin_analysis_records(where: { id: { _eq: $id1 } }, limit: 1) {
          id user_id created_at overall_score skin_age
          score_oil score_moisture score_pigment score_wrinkle score_sensitivity score_acne
          full_analysis_data
        }
        r2: skin_analysis_records(where: { id: { _eq: $id2 } }, limit: 1) {
          id user_id created_at overall_score skin_age
          score_oil score_moisture score_pigment score_wrinkle score_sensitivity score_acne
          full_analysis_data
        }
      }
    `;
    const { data, error } = await graphqlRequest(query, {
      id1: idList[0], id2: idList[1]
    });
    if (error) throw error;

    // r1/r2 are arrays (from `where` query), take first element
    const r1 = data?.r1?.[0];
    const r2 = data?.r2?.[0];
    if (!r1 || !r2) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: '找不到指定記錄' } });
    if (r1.user_id !== req.user.id || r2.user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '無權查看' } });
    }

    // 確保 r1 = 較早, r2 = 較晚
    const [older, newer] = new Date(r1.created_at) <= new Date(r2.created_at) ? [r1, r2] : [r2, r1];

    const extractRecord = (r) => ({
      id: r.id,
      date: r.created_at.slice(0, 10),
      datetime: r.created_at,
      overall_score: r.overall_score,
      skin_age: r.skin_age,
      scores: {
        oil: r.score_oil, moisture: r.score_moisture, pigment: r.score_pigment,
        wrinkle: r.score_wrinkle, sensitivity: r.score_sensitivity, acne: r.score_acne
      },
      thumbnail:     r.full_analysis_data?._thumbnail     || null,
      capture_size:  r.full_analysis_data?._capture_size  || null,
      face_rectangle: r.full_analysis_data?.face_rectangle || null,
    });

    const before = extractRecord(older);
    const after  = extractRecord(newer);

    const delta = {
      overall:     after.overall_score - before.overall_score,
      oil:         (after.scores.oil         ?? 0) - (before.scores.oil         ?? 0),
      moisture:    (after.scores.moisture    ?? 0) - (before.scores.moisture    ?? 0),
      pigment:     (after.scores.pigment     ?? 0) - (before.scores.pigment     ?? 0),
      wrinkle:     (after.scores.wrinkle     ?? 0) - (before.scores.wrinkle     ?? 0),
      sensitivity: (after.scores.sensitivity ?? 0) - (before.scores.sensitivity ?? 0),
      acne:        (after.scores.acne        ?? 0) - (before.scores.acne        ?? 0),
    };

    res.json({
      success: true,
      data: {
        before,
        after,
        delta,
        days_between: Math.round((new Date(after.datetime) - new Date(before.datetime)) / 86400000)
      }
    });

  } catch (error) {
    console.error('對比查詢錯誤:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: '對比查詢失敗' } });
  }
});

// ========================================
// 肌膚趨勢分析
// ========================================
router.get('/trend', authenticateToken, async (req, res) => {
  try {
    const { range = '30d' } = req.query;

    // 計算日期範圍
    let intervalClause = '';
    if (range === '7d')  intervalClause = '7 days';
    else if (range === '30d') intervalClause = '30 days';
    else if (range === '90d') intervalClause = '90 days';
    // 'all' → 不過濾

    const whereClause = intervalClause
      ? `{ user_id: { _eq: $userId }, created_at: { _gte: $since } }`
      : `{ user_id: { _eq: $userId } }`;

    const trendQuery = `
      query GetSkinTrend($userId: uuid!, $since: timestamp) {
        skin_analysis_records(
          where: ${whereClause}
          order_by: { created_at: asc }
        ) {
          id
          overall_score
          skin_age
          score_oil
          score_moisture
          score_pigment
          score_wrinkle
          score_sensitivity
          score_acne
          created_at
        }
      }
    `;

    const since = intervalClause
      ? new Date(Date.now() - parseDays(range) * 86400000).toISOString()
      : undefined;

    const { data, error } = await graphqlRequest(trendQuery, {
      userId: req.user.id,
      ...(since ? { since } : {})
    });

    if (error) throw error;

    const records = data.skin_analysis_records || [];

    if (records.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: { total_records: 0 },
          timeline: [],
          milestones: []
        }
      });
    }

    // 建立趨勢時間線
    const timeline = records.map(r => ({
      id: r.id,
      date: r.created_at.slice(0, 10),
      datetime: r.created_at,
      overall_score: r.overall_score,
      skin_age: r.skin_age,
      scores: {
        oil:         r.score_oil,
        moisture:    r.score_moisture,
        pigment:     r.score_pigment,
        wrinkle:     r.score_wrinkle,
        sensitivity: r.score_sensitivity,
        acne:        r.score_acne
      }
    }));

    // 計算 summary
    const first = records[0];
    const last  = records[records.length - 1];
    const overallChange = last.overall_score - first.overall_score;

    // 連續檢測週數（每週至少一筆）
    const streakWeeks = calcStreakWeeks(records.map(r => r.created_at));

    // 里程碑
    const milestones = buildMilestones(records, streakWeeks);

    res.json({
      success: true,
      data: {
        summary: {
          total_records: records.length,
          first_date: first.created_at.slice(0, 10),
          latest_date: last.created_at.slice(0, 10),
          overall_change: overallChange,
          streak_weeks: streakWeeks
        },
        timeline,
        milestones
      }
    });

  } catch (error) {
    console.error('趨勢查詢錯誤:', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: '趨勢查詢失敗' }
    });
  }
});

// ========================================
// 輔助函數
// ========================================

function parseDays(range) {
  if (range === '7d')  return 7;
  if (range === '30d') return 30;
  if (range === '90d') return 90;
  return 365;
}

function calcStreakWeeks(timestamps) {
  if (!timestamps.length) return 0;
  // 取每週的 ISO week number，看連續幾週有記錄
  const weeks = new Set(
    timestamps.map(ts => {
      const d = new Date(ts);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      return `${d.getFullYear()}-W${Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)}`;
    })
  );

  const sorted = Array.from(weeks).sort().reverse();
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const [yr1, w1] = sorted[i - 1].split('-W').map(Number);
    const [yr2, w2] = sorted[i].split('-W').map(Number);
    const diff = (yr1 - yr2) * 52 + (w1 - w2);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

function buildMilestones(records, streakWeeks) {
  const milestones = [];
  if (streakWeeks >= 4) {
    milestones.push({ type: 'streak', value: streakWeeks, label: `連續 ${streakWeeks} 週定期檢測` });
  }

  const dims = ['score_oil','score_moisture','score_pigment','score_wrinkle','score_sensitivity','score_acne'];
  const dimLabels = { score_oil:'控油力', score_moisture:'保濕力', score_pigment:'淨白力', score_wrinkle:'抗老力', score_sensitivity:'修護力', score_acne:'抗痘力' };

  if (records.length >= 2) {
    const first = records[0];
    const last  = records[records.length - 1];

    dims.forEach(dim => {
      if (first[dim] != null && last[dim] != null) {
        const change = last[dim] - first[dim];
        if (change >= 10) {
          milestones.push({ type: 'improvement', dimension: dim, change, label: `${dimLabels[dim]}提升 ${change} 分` });
        }
      }
    });

    const overallChange = last.overall_score - first.overall_score;
    if (overallChange > 0) {
      milestones.push({ type: 'overall', change: overallChange, label: `肌膚總分提升 ${overallChange} 分` });
    }
  }

  return milestones;
}

module.exports = router;
