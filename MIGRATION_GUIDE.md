# API 遷移指南: Sulu → AILabTools

## 📋 概述

由於原 Sulu API 已關閉，我們已將系統遷移至 **AILabTools Skin Analysis Advanced API**。

## 🔄 主要變更

### 1. API 提供商
- **舊**: Sulu API (`skin-analyze.p.sulu.sh`)
- **新**: AILabTools API (`www.ailabapi.com`)

### 2. 環境變數
- **新變數名稱**: `AILAB_API_KEY` (推薦)
- **舊變數名稱**: `SULU_API_KEY` (仍支援，向後兼容)

### 3. API 認證方式
- **舊**: `Authorization: Bearer <token>`
- **新**: `ailabapi-api-key: <token>`

### 4. API Endpoint
- **舊**: `/portrait/analysis/skinanalyze`
- **新**: `/api/portrait/analysis/skin-analysis-advanced`

## 🚀 遷移步驟

### Heroku 環境

#### 方法 1: 設置新的環境變數 (推薦)
```bash
# 設置新的 API Key
heroku config:set AILAB_API_KEY=your_ailab_api_key_here

# 確認設置成功
heroku config:get AILAB_API_KEY

# 移除舊的環境變數(可選)
heroku config:unset SULU_API_KEY
```

#### 方法 2: 繼續使用舊變數名稱
```bash
# 系統會自動檢測 SULU_API_KEY 並使用新的 AILabTools API
heroku config:set SULU_API_KEY=your_ailab_api_key_here
```

### 本地開發環境

#### 創建 .env 文件
```bash
# .env
AILAB_API_KEY=your_ailab_api_key_here

# 或使用舊名稱(向後兼容)
# SULU_API_KEY=your_ailab_api_key_here
```

## 📊 API 回應格式變更

### 新增欄位
AILabTools 提供了更詳細的分析結果:

1. **膚齡** (`skin_age`)
   - 提供具體的膚齡數值

2. **進階膚色標準**
   - `skintone_ita`: ITA (Individual Typology Angle) 標準
   - `skin_hue_ha`: HA (Hue Angle) 色調標準

3. **更細緻的皺紋分析**
   - `eye_finelines`: 眼部細紋
   - `glabella_wrinkle`: 眉間紋
   - 嚴重程度評估

4. **毛孔分析** (分區域)
   - `pores_forehead`: 額頭
   - `pores_left_cheek`: 左臉頰
   - `pores_right_cheek`: 右臉頰
   - `pores_jaw`: 下巴

5. **黑頭和閉口粉刺**
   - `blackhead`: 黑頭嚴重程度
   - `closed_comedones`: 閉口粉刺位置

6. **敏感度分析** (可選)
   - `sensitivity`: 面部敏感區域分析

### 改進的眼部分析
- **黑眼圈類型**: 
  - 0: 無
  - 1: 色素型
  - 2: 血管型
  - 3: 陰影型

- **眼袋嚴重度**:
  - 0: 輕度
  - 1: 中度
  - 2: 嚴重

## 🔧 代碼兼容性

### 現有代碼無需修改
系統已實現向後兼容，現有的客戶端代碼無需修改。系統會自動將 AILabTools 的回應格式轉換為統一格式。

### 回應結構保持一致
```javascript
{
  "success": true,
  "data": {
    "analysis": { ... },
    "summary": { ... }
  },
  "metadata": { ... }
}
```

## 📝 獲取 AILabTools API Key

1. 訪問 [AILabTools](https://www.ailabtools.com/)
2. 註冊帳號
3. 前往 [API Console](https://www.ailabtools.com/console)
4. 創建應用程式並獲取 API Key
5. 查看 [定價方案](https://www.ailabtools.com/price?tab=developer)

## 🧪 測試遷移

### 1. 測試 API 連接
```bash
# 本地測試
curl http://localhost:3000/api/diagnostics?test=true

# Heroku 測試
curl https://your-app.herokuapp.com/api/diagnostics?test=true
```

### 2. 測試圖片分析
```bash
# 使用 curl 測試
curl -X POST https://your-app.herokuapp.com/api/analyze \
  -F "image=@test-image.jpg"
```

### 3. 查看日誌
```bash
# Heroku 日誌
heroku logs --tail

# 查找初始化訊息
heroku logs --tail | grep "AILabTools"
```

## ⚠️ 注意事項

### 1. API 配額和限制
- AILabTools 可能有不同的使用限制
- 請查看您的 API 方案配額
- 系統已實施重試機制和錯誤處理

### 2. 圖片要求
AILabTools 的圖片要求:
- 格式: JPG/JPEG
- 大小: 最大 5 MB
- 解析度: 200x200px ~ 4096x4096px
- 最小臉部像素: 400x400px (建議)

### 3. 定價差異
- 請比較 AILabTools 與原 Sulu 的定價
- 可使用 `/api/estimate-cost` 端點估算成本

## 🆘 故障排除

### 問題 1: "API Key is required"
**解決方案:**
```bash
# 確認環境變數已設置
heroku config | grep API_KEY

# 重新設置
heroku config:set AILAB_API_KEY=your_key_here
```

### 問題 2: "Failed to connect to API server"
**解決方案:**
1. 檢查 API Key 是否有效
2. 確認 AILabTools 服務狀態
3. 查看詳細錯誤日誌:
```bash
heroku logs --tail | grep "❌"
```

### 問題 3: 回應格式錯誤
**解決方案:**
- 系統已自動轉換格式
- 如有問題，檢查轉換邏輯在 `convertAILabToUnifiedFormat` 方法

## 📚 參考資料

- [AILabTools API 文檔](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-advanced/api)
- [AILabTools 定價](https://www.ailabtools.com/price?tab=developer)
- [取得 Sample Code](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-advanced/get-sample-code)
- [回應描述和錯誤碼](https://www.ailabtools.com/docs/response-description)

## 🎯 後續優化建議

1. **使用進階功能**
   - 啟用 `return_maps` 參數獲取紅區圖
   - 啟用 `return_rect_confidence` 獲取信心度

2. **成本優化**
   - 批次處理圖片
   - 實施快取機制
   - 監控 API 使用量

3. **品質控制**
   - 設置 `face_quality_control=1` 確保圖片品質
   - 提供用戶圖片拍攝指南

## ✅ 遷移檢查清單

- [ ] 獲取 AILabTools API Key
- [ ] 設置 `AILAB_API_KEY` 環境變數
- [ ] 部署最新代碼到 Heroku
- [ ] 測試 `/api/diagnostics?test=true` 端點
- [ ] 測試圖片分析功能
- [ ] 檢查日誌無錯誤
- [ ] 更新前端配置(如需要)
- [ ] 通知團隊成員 API 變更
- [ ] 監控 API 使用量和成本
- [ ] (可選) 移除舊的 `SULU_API_KEY` 環境變數

## 📞 支援

如遇到問題:
1. 查看 `TROUBLESHOOTING.md`
2. 檢查 Heroku 日誌
3. 測試診斷端點
4. 聯繫 AILabTools 技術支援
