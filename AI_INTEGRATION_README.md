# AI 專家推薦系統整合說明

## 📋 概述

成功將美魔力 AI 專家系統整合到推薦系統中，提供專業的肌膚分析和產品推薦服務。

## 🎯 整合功能

### 1. **AI 肌膚專家推薦** (`/api/ai/skin-recommendation`)
- 根據肌膚檢測結果提供專業分析
- 生成個人化保養建議
- 推薦適合的荷顏產品
- 提供 28 天改善計劃

### 2. **AI 智能客服** (`/api/ai/chat`)
- 即時回答客戶問題
- 產品諮詢服務
- 政策說明（運送、退貨等）
- FAQ 智能搜尋

## 🔧 技術架構

### 後端 (server1.js)

```javascript
// 新增的 API 端點
POST /api/ai/skin-recommendation  - AI 肌膚專家推薦
POST /api/ai/chat                  - AI 智能客服對話

// 核心功能
- Anthropic Claude API 整合
- 知識庫搜尋系統
- 專業提示詞工程
- 速率限制 (30次/小時)
```

### 前端 (SkinAnalysis.jsx)

```javascript
// 新增功能
- AI 推薦按鈕
- AI 推薦結果模態框
- 加載狀態顯示
- 錯誤處理
```

## 📦 安裝步驟

### 1. 安裝依賴

```bash
cd node-beautymemory
npm install @anthropic-ai/sdk
```

### 2. 環境變數設定

在 `.env` 文件中添加：

```env
# Claude API 金鑰
CLAUDE_API_KEY=sk-ant-api03-...你的金鑰...

# 其他必要變數
NHOST_SUBDOMAIN=your-subdomain
AILAB_API_KEY=your-ailab-key
```

### 3. 啟動後端服務器

```bash
cd node-beautymemory
node server1.js
```

服務器將在 `http://localhost:3000` 啟動

### 4. 啟動前端

```bash
cd BeautyMemory
npm start
```

## 🧪 測試

### 使用測試腳本

```bash
cd node-beautymemory
node test-ai-recommendation.js
```

測試腳本將執行：
- AI 肌膚專家推薦測試
- AI 客服對話測試
- 完整流程測試

### 手動測試

#### 測試 AI 推薦

```bash
curl -X POST http://localhost:3000/api/ai/skin-recommendation \
  -H "Content-Type: application/json" \
  -d '{
    "analysisResult": {
      "overall_score": 75,
      "skin_age": 28,
      "analysis": {
        "skin_type": {"value": 1},
        "wrinkle_detection_result": {"value": 1}
      }
    },
    "userQuery": "我想改善皺紋問題"
  }'
```

#### 測試 AI 客服

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "請問有哪些抗老產品？"
  }'
```

## 💻 前端使用方式

### 在肌膚檢測完成後

1. 用戶完成肌膚檢測
2. 查看分析結果
3. 點擊「🤖 獲取 AI 專家推薦」按鈕
4. AI 系統分析並生成專業推薦
5. 在彈出視窗中查看推薦內容
6. 可下載推薦報告

### UI 特色

- **載入動畫**：AI 分析時顯示動態載入效果
- **精美彈窗**：漸層背景、專業設計
- **模型標籤**：顯示使用的 AI 模型
- **時間戳記**：記錄推薦生成時間
- **下載功能**：可保存推薦內容

## 📊 API 文檔

### POST /api/ai/skin-recommendation

**請求體：**
```json
{
  "analysisResult": {
    "overall_score": 75,
    "skin_age": 28,
    "analysis": {
      "skin_type": { "value": 1 },
      "wrinkle_detection_result": { "value": 1 },
      // ...其他分析數據
    }
  },
  "userQuery": "可選的用戶問題"
}
```

**回應：**
```json
{
  "success": true,
  "data": {
    "recommendation": "AI 生成的專業推薦內容...",
    "timestamp": "2025-01-01T12:00:00.000Z",
    "model": "claude-sonnet-4-20250514"
  }
}
```

### POST /api/ai/chat

**請求體：**
```json
{
  "message": "用戶問題"
}
```

**回應：**
```json
{
  "success": true,
  "data": {
    "response": "AI 回應內容...",
    "timestamp": "2025-01-01T12:00:00.000Z",
    "relevantProducts": 2,
    "relevantFAQ": 1
  }
}
```

## 🔐 安全性

### 速率限制
- AI 推薦：30 次/小時
- AI 客服：30 次/小時
- 自動封鎖超額請求

### 錯誤處理
- 詳細的錯誤訊息
- 自動重試機制
- 降級方案

## 🎨 AI 推薦特色

### 專業分析包含

1. **肌膚狀況綜合評估** (100-150字)
   - 主要問題分析
   - 成因說明
   - 優先改善項目

2. **專業保養建議** (3-5項)
   - 針對性建議
   - 日常保養步驟
   - 生活作息建議
   - 飲食營養建議

3. **荷顏產品推薦** (3-5項)
   - 產品名稱
   - 推薦理由
   - 使用方法
   - 預期效果
   - 使用順序

4. **28天改善計劃**
   - 分週重點任務
   - 階段性目標
   - 進度追蹤

5. **注意事項**
   - 使用須知
   - 適應期反應
   - 調整時機

## 📈 效益

### 用戶體驗提升
- ✅ 專業分析報告
- ✅ 個人化推薦
- ✅ 即時客服支援
- ✅ 完整保養計劃

### 商業價值
- ✅ 提升轉換率
- ✅ 增加客戶黏著度
- ✅ 降低客服成本
- ✅ 提升品牌專業度

## 🚀 未來擴展

### 計劃功能
- [ ] 多輪對話記憶
- [ ] 用戶偏好學習
- [ ] 產品庫存整合
- [ ] 購物車直接推薦
- [ ] 語音對話支援
- [ ] 多語言支援

## 📝 注意事項

1. **API 金鑰安全**
   - 不要將 `.env` 文件提交到 Git
   - 定期更換 API 金鑰
   - 使用環境變數管理

2. **成本控制**
   - 監控 API 使用量
   - 設置合理的速率限制
   - 優化提示詞長度

3. **知識庫維護**
   - 定期更新產品資訊
   - 補充 FAQ 內容
   - 更新政策說明

## 🆘 故障排除

### 常見問題

**Q: AI 推薦按鈕無反應**
- 檢查後端服務是否啟動
- 確認 CLAUDE_API_KEY 已設置
- 查看瀏覽器控制台錯誤

**Q: 推薦內容不完整**
- 檢查 API 回應狀態
- 確認知識庫文件存在
- 查看後端日誌

**Q: 速率限制錯誤**
- 等待 1 小時後重試
- 或調整 server1.js 中的限制設置

## 📞 技術支援

如有問題，請查看：
- 後端日誌：`node-beautymemory/` 目錄
- 前端控制台：瀏覽器開發者工具
- 測試腳本：`test-ai-recommendation.js`

---

**整合完成日期**：2025-12-20  
**版本**：1.0.0  
**技術支援**：美魔力開發團隊
