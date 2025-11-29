// server.js
// 美魔力 AI 肌膚檢測系統 + 荷顏 AI 客服系統 - Express 伺服器
// Heroku 部署版本 (整合版)

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const SuluSkinAnalyzer = require('./SuluSkinAnalyzer');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 中間件設定
// ==========================================

// CORS 設定 - 允許跨域請求
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  credentials: true
}));

// JSON 解析
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 靜態文件服務
app.use(express.static('public'));

// 請求日誌
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==========================================
// Multer 設定 - 檔案上傳 (肌膚檢測用)
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
      cb(null, true);
    } else {
      cb(new Error('只支援 JPG/JPEG 格式'));
    }
  }
});

// ==========================================
// 初始化 Skin Analyzer (肌膚檢測)
// ==========================================

let skinAnalyzer;
try {
  const apiKey = process.env.AILAB_API_KEY ;
  const apiVersion = process.env.SKIN_ANALYSIS_VERSION || 'advanced';
  skinAnalyzer = new SuluSkinAnalyzer(apiKey, apiVersion);
  console.log('✅ AILabTools Skin Analyzer 初始化成功');
} catch (error) {
  console.error('❌ Skin Analyzer 初始化失敗:', error.message);
}

// ==========================================
// 初始化 AI 客服系統
// ==========================================

let anthropic;
let knowledgeBase;

// 初始化 Claude API
try {
  anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY,
  });
  console.log('✅ Claude AI 客服初始化成功');
} catch (error) {
  console.error('❌ Claude AI 客服初始化失敗:', error.message);
}

// 載入知識庫
try {
  const knowledgeBasePath = path.join(__dirname, 'knowledge_base.json');
  if (fs.existsSync(knowledgeBasePath)) {
    const data = fs.readFileSync(knowledgeBasePath, 'utf8');
    knowledgeBase = JSON.parse(data);
    console.log(`✅ 知識庫載入成功: ${knowledgeBase.products?.length || 0} 個產品, ${knowledgeBase.faq?.length || 0} 個 FAQ`);
  } else {
    console.warn('⚠️ 找不到 knowledge_base.json，AI 客服功能將受限');
    knowledgeBase = {
      products: [],
      company_info: {
        name: "荷顏 Lotus Beauty",
        tagline: "韓國幹細胞技術 × 台灣植萃專家"
      },
      faq: [],
      policies: {}
    };
  }
} catch (error) {
  console.error('❌ 知識庫載入失敗:', error.message);
  knowledgeBase = { products: [], faq: [], policies: {} };
}

// ==========================================
// AI 客服工具函數
// ==========================================

// 搜尋相關資訊
function searchRelevantInfo(userQuery) {
  const relevantInfo = {
    products: [],
    faq: [],
    policies: {}
  };
  
  const queryLower = userQuery.toLowerCase();
  
  // 搜尋產品
  if (knowledgeBase.products) {
    knowledgeBase.products.forEach(product => {
      const keywords = [
        product.name?.toLowerCase() || '',
        product.category?.toLowerCase() || '',
        '精華', '面霜', '保濕', '抗老'
      ];
      
      if (keywords.some(keyword => keyword && queryLower.includes(keyword))) {
        relevantInfo.products.push(product);
      }
    });
  }
  
  // 搜尋 FAQ
  if (knowledgeBase.faq) {
    knowledgeBase.faq.forEach(faq => {
      const questionWords = faq.question?.toLowerCase().split(' ') || [];
      if (questionWords.some(word => word && queryLower.includes(word))) {
        relevantInfo.faq.push(faq);
      }
    });
  }
  
  // 搜尋政策
  if (knowledgeBase.policies) {
    const shippingKeywords = ['運送', '配送', '出貨', '物流'];
    const returnKeywords = ['退貨', '退換', '退款', '換貨'];
    
    if (shippingKeywords.some(keyword => queryLower.includes(keyword))) {
      relevantInfo.policies.shipping = knowledgeBase.policies.shipping;
    }
    
    if (returnKeywords.some(keyword => queryLower.includes(keyword))) {
      relevantInfo.policies.return = knowledgeBase.policies.return;
    }
  }
  
  return relevantInfo;
}

// 建立 AI 客服 Prompt
function createChatbotPrompt(userQuery, relevantInfo) {
  return `
你是荷顏(Lotus Beauty)的專業AI客服助理。

【公司資訊】
${JSON.stringify(knowledgeBase.company_info, null, 2)}

【相關產品資訊】
${relevantInfo.products.length > 0 ? JSON.stringify(relevantInfo.products, null, 2) : "無直接相關產品"}

【相關常見問題】
${relevantInfo.faq.length > 0 ? JSON.stringify(relevantInfo.faq, null, 2) : "無直接相關FAQ"}

【相關政策】
${Object.keys(relevantInfo.policies).length > 0 ? JSON.stringify(relevantInfo.policies, null, 2) : "無直接相關政策"}

【回答原則】
1. 使用溫暖親切的繁體中文,適度使用表情符號(不要過度)
2. 只根據以上知識庫內容回答,不要編造資訊
3. 如果知識庫沒有相關資訊,請誠實告知並建議聯繫真人客服
4. 涉及醫療建議時,提醒客戶諮詢皮膚科醫師
5. 推薦產品時要說明理由
6. 回答要簡潔明瞭,必要時使用條列式

【客戶問題】
${userQuery}

請以專業親切的態度回答客戶問題。
`;
}

// ==========================================
// API 路由 - 健康檢查與系統資訊
// ==========================================

// 健康檢查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '2.0.0',
    services: {
      skinAnalyzer: !!skinAnalyzer,
      aiChatbot: !!anthropic,
      knowledgeBase: !!knowledgeBase
    }
  });
});

// API 診斷端點
app.get('/api/diagnostics', async (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    server: {
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      node_version: process.version
    },
    skinAnalyzer: {
      initialized: !!skinAnalyzer,
      api_key_set: !!(process.env.AILAB_API_KEY || process.env.SULU_API_KEY),
      api_version: skinAnalyzer ? skinAnalyzer.getVersion() : null
    },
    aiChatbot: {
      initialized: !!anthropic,
      api_key_set: !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY),
      knowledge_base_products: knowledgeBase?.products?.length || 0,
      knowledge_base_faq: knowledgeBase?.faq?.length || 0
    },
    network: {
      hostname: require('os').hostname(),
      platform: process.platform
    }
  };

  res.json(diagnostics);
});

// 首頁
app.get('/', (req, res) => {
  res.json({
    name: '美魔力 AI 系統 (整合版)',
    version: '2.0.0',
    description: '專業的 AI 肌膚分析 + AI 客服服務',
    services: {
      skinAnalysis: {
        name: '美魔力 AI 肌膚檢測',
        endpoints: {
          analyze: 'POST /api/analyze',
          analyzeBase64: 'POST /api/analyze-base64',
          estimateCost: 'GET /api/estimate-cost'
        }
      },
      chatbot: {
        name: '荷顏 AI 客服',
        endpoints: {
          chat: 'POST /api/chat',
          chatStream: 'POST /api/chat/stream',
          companyInfo: 'GET /api/company-info',
          products: 'GET /api/products',
          faq: 'GET /api/faq',
          searchProducts: 'POST /api/search/products'
        }
      },
      system: {
        health: 'GET /health',
        diagnostics: 'GET /api/diagnostics'
      }
    },
    documentation: 'https://docs.beauty-memory.com'
  });
});

// ==========================================
// API 路由 - 肌膚檢測服務
// ==========================================

// POST /api/analyze - 分析圖片(檔案上傳)
app.post('/api/analyze', upload.single('image'), async (req, res) => {
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

    if (!skinAnalyzer) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI 肌膚檢測服務尚未就緒,請稍後再試'
        }
      });
    }

    const version = req.query.version || req.body.version || null;
    
    console.log(`開始分析圖片: ${req.file.originalname} (${req.file.size} bytes)`);
    if (version) {
      console.log(`使用 API 版本: ${version}`);
    }

    const result = await skinAnalyzer.analyzeFromBuffer(
      req.file.buffer,
      req.file.originalname,
      version
    );

    if (result.success) {
      const summary = skinAnalyzer.generateSummary(result);
      
      console.log(`✅ 分析成功: 整體評分 ${summary.overall_score}`);
      
      return res.json({
        success: true,
        data: {
          analysis: result.data,
          summary: summary
        },
        metadata: {
          ...result.metadata,
          api_version: version || skinAnalyzer.getVersion()
        }
      });
    } else {
      console.error(`❌ 分析失敗: ${result.error.message}`);
      return res.status(400).json(result);
    }

  } catch (error) {
    console.error('伺服器錯誤:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '伺服器處理錯誤',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

// POST /api/analyze-base64 - 分析圖片(Base64)
app.post('/api/analyze-base64', async (req, res) => {
  try {
    const { imageData, version } = req.body;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_IMAGE_DATA',
          message: '請提供 imageData (Base64 格式)'
        }
      });
    }

    if (!skinAnalyzer) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'AI 肌膚檢測服務尚未就緒,請稍後再試'
        }
      });
    }

    console.log('開始分析 Base64 圖片');
    if (version) {
      console.log(`使用 API 版本: ${version}`);
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    const result = await skinAnalyzer.analyzeFromBuffer(imageBuffer, 'base64-image.jpg', version);

    if (result.success) {
      const summary = skinAnalyzer.generateSummary(result);
      
      console.log(`✅ 分析成功: 整體評分 ${summary.overall_score}`);
      
      return res.json({
        success: true,
        data: {
          analysis: result.data,
          summary: summary
        },
        metadata: {
          ...result.metadata,
          api_version: version || skinAnalyzer.getVersion()
        }
      });
    } else {
      console.error(`❌ 分析失敗: ${result.error.message}`);
      return res.status(400).json(result);
    }

  } catch (error) {
    console.error('伺服器錯誤:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '伺服器處理錯誤',
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

// GET /api/estimate-cost - 成本估算
app.get('/api/estimate-cost', (req, res) => {
  const { count = 1000 } = req.query;
  const analysisCount = parseInt(count);

  if (isNaN(analysisCount) || analysisCount < 1) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_COUNT',
        message: 'count 必須是大於 0 的數字'
      }
    });
  }

  const pricing = {
    tier1: { max: 2000, price: 0.105 },
    tier2: { max: 6000, price: 0.08 },
    tier3: { max: Infinity, price: 0.0525 }
  };

  let totalCost = 0;
  let remaining = analysisCount;
  let breakdown = [];

  if (remaining > 0 && remaining <= pricing.tier1.max) {
    totalCost += remaining * pricing.tier1.price;
    breakdown.push({
      tier: '0-2000',
      count: remaining,
      unitPrice: pricing.tier1.price,
      subtotal: remaining * pricing.tier1.price
    });
  } else if (remaining > pricing.tier1.max) {
    const tier1Count = pricing.tier1.max;
    totalCost += tier1Count * pricing.tier1.price;
    breakdown.push({
      tier: '0-2000',
      count: tier1Count,
      unitPrice: pricing.tier1.price,
      subtotal: tier1Count * pricing.tier1.price
    });
    remaining -= tier1Count;

    if (remaining > 0 && remaining <= (pricing.tier2.max - pricing.tier1.max)) {
      totalCost += remaining * pricing.tier2.price;
      breakdown.push({
        tier: '2000-6000',
        count: remaining,
        unitPrice: pricing.tier2.price,
        subtotal: remaining * pricing.tier2.price
      });
    } else if (remaining > (pricing.tier2.max - pricing.tier1.max)) {
      const tier2Count = pricing.tier2.max - pricing.tier1.max;
      totalCost += tier2Count * pricing.tier2.price;
      breakdown.push({
        tier: '2000-6000',
        count: tier2Count,
        unitPrice: pricing.tier2.price,
        subtotal: tier2Count * pricing.tier2.price
      });
      remaining -= tier2Count;

      totalCost += remaining * pricing.tier3.price;
      breakdown.push({
        tier: '6000+',
        count: remaining,
        unitPrice: pricing.tier3.price,
        subtotal: remaining * pricing.tier3.price
      });
    }
  }

  const exchangeRate = 30;

  res.json({
    success: true,
    data: {
      analysisCount,
      totalCost: {
        usd: parseFloat(totalCost.toFixed(2)),
        twd: Math.round(totalCost * exchangeRate)
      },
      costPerAnalysis: {
        usd: parseFloat((totalCost / analysisCount).toFixed(4)),
        twd: parseFloat(((totalCost * exchangeRate) / analysisCount).toFixed(2))
      },
      breakdown
    }
  });
});

// ==========================================
// API 路由 - AI 客服服務
// ==========================================

// 取得公司資訊
app.get('/api/company-info', (req, res) => {
  res.json(knowledgeBase.company_info || {});
});

// 取得所有產品
app.get('/api/products', (req, res) => {
  res.json(knowledgeBase.products || []);
});

// 取得單一產品
app.get('/api/products/:id', (req, res) => {
  const product = knowledgeBase.products?.find(p => p.id === req.params.id);
  if (product) {
    res.json(product);
  } else {
    res.status(404).json({ error: '產品不存在' });
  }
});

// 取得 FAQ
app.get('/api/faq', (req, res) => {
  res.json(knowledgeBase.faq || []);
});

// 主要聊天 API
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    
    if (!message) {
      return res.status(400).json({ 
        success: false,
        error: '訊息不能為空' 
      });
    }

    if (!anthropic) {
      return res.status(500).json({
        success: false,
        error: 'AI 客服服務尚未就緒,請稍後再試'
      });
    }
    
    console.log(`📥 收到客服訊息: ${message}`);
    
    // 搜尋相關資訊
    const relevantInfo = searchRelevantInfo(message);
    
    // 建立提示詞
    const prompt = createChatbotPrompt(message, relevantInfo);
    
    // 準備對話歷史
    const messages = [];
    
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.forEach(item => {
        messages.push({ role: 'user', content: item.user });
        messages.push({ role: 'assistant', content: item.assistant });
      });
    }
    
    messages.push({ role: 'user', content: prompt });
    
    // 呼叫 Claude API
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.7,
      messages: messages
    });
    
    const aiResponse = response.content[0].text;
    
    console.log(`📤 AI 客服回應: ${aiResponse.substring(0, 100)}...`);
    
    res.json({
      success: true,
      response: aiResponse,
      relevantInfo: {
        productsFound: relevantInfo.products.length,
        faqFound: relevantInfo.faq.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ AI 客服錯誤:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 串流聊天 API
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: '訊息不能為空' });
    }

    if (!anthropic) {
      return res.status(500).json({ error: 'AI 客服服務尚未就緒' });
    }
    
    // 設定 SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const relevantInfo = searchRelevantInfo(message);
    const prompt = createChatbotPrompt(message, relevantInfo);
    
    // 使用 streaming API
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });
    
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && 
          chunk.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`);
      }
    }
    
    res.write('data: [DONE]\n\n');
    res.end();
    
  } catch (error) {
    console.error('❌ 串流錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// 搜尋產品
app.post('/api/search/products', (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: '搜尋關鍵字不能為空' });
  }
  
  const results = (knowledgeBase.products || []).filter(product => {
    const searchText = `${product.name} ${product.category} ${product.description}`.toLowerCase();
    return searchText.includes(query.toLowerCase());
  });
  
  res.json({
    query,
    count: results.length,
    results
  });
});

// ==========================================
// 錯誤處理
// ==========================================

// 處理 Multer 錯誤
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: '圖片大小不能超過 5 MB'
        }
      });
    }
    return res.status(400).json({
      success: false,
      error: {
        code: 'UPLOAD_ERROR',
        message: error.message
      }
    });
  }
  
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: error.message
      }
    });
  }
  
  next();
});

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
app.use((err, req, res, next) => {
  console.error('未處理的錯誤:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '伺服器內部錯誤',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
});

// ==========================================
// 啟動伺服器
// ==========================================

app.listen(PORT, () => {
  console.log('🌟 美魔力 AI 系統 (整合版)');
  console.log('================================');
  console.log(`✅ 伺服器運行於: http://localhost:${PORT}`);
  console.log(`📝 環境: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================');
  console.log('服務狀態:');
  console.log(`  🔬 AI 肌膚檢測: ${skinAnalyzer ? '✅ 已啟用' : '❌ 未啟用'}`);
  console.log(`  💬 AI 客服系統: ${anthropic ? '✅ 已啟用' : '❌ 未啟用'}`);
  console.log(`  📚 知識庫: ${knowledgeBase?.products?.length || 0} 產品, ${knowledgeBase?.faq?.length || 0} FAQ`);
  console.log('================================');
  console.log('可用端點:');
  console.log('\n🏥 系統資訊:');
  console.log('  GET  /health           - 健康檢查');
  console.log('  GET  /api/diagnostics  - 系統診斷');
  console.log('\n🔬 肌膚檢測服務:');
  console.log('  POST /api/analyze           - 分析圖片(檔案上傳)');
  console.log('  POST /api/analyze-base64    - 分析圖片(Base64)');
  console.log('  GET  /api/estimate-cost     - 成本估算');
  console.log('\n💬 AI 客服服務:');
  console.log('  POST /api/chat              - AI 聊天');
  console.log('  POST /api/chat/stream       - AI 聊天(串流)');
  console.log('  GET  /api/company-info      - 公司資訊');
  console.log('  GET  /api/products          - 所有產品');
  console.log('  GET  /api/products/:id      - 單一產品');
  console.log('  GET  /api/faq               - 常見問題');
  console.log('  POST /api/search/products   - 搜尋產品');
  console.log('================================');
});

// 優雅關閉
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM 信號,正在關閉伺服器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到 SIGINT 信號,正在關閉伺服器...');
  process.exit(0);
});

module.exports = app;
