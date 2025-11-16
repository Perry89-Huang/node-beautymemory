// server.js
// 美魔力 AI 肌膚檢測系統 - Express 伺服器
// Heroku 部署版本

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const SuluSkinAnalyzer = require('./SuluSkinAnalyzer');

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

// 靜態文件服務(如果有前端)
app.use(express.static('public'));

// 請求日誌
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==========================================
// Multer 設定 - 檔案上傳
// ==========================================

// 使用記憶體存儲(Heroku 檔案系統是臨時的)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB
  },
  fileFilter: (req, file, cb) => {
    // 只接受 JPG/JPEG
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
      cb(null, true);
    } else {
      cb(new Error('只支援 JPG/JPEG 格式'));
    }
  }
});

// ==========================================
// 初始化 Analyzer
// ==========================================

let analyzer;
try {
  // 支援兩種環境變數名稱 (AILAB_API_KEY 優先，向後兼容 SULU_API_KEY)
  const apiKey = process.env.AILAB_API_KEY || process.env.SULU_API_KEY;
  analyzer = new SuluSkinAnalyzer(apiKey);
  console.log('✅ AILabTools Skin Analyzer 初始化成功');
} catch (error) {
  console.error('❌ Analyzer 初始化失敗:', error.message);
  console.error('請確認 AILAB_API_KEY (或 SULU_API_KEY) 環境變數已設定');
}

// ==========================================
// API 路由
// ==========================================

// 健康檢查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
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
    analyzer: {
      initialized: !!analyzer,
      api_key_set: !!(process.env.AILAB_API_KEY || process.env.SULU_API_KEY),
      api_key_length: (process.env.AILAB_API_KEY || process.env.SULU_API_KEY || '').length,
      api_provider: 'AILabTools'
    },
    network: {
      hostname: require('os').hostname(),
      platform: process.platform
    }
  };

  // 測試 API 連接(可選)
  if (analyzer && req.query.test === 'true') {
    try {
      const axios = require('axios');
      const testStart = Date.now();
      
      // 簡單的 ping 測試
      await axios.get('https://www.ailabapi.com', {
        timeout: 5000,
        validateStatus: () => true
      });
      
      diagnostics.network.api_reachable = true;
      diagnostics.network.api_response_time = Date.now() - testStart;
    } catch (error) {
      diagnostics.network.api_reachable = false;
      diagnostics.network.api_error = {
        code: error.code,
        message: error.message
      };
    }
  }

  res.json(diagnostics);
});

// 首頁
app.get('/', (req, res) => {
  res.json({
    name: '美魔力 AI 肌膚檢測系統',
    version: '1.0.0',
    description: '專業的 AI 肌膚分析服務',
    endpoints: {
      health: 'GET /health',
      diagnostics: 'GET /api/diagnostics?test=true',
      analyze: 'POST /api/analyze',
      analyzeBase64: 'POST /api/analyze-base64',
      estimateCost: 'GET /api/estimate-cost'
    },
    documentation: 'https://docs.beauty-memory.com'
  });
});

// POST /api/analyze - 分析圖片(檔案上傳)
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    // 檢查是否有上傳檔案
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_IMAGE',
          message: '請上傳圖片檔案'
        }
      });
    }

    // 檢查 analyzer 是否已初始化
    if (!analyzer) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'API 服務尚未就緒,請稍後再試'
        }
      });
    }

    console.log(`開始分析圖片: ${req.file.originalname} (${req.file.size} bytes)`);

    // 使用 Buffer 進行分析
    const result = await analyzer.analyzeFromBuffer(
      req.file.buffer,
      req.file.originalname
    );

    // 如果分析成功,生成摘要
    if (result.success) {
      const summary = analyzer.generateSummary(result);
      
      console.log(`✅ 分析成功: 整體評分 ${summary.overall_score}`);
      
      return res.json({
        success: true,
        data: {
          analysis: result.data,
          summary: summary
        },
        metadata: result.metadata
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
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_IMAGE_DATA',
          message: '請提供 imageData (Base64 格式)'
        }
      });
    }

    if (!analyzer) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'API 服務尚未就緒,請稍後再試'
        }
      });
    }

    console.log('開始分析 Base64 圖片');

    const result = await analyzer.analyzeFromBase64(imageData);

    if (result.success) {
      const summary = analyzer.generateSummary(result);
      
      console.log(`✅ 分析成功: 整體評分 ${summary.overall_score}`);
      
      return res.json({
        success: true,
        data: {
          analysis: result.data,
          summary: summary
        },
        metadata: result.metadata
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

  // 根據 Sulu 定價估算(這些數字需要根據實際定價調整)
  const pricing = {
    tier1: { max: 2000, price: 0.105 },   // 0-2000
    tier2: { max: 6000, price: 0.08 },    // 2000-6000
    tier3: { max: Infinity, price: 0.0525 } // 6000+
  };

  let totalCost = 0;
  let remaining = analysisCount;
  let breakdown = [];

  // 計算各層級成本
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

  const exchangeRate = 30; // USD to TWD

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
  console.log('🌟 美魔力 AI 肌膚檢測系統');
  console.log('================================');
  console.log(`✅ 伺服器運行於: http://localhost:${PORT}`);
  console.log(`📝 環境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API Key 已設定: ${analyzer ? '是' : '否'}`);
  console.log('================================');
  console.log('可用端點:');
  console.log(`  GET  /health           - 健康檢查`);
  console.log(`  GET  /api/diagnostics  - 系統診斷`);
  console.log(`  POST /api/analyze      - 分析圖片(檔案上傳)`);
  console.log(`  POST /api/analyze-base64 - 分析圖片(Base64)`);
  console.log(`  GET  /api/estimate-cost - 成本估算`);
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
