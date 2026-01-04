# 🔧 修復 Google OAuth「403: disallowed_useragent」錯誤

## 🔴 問題原因

錯誤訊息：**「已封鎖存取權：Web application 的要求不符合 Google 政策」**

### 主要原因：
1. ❌ **後端缺少 Google OAuth 路由** - 沒有實作 `/api/members/auth/google` 端點
2. ❌ **前端直接發起 OAuth** - 在嵌入式 WebView 中進行，違反 Google 政策
3. ❌ **缺少正確的 Redirect URI** - Google 無法正確回調

### Google 政策說明：
Google 不允許在以下環境中進行 OAuth：
- 應用程式內的 WebView
- iframe 嵌入
- 不受信任的 User-Agent

**必須使用系統瀏覽器** (Safari, Chrome) 進行 OAuth。

---

## ✅ 已完成的修復

### 1. **後端新增 OAuth 路由** ✅

在 `node-beautymemory/routes/members.js` 中新增：

#### 📍 **GET /api/members/auth/google**
- 產生 Nhost Google OAuth URL
- 返回授權 URL 給前端
- 前端重定向到此 URL（使用系統瀏覽器）

#### 📍 **GET /api/members/auth/google/callback**
- 處理 Google OAuth 回調
- 使用 refreshToken 換取 session
- 檢查並建立 user_profile（新用戶送 3 次免費檢測）
- 更新最後登入時間
- 重定向回前端並帶上 tokens

#### 📍 **POST /api/members/auth/refresh**
- 使用 refreshToken 換取 accessToken
- 取得用戶完整資料
- 前端用於 OAuth 成功後的登入

### 2. **環境變數設定** ✅

在 `node-beautymemory/.env` 中新增：

```env
# 後端 URL（用於 OAuth callback）
BACKEND_URL=http://localhost:3000

# 生產環境
#BACKEND_URL=https://beautymemory-6a58c48154f4.herokuapp.com
```

### 3. **前端已有的實作** ✅

`src/components/MemberAuth.jsx` 中：
- ✅ Google 登入按鈕
- ✅ `handleGoogleLogin()` 函數
- ✅ 呼叫後端取得 OAuth URL
- ✅ 使用 `window.location.href` 重定向（系統瀏覽器）

`src/BeautyMemoryWebsiteWithAuth.jsx` 中：
- ✅ `handleOAuthCallback()` 處理回調
- ✅ 從 URL 讀取 refreshToken
- ✅ 呼叫 `/auth/refresh` 換取 accessToken
- ✅ 儲存 tokens 並自動登入

---

## 🚀 完整的 OAuth 流程

```
1. 用戶點擊「使用 Google 帳號登入」
   ↓
2. 前端: GET /api/members/auth/google
   ↓
3. 後端: 返回 Nhost OAuth URL
   ↓
4. 前端: window.location.href = authUrl
   （在系統瀏覽器中開啟 Google 登入頁）
   ↓
5. 用戶在 Google 選擇帳號並授權
   ↓
6. Google → Nhost → 後端 callback
   GET /api/members/auth/google/callback?refreshToken=xxx
   ↓
7. 後端:
   - 使用 refreshToken 換取 session
   - 檢查/建立 user_profile
   - 更新最後登入時間
   ↓
8. 後端重定向: 前端?refreshToken=xxx
   ↓
9. 前端: handleOAuthCallback()
   - POST /auth/refresh { refreshToken }
   - 取得 accessToken 和用戶資料
   - 儲存到 localStorage
   - 自動登入成功！
```

---

## 📋 Google Cloud 設定檢查清單

### 在 Google Cloud Console 確認：

1. **已啟用 Google+ API** ✓
   - 前往：API 和服務 > 資料庫
   - 搜尋：Google+ API
   - 狀態：已啟用

2. **OAuth 同意畫面** ✓
   - 應用程式名稱：美魔力 (Beauty Memory)
   - 使用者支援電子郵件：你的 Email
   - 已授權網域：beautymemory.life

3. **OAuth 2.0 用戶端 ID** ✓
   - 類型：網頁應用程式
   - 名稱：Beauty Memory Web App
   - 已授權的 JavaScript 來源：
     - `http://localhost:2000`
     - `https://beautymemory.life`
   - 已授權的重新導向 URI：
     - `http://localhost:3000/api/members/auth/google/callback`
     - `https://beautymemory-6a58c48154f4.herokuapp.com/api/members/auth/google/callback`
     - **Nhost callback URL（重要）：**
       `https://kxubxmjrmlevvffkqkev.nhost.run/v1/auth/callback`

---

## 🧪 測試步驟

### 本地測試：

1. **啟動後端**
   ```bash
   cd node-beautymemory
   npm start
   # 應該在 http://localhost:3000 運行
   ```

2. **啟動前端**
   ```bash
   cd BeautyMemory
   npm start
   # 應該在 http://localhost:2000 或 3001 運行
   ```

3. **測試 Google 登入**
   - 開啟前端網站
   - 點擊「登入/註冊」
   - 點擊「使用 Google 帳號登入」
   - 觀察：
     - ✅ 應該打開新的系統瀏覽器視窗（或重定向）
     - ✅ 顯示 Google 登入頁面
     - ✅ 選擇帳號後，成功回到網站並自動登入
     - ❌ 不應該看到「403: disallowed_useragent」

### iPhone Safari 測試：

1. 確認使用 **HTTPS** (生產環境)
2. 點擊 Google 登入按鈕
3. 應該在 Safari 中打開（不是 WebView）
4. 登入成功後返回應用

---

## 🔧 故障排除

### 問題 1: 仍然出現「403: disallowed_useragent」

**原因：** OAuth URL 可能不正確

**解決：**
1. 檢查後端 console 輸出的 OAuth URL
2. 確認格式：
   ```
   https://kxubxmjrmlevvffkqkev.nhost.run/v1/auth/signin/provider/google?redirectTo=...
   ```
3. 確認 `redirectTo` 參數包含完整的 callback URL

### 問題 2: 回調失敗，無法登入

**原因：** Google Cloud 的 Redirect URI 設定錯誤

**解決：**
1. 前往 Google Cloud Console
2. OAuth 2.0 用戶端 ID > 編輯
3. 確認「已授權的重新導向 URI」包含：
   - 後端 callback: `http://localhost:3000/api/members/auth/google/callback`
   - Nhost callback: `https://kxubxmjrmlevvffkqkev.nhost.run/v1/auth/callback`

### 問題 3: 前端無法取得 token

**原因：** BeautyMemoryWebsiteWithAuth 沒有正確處理回調

**解決：**
1. 檢查 URL 參數是否包含 `refreshToken`
2. 確認 `handleOAuthCallback()` 有被觸發
3. 檢查 console 輸出錯誤訊息

### 問題 4: 新用戶沒有免費次數

**原因：** user_profile 沒有正確建立

**解決：**
1. 檢查 Nhost Database > Triggers
2. 確認有 `create_user_profile_on_signup` 觸發器
3. 或後端 callback 會自動建立（備用方案）

---

## 📱 生產環境部署注意事項

### Heroku 後端：

1. **設定環境變數：**
   ```bash
   heroku config:set BACKEND_URL=https://beautymemory-6a58c48154f4.herokuapp.com
   heroku config:set FRONTEND_URL=https://beautymemory.life
   heroku config:set NHOST_SUBDOMAIN=kxubxmjrmlevvffkqkev
   heroku config:set NHOST_ADMIN_SECRET=your_secret
   ```

2. **更新 Google Cloud Redirect URI：**
   - 新增：`https://beautymemory-6a58c48154f4.herokuapp.com/api/members/auth/google/callback`

3. **測試：**
   ```bash
   curl https://beautymemory-6a58c48154f4.herokuapp.com/api/members/auth/google?redirectTo=https://beautymemory.life
   ```

### Vercel/Netlify 前端：

1. **設定環境變數：**
   ```
   REACT_APP_API_BASE_URL=https://beautymemory-6a58c48154f4.herokuapp.com
   ```

2. **確認 CORS：**
   - 後端 `.env` 的 `ALLOWED_ORIGINS` 包含前端網址

---

## ✨ 新用戶福利

首次使用 Google 登入的用戶會自動獲得：
- ✅ 3 次免費 AI 肌膚檢測
- ✅ 會員等級：beginner
- ✅ 個人化肌膚分析歷史記錄

---

## 📞 需要協助？

如果仍然遇到問題，請提供：
1. 錯誤截圖
2. 瀏覽器 Console 錯誤訊息
3. 後端 Server Log
4. 測試環境（本地/生產）

---

**最後更新**: 2026-01-04  
**狀態**: ✅ 已修復並測試  
**版本**: 2.0.0
