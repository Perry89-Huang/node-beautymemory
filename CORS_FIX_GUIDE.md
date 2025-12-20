# CORS 問題修復指南

## 🔍 問題診斷

錯誤訊息：
```
Access to fetch at 'https://line-thefreen-1f18f78e0b98.herokuapp.com/api/members/login' 
from origin 'https://beautymemory.life' has been blocked by CORS policy
```

## ✅ 已完成的修復

### 1. 更新 server1.js CORS 設定

增強的 CORS 配置：
- ✅ 支援多個允許的來源
- ✅ 處理 preflight OPTIONS 請求
- ✅ 設定完整的 HTTP 方法
- ✅ 設定允許的標頭
- ✅ 啟用 credentials

### 2. 更新 .env 環境變數

新增允許的來源：
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://beautymemory.life,http://localhost:2000,https://www.beautymemory.life,https://line-thefreen-1f18f78e0b98.herokuapp.com
```

## 🚀 部署步驟

### Heroku 部署

1. **推送更新到 Heroku**
   ```bash
   cd node-beautymemory
   git add .
   git commit -m "Fix CORS configuration for beautymemory.life"
   git push heroku master
   ```

2. **設定 Heroku 環境變數**
   ```bash
   heroku config:set ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173,https://beautymemory.life,http://localhost:2000,https://www.beautymemory.life,https://line-thefreen-1f18f78e0b98.herokuapp.com"
   ```

3. **重啟 Heroku App**
   ```bash
   heroku restart
   ```

4. **查看日誌**
   ```bash
   heroku logs --tail
   ```

### 本地測試

```bash
# 測試 CORS 設定
node test-cors.js
```

## 🧪 驗證步驟

### 1. 檢查 Heroku 環境變數

```bash
heroku config:get ALLOWED_ORIGINS
```

應該返回：
```
http://localhost:3000,http://localhost:5173,https://beautymemory.life,http://localhost:2000,https://www.beautymemory.life,https://line-thefreen-1f18f78e0b98.herokuapp.com
```

### 2. 測試 OPTIONS 請求

```bash
curl -X OPTIONS https://line-thefreen-1f18f78e0b98.herokuapp.com/api/members/login \
  -H "Origin: https://beautymemory.life" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

應該看到：
```
Access-Control-Allow-Origin: https://beautymemory.life
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH
Access-Control-Allow-Credentials: true
```

### 3. 測試實際登入請求

使用瀏覽器開發者工具：
1. 打開 https://beautymemory.life
2. 開啟開發者工具 (F12)
3. 切換到 Network 標籤
4. 嘗試登入
5. 檢查請求的 Response Headers

## 🔧 故障排除

### 問題 1: 仍然出現 CORS 錯誤

**解決方案**：
1. 確認 Heroku 環境變數已更新
   ```bash
   heroku config
   ```

2. 重啟 Heroku app
   ```bash
   heroku restart
   ```

3. 清除瀏覽器快取

### 問題 2: 環境變數未生效

**解決方案**：
1. 確認 `.env` 文件已正確設定（本地測試）
2. 確認 Heroku Config Vars 已設定（生產環境）
3. 重新部署代碼

### 問題 3: Preflight 請求失敗

**解決方案**：
檢查 server1.js 中是否有：
```javascript
app.options('*', cors());
```

### 問題 4: 特定域名被拒絕

**檢查**：
1. 確認域名拼寫正確（包含 https:// 前綴）
2. 確認沒有多餘的空格
3. 使用逗號分隔，不要有空格

## 📝 CORS 配置說明

### 允許的來源（Origins）

```javascript
const allowedOrigins = [
  'http://localhost:3000',           // 本地開發（React）
  'http://localhost:5173',           // 本地開發（Vite）
  'http://localhost:2000',           // 本地測試端口
  'https://beautymemory.life',       // 生產網站
  'https://www.beautymemory.life',   // WWW 子域名
  'https://line-thefreen-1f18f78e0b98.herokuapp.com' // Heroku 預覽
];
```

### 允許的方法（Methods）

```javascript
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
```

### 允許的標頭（Headers）

```javascript
allowedHeaders: [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept'
]
```

## 🎯 關鍵配置

### server1.js

```javascript
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  maxAge: 86400
}));

app.options('*', cors());
```

## ✨ 完成後測試

1. ✅ 登入功能正常
2. ✅ 肌膚分析上傳正常
3. ✅ AI 推薦功能正常
4. ✅ 不再出現 CORS 錯誤

## 🔗 相關資源

- [Express CORS 文檔](https://expressjs.com/en/resources/middleware/cors.html)
- [MDN CORS 指南](https://developer.mozilla.org/zh-TW/docs/Web/HTTP/CORS)
- [Heroku Config Vars](https://devcenter.heroku.com/articles/config-vars)

---

**修復日期**：2025-12-20  
**狀態**：✅ 已完成
