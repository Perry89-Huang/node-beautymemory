# 美魔力 AI 肌膚檢測系統 - Node.js Backend

> 專業的 AI 肌膚分析服務，採用 AILabTools Skin Analysis Advanced API

## 📋 概述

這是美魔力 (BeautyMemory) 的後端服務，提供專業的 AI 肌膚檢測與分析功能。

### 主要功能

- 🔬 **全面肌膚分析**: 分析 20+ 種肌膚指標
- 🎯 **智能評分系統**: 提供 0-100 分的綜合評分
- 💡 **個性化建議**: 根據分析結果生成保養建議
- 🔄 **自動重試機制**: 確保 API 請求穩定性
- 📊 **詳細報告**: 生成 HTML 格式的分析報告

## 🚀 快速開始

### 環境要求

- Node.js 14+
- npm 或 yarn

### 安裝

```bash
cd node-beautymemory
npm install
```

### 配置環境變數

創建 `.env` 文件:

```bash
# AILabTools API Key (必需)
AILAB_API_KEY=your_ailab_api_key_here

# 或使用舊變數名稱(向後兼容)
# SULU_API_KEY=your_ailab_api_key_here

# 伺服器端口(可選)
PORT=3000

# CORS 允許的來源(可選)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# 環境(可選)
NODE_ENV=development
```

### 獲取 API Key

1. 訪問 [AILabTools](https://www.ailabtools.com/)
2. 註冊並登入帳號
3. 前往 [API Console](https://www.ailabtools.com/console)
4. 創建應用程式並獲取 API Key

### 本地運行

```bash
npm start
```

伺服器將在 `http://localhost:3000` 啟動。

## 📡 API 端點

### 1. 健康檢查
```http
GET /health
```

**回應:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-16T00:00:00.000Z",
  "uptime": 123.45,
  "environment": "development",
  "version": "1.0.0"
}
```

### 2. 系統診斷
```http
GET /api/diagnostics?test=true
```

**回應:**
```json
{
  "timestamp": "2025-11-16T00:00:00.000Z",
  "server": { ... },
  "analyzer": {
    "initialized": true,
    "api_key_set": true,
    "api_provider": "AILabTools"
  },
  "network": { ... }
}
```

### 3. 分析圖片 (檔案上傳)
```http
POST /api/analyze
Content-Type: multipart/form-data
```

**參數:**
- `image`: 圖片檔案 (JPG/JPEG, 最大 5MB)

**cURL 範例:**
```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "image=@path/to/your/image.jpg"
```

**回應:**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "skin_color": { ... },
      "skin_age": { ... },
      "eye_bags": { ... },
      "acne": { ... },
      ...
    },
    "summary": {
      "overall_score": 85,
      "key_concerns": [...],
      "recommendations": [...],
      "detailed_scores": { ... }
    }
  },
  "metadata": {
    "request_id": "...",
    "log_id": "..."
  }
}
```

### 4. 分析圖片 (Base64)
```http
POST /api/analyze-base64
Content-Type: application/json
```

**請求體:**
```json
{
  "imageData": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}
```

### 5. 成本估算
```http
GET /api/estimate-cost?count=1000
```

**回應:**
```json
{
  "success": true,
  "data": {
    "analysisCount": 1000,
    "totalCost": {
      "usd": 105.00,
      "twd": 3150
    },
    "costPerAnalysis": {
      "usd": 0.105,
      "twd": 3.15
    },
    "breakdown": [...]
  }
}
```

## 🔬 分析項目

系統會分析以下肌膚指標:

### 基礎分析
- ✅ 膚色 (Skin Color)
- ✅ 膚齡 (Skin Age)
- ✅ 膚質 (Skin Type): 油性/乾性/中性/混合性

### 眼部分析
- ✅ 雙眼皮 (Eyelids): 單/平行雙/扇形雙
- ✅ 眼袋 (Eye Pouch): 輕度/中度/嚴重
- ✅ 黑眼圈 (Dark Circles): 色素型/血管型/陰影型
- ✅ 眼部細紋 (Eye Finelines)

### 皺紋分析
- ✅ 額頭紋 (Forehead Wrinkle)
- ✅ 魚尾紋 (Crow's Feet)
- ✅ 眉間紋 (Glabella Wrinkle)
- ✅ 法令紋 (Nasolabial Fold): 含嚴重度

### 毛孔與瑕疵
- ✅ 毛孔 (Pores): 額頭/左臉頰/右臉頰/下巴
- ✅ 黑頭 (Blackhead): 輕度/中度/嚴重
- ✅ 痘痘 (Acne): 數量與位置
- ✅ 閉口粉刺 (Closed Comedones)
- ✅ 斑點 (Spots): 數量與位置
- ✅ 痣 (Mole): 數量與位置

### 進階分析
- ✅ ITA 膚色標準 (Skintone ITA)
- ✅ HA 色調標準 (Skin Hue HA)
- ✅ 敏感度分析 (Sensitivity) - 可選

## 🛠️ 開發

### 專案結構

```
node-beautymemory/
├── server.js              # Express 伺服器
├── SuluSkinAnalyzer.js   # API 封裝類別
├── package.json           # 依賴配置
├── example.js             # 使用範例
├── test.bat              # 測試腳本
├── MIGRATION_GUIDE.md    # API 遷移指南
├── TROUBLESHOOTING.md    # 故障排除指南
└── public/               # 靜態文件
```

### 核心類別: SuluSkinAnalyzer

```javascript
const SuluSkinAnalyzer = require('./SuluSkinAnalyzer');

// 初始化
const analyzer = new SuluSkinAnalyzer('your-api-key');

// 從路徑分析
const result = await analyzer.analyzeFromPath('image.jpg');

// 從 Buffer 分析
const result = await analyzer.analyzeFromBuffer(buffer, 'image.jpg');

// 從 Base64 分析
const result = await analyzer.analyzeFromBase64(base64String);

// 從 URL 分析
const result = await analyzer.analyzeFromUrl('https://example.com/image.jpg');

// 生成摘要
const summary = analyzer.generateSummary(result);

// 生成 HTML 報告
const html = analyzer.generateHtmlReport(summary);
```

### 錯誤處理

系統包含完整的錯誤處理機制:

- 🔄 **自動重試**: 網路錯誤、超時、5xx 錯誤自動重試(最多 3 次)
- ⏱️ **指數退避**: 1s → 2s → 4s 遞增延遲
- 📝 **詳細日誌**: 記錄所有請求和錯誤詳情
- 💡 **故障排除建議**: 提供具體的解決方案

## 🚢 部署到 Heroku

### 1. 準備

```bash
# 登入 Heroku
heroku login

# 創建應用
heroku create your-app-name

# 或連接現有應用
heroku git:remote -a your-app-name
```

### 2. 設置環境變數

```bash
# 設置 API Key
heroku config:set AILAB_API_KEY=your_ailab_api_key_here

# 設置 CORS (可選)
heroku config:set ALLOWED_ORIGINS=https://yourdomain.com

# 設置環境
heroku config:set NODE_ENV=production
```

### 3. 部署

```bash
# 提交代碼
git add .
git commit -m "Deploy to Heroku"

# 推送到 Heroku
git push heroku master

# 或從其他分支推送
git push heroku main:master
```

### 4. 檢查

```bash
# 查看日誌
heroku logs --tail

# 測試健康檢查
curl https://your-app-name.herokuapp.com/health

# 測試診斷
curl https://your-app-name.herokuapp.com/api/diagnostics?test=true
```

## 📊 監控與日誌

### Heroku 日誌

```bash
# 實時日誌
heroku logs --tail

# 最近 500 行
heroku logs -n 500

# 篩選錯誤
heroku logs --tail | grep "ERROR"

# 篩選成功分析
heroku logs --tail | grep "✅"
```

### 關鍵日誌訊息

- `🔧 AILabTools Skin Analyzer 配置`: 初始化成功
- `📤 準備發送 API 請求`: 開始分析
- `🔄 嘗試連接 API`: 重試過程
- `✅ API 回應成功`: 分析成功
- `❌ API 請求失敗`: 分析失敗

## 🔐 安全性

### 環境變數保護
- 永遠不要將 API Key 提交到版本控制
- 使用 `.env` 文件存儲敏感信息
- 將 `.env` 加入 `.gitignore`

### CORS 設置
```javascript
// server.js
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
```

### 檔案大小限制
- 圖片: 最大 5 MB
- JSON: 最大 10 MB

## 📚 相關文檔

- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - API 遷移指南
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 故障排除指南
- [AILabTools API 文檔](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-advanced/api)

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

ISC License

## 👥 作者

美魔力 (BeautyMemory) 團隊

## 🆘 支援

遇到問題？

1. 查看 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. 檢查 Heroku 日誌: `heroku logs --tail`
3. 測試診斷端點: `/api/diagnostics?test=true`
4. 提交 Issue 到專案儲存庫

## 📝 更新日誌

### v2.0.0 (2025-11-16)
- ✨ 遷移到 AILabTools API
- ✨ 新增自動重試機制
- ✨ 新增詳細錯誤日誌
- ✨ 新增診斷端點
- ✨ 支援更多分析項目(膚齡、毛孔、黑頭等)
- ✨ 向後兼容 SULU_API_KEY 環境變數

### v1.0.0
- 🎉 初始版本
- 🔬 基礎肌膚分析功能
- 📊 分析報告生成
