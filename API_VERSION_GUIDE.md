# 皮膚分析 API 版本使用指南

## 📋 概述

系統現在支援兩個版本的皮膚分析 API：

| 版本 | Endpoint | 圖片限制 | 特點 |
|------|----------|----------|------|
| **基礎版** | `/api/portrait/analysis/skin-analysis` | 2 MB | 只返回 0/1 值，速度快 |
| **專業版** | `/api/portrait/analysis/skin-analysis-advanced` | 5 MB | 返回詳細數據（位置、數量、嚴重度） |

## 🔧 設置 API 版本

### 方法 1: 環境變數 (全域默認)

在 `.env` 文件或 Heroku 環境變數中設置:

```bash
# 基礎版
SKIN_ANALYSIS_VERSION=basic

# 專業版 (默認)
SKIN_ANALYSIS_VERSION=advanced
```

**Heroku 設置:**
```bash
# 使用基礎版
heroku config:set SKIN_ANALYSIS_VERSION=basic

# 使用專業版 (默認)
heroku config:set SKIN_ANALYSIS_VERSION=advanced
```

### 方法 2: 請求參數 (單次請求)

在每次 API 請求時指定版本，會覆蓋全域設置：

#### 使用 Query 參數
```bash
# 基礎版
curl -X POST "http://localhost:3000/api/analyze?version=basic" \
  -F "image=@test-image.jpg"

# 專業版
curl -X POST "http://localhost:3000/api/analyze?version=advanced" \
  -F "image=@test-image.jpg"
```

#### 使用 Body 參數 (multipart/form-data)
```bash
curl -X POST "http://localhost:3000/api/analyze" \
  -F "image=@test-image.jpg" \
  -F "version=basic"
```

#### Base64 端點
```bash
curl -X POST "http://localhost:3000/api/analyze-base64" \
  -H "Content-Type: application/json" \
  -d '{
    "imageData": "data:image/jpeg;base64,/9j/4AAQ...",
    "version": "basic"
  }'
```

## 📊 版本差異詳解

### 基礎版 (Basic)

**適用場景:**
- 快速篩查
- 只需要知道有無問題
- 圖片較大但可壓縮到 2MB
- 成本優先

**返回示例:**
```json
{
  "acne": {
    "value": 1,        // 0: 無, 1: 有
    "confidence": 0.89,
    "count": 1         // 基礎版: count 等於 value
  },
  "spots": {
    "value": 0,
    "confidence": 0.95,
    "count": 0
  },
  "dark_circle": {
    "value": 1,        // 0: 無, 1: 有 (無類型區分)
    "confidence": 0.76
  }
}
```

**限制:**
- 圖片大小: 最大 2 MB
- 痘痘/斑點: 只有 0/1，無具體位置
- 黑眼圈: 只有有無，無類型分類
- 眼袋: 只有有無，無嚴重度
- 無膚齡數據
- 無 ITA/HA 標準
- 無敏感度分析
- 無閉口粉刺數據

### 專業版 (Advanced)

**適用場景:**
- 詳細分析報告
- 需要具體位置和數量
- 專業護膚建議
- 追蹤改善效果

**返回示例:**
```json
{
  "skin_age": {
    "value": 49        // 具體膚齡
  },
  "acne": {
    "rectangle": [     // 每個痘痘的具體位置
      {
        "width": 3,
        "height": 1,
        "left": 35,
        "top": 17
      },
      {
        "width": 4,
        "height": 1,
        "left": 35,
        "top": 20
      }
    ],
    "confidence": [0.95, 0.88],
    "count": 2
  },
  "dark_circle": {
    "value": 2,        // 0:無, 1:色素型, 2:血管型, 3:陰影型
    "confidence": 0.76
  },
  "eye_pouch_severity": {
    "value": 2,        // 0:輕度, 1:中度, 2:嚴重
    "confidence": 0.92
  },
  "nasolabial_fold_severity": {
    "value": 1,        // 0:輕度, 1:中度, 2:嚴重
    "confidence": 0.85
  },
  "skintone_ita": {
    "ITA": 45.5,
    "skintone": 1      // ITA 標準膚色分類
  },
  "skin_hue_ha": {
    "HA": 47.2,
    "skintone": 0      // HA 標準色調分類
  },
  "closed_comedones": {
    "rectangle": [...],
    "count": 5
  },
  "sensitivity": {
    "sensitivity_area": 0.15,
    "sensitivity_intensity": 32.5
  }
}
```

**優勢:**
- 圖片大小: 最大 5 MB
- 具體位置數據 (矩形坐標)
- 詳細分類 (黑眼圈類型、嚴重度等)
- 膚齡數據
- ITA/HA 國際標準
- 敏感度分析
- 閉口粉刺檢測

## 💻 程式碼範例

### Node.js

```javascript
const SuluSkinAnalyzer = require('./SuluSkinAnalyzer');

// 初始化 (設置默認版本)
const analyzer = new SuluSkinAnalyzer('your-api-key', 'advanced');

// 方法 1: 使用默認版本
const result1 = await analyzer.analyzeFromPath('image.jpg');

// 方法 2: 覆蓋版本 (單次請求)
const result2 = await analyzer.analyzeFromPath('image.jpg', 'basic');

// 方法 3: 切換默認版本
analyzer.setVersion('basic');
const result3 = await analyzer.analyzeFromPath('image.jpg');

// 檢查當前版本
console.log(analyzer.getVersion()); // 'basic' or 'advanced'
```

### JavaScript (Fetch API)

```javascript
// 基礎版
const formData = new FormData();
formData.append('image', fileInput.files[0]);
formData.append('version', 'basic');

const response = await fetch('https://your-app.herokuapp.com/api/analyze', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('API Version:', result.metadata.api_version);
```

### cURL

```bash
# 基礎版
curl -X POST "https://beautymemory-6a58c48154f4.herokuapp.com/api/analyze?version=basic" \
  -F "image=@test-image.jpg"

# 專業版
curl -X POST "https://beautymemory-6a58c48154f4.herokuapp.com/api/analyze?version=advanced" \
  -F "image=@test-image.jpg"
```

## 📈 選擇建議

### 使用基礎版的情況:
- ✅ 快速初步篩查
- ✅ 大量圖片批次處理
- ✅ 只需要yes/no答案
- ✅ 成本優先考量
- ✅ 圖片需要壓縮到 2MB

### 使用專業版的情況:
- ✅ 需要詳細分析報告
- ✅ 要生成護膚建議
- ✅ 需要追蹤具體改善
- ✅ 專業美容諮詢
- ✅ 需要膚齡評估
- ✅ 需要國際標準數據

## 🔄 版本切換策略

### 策略 1: 混合使用
```javascript
// 先用基礎版快速篩查
const quickScan = await analyzer.analyzeFromPath('image.jpg', 'basic');

if (quickScan.data.result.acne.value === 1 || 
    quickScan.data.result.spots.value === 1) {
  // 發現問題，使用專業版獲取詳細數據
  const detailedAnalysis = await analyzer.analyzeFromPath('image.jpg', 'advanced');
  return detailedAnalysis;
}

return quickScan;
```

### 策略 2: 根據用戶計劃
```javascript
// 免費用戶: 基礎版
if (user.plan === 'free') {
  analyzer.setVersion('basic');
}

// 付費用戶: 專業版
if (user.plan === 'premium') {
  analyzer.setVersion('advanced');
}

const result = await analyzer.analyzeFromPath('image.jpg');
```

## 🧪 測試

### 測試兩個版本
```bash
# 測試基礎版
npm run test:api
# 然後在 .env 中設置 SKIN_ANALYSIS_VERSION=basic

# 測試專業版
# 在 .env 中設置 SKIN_ANALYSIS_VERSION=advanced
npm run test:api

# 或直接在請求中指定
curl -X POST "http://localhost:3000/api/analyze?version=basic" \
  -F "image=@test-image.jpg"
```

### 查看當前版本
```bash
curl http://localhost:3000/api/diagnostics
# 查看 analyzer.api_version 欄位
```

## 📝 注意事項

1. **圖片大小限制**
   - 基礎版: 2 MB
   - 專業版: 5 MB
   
2. **版本優先級**
   - 請求參數 > 環境變數 > 默認值 (advanced)

3. **成本考量**
   - 兩個版本可能有不同的計費
   - 請查看 AILabTools 定價

4. **回應格式**
   - 系統會自動轉換為統一格式
   - 基礎版缺少的欄位會返回 null

5. **向後兼容**
   - 不指定版本時使用專業版
   - 現有代碼無需修改

## 🆘 故障排除

### 問題: 圖片超過大小限制
```
Error: Image size (3.2 MB) exceeds 2 MB limit for basic version
```

**解決方案:**
1. 壓縮圖片
2. 使用專業版 (5 MB 限制)

### 問題: 版本參數無效
```bash
# 確保使用正確的版本名稱
version=basic    # ✅
version=advanced # ✅
version=pro      # ❌ 無效
```

## 📚 相關文檔

- [AILabTools 基礎版 API](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis/api)
- [AILabTools 專業版 API](https://www.ailabtools.com/docs/ai-portrait/analysis/skin-analysis-advanced/api)
- [定價比較](https://www.ailabtools.com/price?tab=developer)
