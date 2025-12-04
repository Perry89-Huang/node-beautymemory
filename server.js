// server.js
// 美魔力 AI 肌膚檢測系統 - 主伺服器 (整合會員系統)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// 初始化 Nhost
const { nhost, testConnection } = require('./config/nhost');

// 路由
const membersRouter = require('./routes/members');
const analysisRouter = require('./routes/analysis');

// 初始化應用
const app = express();
const PORT = process.env.PORT || 3000;

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

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// 壓縮
app.use(compression());

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 請求日誌
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
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
      achievements: '成就系統'
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
      history: 'GET /api/analysis/history'
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
    timestamp: new Date().toISOString(),
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
    timestamp: new Date().toISOString(),
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
    features: {
      authentication: true,
      skinAnalysis: true,
      beautyMemory: true,
      fengShui: true,
      achievements: true
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

    // 啟動伺服器
    app.listen(PORT, () => {
      console.log('\n✅ 伺服器啟動成功!');
      console.log(`   監聽端口: ${PORT}`);
      console.log(`   環境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   API 文檔: http://localhost:${PORT}/`);
      console.log('\n📋 可用功能:');
      console.log('   ✓ 會員註冊/登入系統');
      console.log('   ✓ AI 肌膚檢測 (會員專屬)');
      console.log('   ✓ 美麗記憶庫');
      console.log('   ✓ 九紫離火運風水建議');
      console.log('   ✓ 成就系統');
      console.log('\n🔗 快速開始:');
      console.log(`   註冊會員: POST http://localhost:${PORT}/api/members/register`);
      console.log(`   會員登入: POST http://localhost:${PORT}/api/members/login`);
      console.log(`   肌膚檢測: POST http://localhost:${PORT}/api/analysis/analyze`);
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
