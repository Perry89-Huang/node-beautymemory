// server.js
// 美魔力 AI 肌膚檢測系統 - 主伺服器 (整合會員系統)

// 設置全局時區為台灣時間（UTC+8）
process.env.TZ = 'Asia/Taipei';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// 初始化 Nhost
const { nhost, testConnection } = require('./config/nhost');

// 路由
const membersRouter = require('./routes/members');
const analysisRouter = require('./routes/analysis');
const paymentRouter = require('./routes/payment');
const adminRouter = require('./routes/admin');
const { getTaiwanISO, formatTaiwanTime } = require('./utils/timezone');
// AI 客服系統
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// 載入知識庫
function loadKnowledgeBase() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'knowledge_base.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ 無法載入知識庫:', error.message);
    return null;
  }
}

// 初始化應用
const app = express();
const PORT = process.env.PORT || 2000;

// ========================================
// 中介層設定
// ========================================

// 安全性
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));

// CORS - 詳細設定以支援 preflight 請求
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:2000',
  'http://10.14.210.249:3000', // 區域網路訪問
  'https://beautymemory.life',
  'https://www.beautymemory.life'
];

app.use(cors({
  origin: function (origin, callback) {
    // 允許沒有 origin 的請求（如 Postman、curl）
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400 // 24 hours
}));

// 額外的 CORS headers for preflight
app.options('*', cors());

// 壓縮
app.use(compression());

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 請求日誌
app.use((req, res, next) => {
  console.log(`${getTaiwanISO()} | ${req.method} ${req.path}`);
  next();
});

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分鐘
  max: 100, // 限制 100 次請求
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: '請求過於頻繁,請稍後再試'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

// 分析 API 特殊速率限制 (更嚴格)
const analysisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小時
  max: 20, // 限制 20 次分析
  message: {
    success: false,
    error: {
      code: 'ANALYSIS_RATE_LIMIT',
      message: '分析請求過於頻繁,請稍後再試'
    }
  }
});

app.use('/api/analysis/analyze', analysisLimiter);

// ========================================
// 路由設定
// ========================================

// 首頁
app.get('/', (req, res) => {
  res.json({
    name: '美魔力 AI 肌膚檢測系統',
    version: '2.0.0',
    tagline: 'Memory = 美魔力',
    description: '結合 Perfect Corp 專業技術與九紫離火運能量',
    features: {
      authentication: '會員認證系統',
      skinAnalysis: 'AI 肌膚檢測',
      beautyMemory: '美麗記憶庫',
      fengShui: '風水時辰建議',
      achievements: '成就系統',
      aiRecommendation: 'AI 專家推薦系統',
      aiChat: 'AI 智能客服'
    },
    endpoints: {
      health: 'GET /health',
      diagnostics: 'GET /api/diagnostics',
      
      // 會員相關
      register: 'POST /api/members/register',
      login: 'POST /api/members/login',
      profile: 'GET /api/members/profile',
      quota: 'GET /api/members/quota',
      statistics: 'GET /api/members/statistics',
      
      // 肌膚檢測
      checkPermission: 'GET /api/analysis/check-permission',
      analyze: 'POST /api/analysis/analyze',
      history: 'GET /api/analysis/history',
      
      // AI 專家推薦系統
      aiSkinRecommendation: 'POST /api/ai/skin-recommendation',
      aiChat: 'POST /api/ai/chat'
    },
    documentation: 'https://docs.beauty-memory.com',
    support: 'contact@beauty-memory.com'
  });
});

// 健康檢查
app.get('/health', async (req, res) => {
  const nhostConnected = await testConnection();
  
  res.json({
    status: 'healthy',
    timestamp: getTaiwanISO(),
    services: {
      api: 'online',
      nhost: nhostConnected ? 'online' : 'offline',
      aiAnalysis: process.env.SULU_API_KEY ? 'configured' : 'not_configured'
    },
    version: '2.0.0'
  });
});

// 診斷資訊
app.get('/api/diagnostics', async (req, res) => {
  const diagnostics = {
    timestamp: getTaiwanISO(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV || 'development'
    },
    nhost: {
      subdomain: process.env.NHOST_SUBDOMAIN || 'not_configured',
      region: process.env.NHOST_REGION || 'not_configured',
      hasAdminSecret: !!process.env.NHOST_ADMIN_SECRET,
      connected: false
    },
    aiAnalysis: {
      provider: 'AILabTools',
      configured: !!process.env.SULU_API_KEY,
      apiKeyLength: (process.env.SULU_API_KEY || '').length
    },
    aiRecommendation: {
      provider: 'Anthropic Claude',
      model: 'claude-sonnet-4-20250514',
      configured: !!process.env.CLAUDE_API_KEY,
      apiKeyLength: (process.env.CLAUDE_API_KEY || '').length
    },
    features: {
      authentication: true,
      skinAnalysis: true,
      beautyMemory: true,
      fengShui: true,
      achievements: true,
      aiRecommendation: !!process.env.CLAUDE_API_KEY,
      aiChat: !!process.env.CLAUDE_API_KEY
    }
  };

  // 測試 Nhost 連線
  if (req.query.test === 'true') {
    diagnostics.nhost.connected = await testConnection();
  }

  res.json(diagnostics);
});

// 掛載路由
app.use('/api/members', membersRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/admin', adminRouter);

// ========================================
// AI 推薦系統 API
// ========================================

// AI 推薦速率限制
const aiRecommendationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 小時
  max: 30, // 限制 30 次
  message: {
    success: false,
    error: {
      code: 'AI_RATE_LIMIT',
      message: 'AI 推薦請求過於頻繁，請稍後再試'
    }
  }
});

/**
 * POST /api/ai/skin-recommendation
 * 根據肌膚分析結果提供 AI 專業推薦
 */
app.post('/api/ai/skin-recommendation', aiRecommendationLimiter, async (req, res) => {
  try {
    const { analysisResult, userQuery } = req.body;

    if (!analysisResult) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_ANALYSIS',
          message: '缺少肌膚分析結果'
        }
      });
    }

    // 載入知識庫
    const knowledgeBase = loadKnowledgeBase();
    if (!knowledgeBase) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'KNOWLEDGE_BASE_ERROR',
          message: '知識庫載入失敗'
        }
      });
    }

    // 建立專業的肌膚分析提示詞
    const skinAnalysisPrompt = createSkinAnalysisPrompt(analysisResult, knowledgeBase, userQuery);

    // 呼叫 Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: skinAnalysisPrompt
        }
      ]
    });

    const aiRecommendation = message.content[0].text;

    res.json({
      success: true,
      data: {
        recommendation: aiRecommendation,
        timestamp: getTaiwanISO(),
        model: 'claude-sonnet-4-20250514'
      }
    });

  } catch (error) {
    console.error('AI 推薦錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AI_ERROR',
        message: 'AI 推薦系統發生錯誤',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

/**
 * POST /api/ai/chat
 * 一般客服對話
 */
app.post('/api/ai/chat', aiRecommendationLimiter, async (req, res) => {
  try {
    const { message: userMessage } = req.body;

    if (!userMessage || !userMessage.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_MESSAGE',
          message: '訊息不能為空'
        }
      });
    }

    // 載入知識庫
    const knowledgeBase = loadKnowledgeBase();
    if (!knowledgeBase) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'KNOWLEDGE_BASE_ERROR',
          message: '知識庫載入失敗'
        }
      });
    }

    // 搜尋相關資訊
    const relevantInfo = searchRelevantInfo(userMessage, knowledgeBase);

    // 建立提示詞
    const prompt = createChatPrompt(userMessage, relevantInfo, knowledgeBase);

    // 呼叫 Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const aiResponse = message.content[0].text;

    res.json({
      success: true,
      data: {
        response: aiResponse,
        timestamp: getTaiwanISO(),
        relevantProducts: relevantInfo.products.length,
        relevantFAQ: relevantInfo.faq.length
      }
    });

  } catch (error) {
    console.error('AI 對話錯誤:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'AI_CHAT_ERROR',
        message: 'AI 對話系統發生錯誤',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

// ========================================
// AI 輔助函數
// ========================================

/**
 * 搜尋相關資訊
 */
function searchRelevantInfo(userQuery, knowledgeBase) {
  const relevantInfo = {
    products: [],
    faq: [],
    policies: {}
  };
  
  const queryLower = userQuery.toLowerCase();
  
  // 搜尋相關產品
  knowledgeBase.products.forEach(product => {
    const keywords = [
      product.name.toLowerCase(),
      product.category.toLowerCase(),
      '精華', '面霜', '保濕', '抗老'
    ];
    
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      relevantInfo.products.push(product);
    }
  });
  
  // 搜尋相關 FAQ
  knowledgeBase.faq.forEach(faq => {
    const questionWords = faq.question.toLowerCase().split(' ');
    if (questionWords.some(word => queryLower.includes(word))) {
      relevantInfo.faq.push(faq);
    }
  });
  
  // 搜尋政策資訊
  const shippingKeywords = ['運送', '配送', '出貨', '物流'];
  const returnKeywords = ['退貨', '退換', '退款', '換貨'];
  
  if (shippingKeywords.some(keyword => queryLower.includes(keyword))) {
    relevantInfo.policies.shipping = knowledgeBase.policies.shipping;
  }
  
  if (returnKeywords.some(keyword => queryLower.includes(keyword))) {
    relevantInfo.policies.return = knowledgeBase.policies.return;
  }
  
  return relevantInfo;
}

/**
 * 建立肌膚分析專業提示詞
 */
function createSkinAnalysisPrompt(analysisResult, knowledgeBase, userQuery) {
  // 提取關鍵肌膚問題
  const analysis = analysisResult.analysis || {};
  const skinIssues = [];
  
  // 檢測各種肌膚問題
  if (analysis.wrinkle_detection_result?.value > 0) skinIssues.push('皺紋老化');
  if (analysis.dark_circle_severity?.value > 0) skinIssues.push('黑眼圈');
  if (analysis.pigmentation?.value > 0 || analysis.spots?.value > 0) skinIssues.push('色素沉澱');
  if (analysis.acne?.value > 0) skinIssues.push('痘痘');
  if (analysis.sensitivity?.value > 0) skinIssues.push('敏感肌');
  if (analysis.pores_forehead?.value > 0) skinIssues.push('毛孔粗大');
  
  const skinTypeMap = {
    0: '油性',
    1: '乾性',
    2: '中性',
    3: '混合性'
  };
  const skinType = skinTypeMap[analysis.skin_type?.value] || '未知';
  
  const prompt = `
你是荷顏（Lotus Beauty）的資深美容專家和肌膚分析師，擁有 15 年以上的專業經驗。

【客戶肌膚檢測報告】
- 肌膚類型：${skinType}
- 肌膚年齡：${analysisResult.skin_age || '未提供'} 歲
- 整體評分：${analysisResult.overall_score || '未提供'} 分
- 檢測到的問題：${skinIssues.length > 0 ? skinIssues.join('、') : '無明顯問題'}

【詳細分析數據】
${JSON.stringify(analysis, null, 2)}

【荷顏產品系列】
${JSON.stringify(knowledgeBase.products, null, 2)}

【客戶額外諮詢】
${userQuery || '無額外問題'}

【專業分析任務】
請以資深美容專家的身份，提供以下專業分析：

1. **肌膚狀況綜合評估**（100-150字）
   - 分析主要肌膚問題及成因
   - 評估肌膚健康狀況
   - 指出需要優先改善的項目

2. **專業保養建議**（分點條列，3-5項）
   - 針對檢測到的問題提供具體建議
   - 包含日常保養步驟
   - 生活作息建議
   - 飲食營養建議

3. **荷顏產品推薦**（3-5項產品）
   對於每個推薦的產品，請提供：
   - 產品名稱
   - 推薦理由（針對客戶的具體問題）
   - 使用方法
   - 預期效果
   - 使用順序（早晚、頻率）

4. **28天改善計畫**
   - 第1週：重點任務
   - 第2週：重點任務
   - 第3週：重點任務
   - 第4週：重點任務

5. **注意事項**
   - 使用產品的注意事項
   - 可能出現的適應期反應
   - 何時需要調整方案

【回答原則】
- 使用溫暖專業的繁體中文，適度使用 emoji
- 基於實際檢測數據提供建議
- 只推薦知識庫中的荷顏產品
- 涉及醫療問題時提醒諮詢皮膚科醫師
- 說明要具體、可執行
- 語氣親切但專業

請開始你的專業分析：
`;
  
  return prompt;
}

/**
 * 建立一般客服對話提示詞
 */
function createChatPrompt(userQuery, relevantInfo, knowledgeBase) {
  const context = `
你是荷顏（Lotus Beauty）的專業 AI 客服助理。

【公司資訊】
${JSON.stringify(knowledgeBase.company_info, null, 2)}

【相關產品資訊】
${relevantInfo.products.length > 0 ? JSON.stringify(relevantInfo.products, null, 2) : "無直接相關產品"}

【相關常見問題】
${relevantInfo.faq.length > 0 ? JSON.stringify(relevantInfo.faq, null, 2) : "無直接相關 FAQ"}

【相關政策】
${Object.keys(relevantInfo.policies).length > 0 ? JSON.stringify(relevantInfo.policies, null, 2) : "無直接相關政策"}

【回答原則】
1. 使用溫暖親切的繁體中文，適度使用表情符號（不要過度）
2. 只根據以上知識庫內容回答，不要編造資訊
3. 如果知識庫沒有相關資訊，請誠實告知並建議聯繫真人客服
4. 涉及醫療建議時，提醒客戶諮詢皮膚科醫師
5. 推薦產品時要說明理由
6. 回答要簡潔明瞭，必要時使用條列式
7. 對於價格、優惠等敏感資訊，建議客戶聯繫客服確認最新資訊

【客戶問題】
${userQuery}

請以專業親切的態度回答客戶問題。
`;
  
  return context;
}

// ========================================
// 錯誤處理
// ========================================

// 404 處理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '找不到請求的資源',
      path: req.path
    }
  });
});

// 全域錯誤處理
app.use((error, req, res, next) => {
  console.error('全域錯誤:', error);

  // Multer 錯誤 (檔案上傳)
  if (error.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: '檔案大小超過 5MB 限制'
        }
      });
    }
  }

  // 其他錯誤
  res.status(error.status || 500).json({
    success: false,
    error: {
      code: error.code || 'SERVER_ERROR',
      message: error.message || '伺服器錯誤',
      detail: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  });
});

// ========================================
// 啟動伺服器
// ========================================

async function startServer() {
  try {
    console.log('\n🌟 美魔力 AI 肌膚檢測系統');
    console.log('================================\n');

    // 檢查必要環境變數
    const requiredEnvVars = [
      'NHOST_SUBDOMAIN',
      'AILAB_API_KEY'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ 缺少必要的環境變數:');
      missingVars.forEach(varName => console.error(`   - ${varName}`));
      process.exit(1);
    }

    // 測試 Nhost 連線
    console.log('📡 正在連接 Nhost...');
    const nhostConnected = await testConnection();
    
    if (!nhostConnected) {
      console.warn('⚠️  警告: Nhost 連線失敗,會員功能可能無法正常運作');
    }

    // 啟動伺服器 - 監聽所有網路介面以允許區域網路訪問
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n✅ 伺服器啟動成功!');
      console.log(`   監聽端口: ${PORT}`);
      console.log(`   監聽位址: 0.0.0.0 (允許區域網路訪問)`);
      console.log(`   環境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   時區: Asia/Taipei (台灣時間 UTC+8)`);
      console.log(`   當前時間: ${formatTaiwanTime(new Date())}`);
      console.log(`   本機訪問: http://localhost:${PORT}/`);
      console.log(`   區域網路訪問: http://10.14.210.249:${PORT}/`);
      console.log('\n📋 可用功能:');
      console.log('   ✓ 會員註冊/登入系統');
      console.log('   ✓ AI 肌膚檢測 (會員專屬)');
      console.log('   ✓ 美麗記憶庫');
      console.log('   ✓ 九紫離火運風水建議');
      console.log('   ✓ 成就系統');
      console.log('   ✓ AI 專家推薦系統 (Claude)');
      console.log('   ✓ AI 智能客服');
      console.log('\n🔗 快速開始:');
      console.log(`   註冊會員: POST http://localhost:${PORT}/api/members/register`);
      console.log(`   會員登入: POST http://localhost:${PORT}/api/members/login`);
      console.log(`   肌膚檢測: POST http://localhost:${PORT}/api/analysis/analyze`);
      console.log(`   AI 推薦: POST http://localhost:${PORT}/api/ai/skin-recommendation`);
      console.log(`   AI 客服: POST http://localhost:${PORT}/api/ai/chat`);
      console.log('\n================================\n');
    });

  } catch (error) {
    console.error('❌ 伺服器啟動失敗:', error);
    process.exit(1);
  }
}

// 優雅關機
process.on('SIGTERM', () => {
  console.log('\n📴 收到 SIGTERM 信號,正在關閉伺服器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n📴 收到 SIGINT 信號,正在關閉伺服器...');
  process.exit(0);
});

// 啟動
startServer();


module.exports = app;
