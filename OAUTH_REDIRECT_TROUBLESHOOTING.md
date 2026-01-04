# OAuth Redirect 問題排查指南

## 問題描述
使用 `http://localhost:2000` 測試時，Google OAuth 登入後仍然重定向到 Nhost 的 Client URL，而不是 localhost。

## 解決方案

### 1. 檢查當前配置

運行測試腳本查看當前配置：

```bash
cd node-beautymemory
node test-oauth-config.js
```

### 2. 在 Nhost Dashboard 中配置

#### 步驟 A: 訪問 Nhost Dashboard
1. 前往：https://app.nhost.io
2. 選擇您的專案
3. 點擊左側選單的 **Settings**
4. 選擇 **Sign-In Methods**

#### 步驟 B: 配置 Google OAuth
1. 確保 **Google** 已啟用
2. 滾動到 **Allowed Redirect URLs** 區域
3. 添加以下 URL（每個佔一行）：

```
http://localhost:2000
http://localhost:3001
https://your-production-domain.com
```

**重要注意事項：**
- ⚠️ URL 必須**完全匹配**，包括 `http://` 或 `https://`
- ⚠️ 建議**不要**在結尾加斜線 `/`
- ⚠️ 不能使用 `localhost:*` 這樣的通配符
- ✅ 每個端口都需要單獨添加

#### 步驟 C: 保存設置
點擊 **Save** 按鈕，等待幾秒鐘讓配置生效。

### 3. 驗證代碼配置

確認代碼已正確配置：

**前端 (MemberAuth.jsx):**
```javascript
const currentOrigin = window.location.origin; // 應該是 http://localhost:2000
const response = await fetch(
  `${API_BASE_URL}/api/members/auth/google?redirectTo=${encodeURIComponent(currentOrigin)}`
);
```

**後端 (routes/members.js):**
```javascript
const redirectTo = req.query.redirectTo || process.env.FRONTEND_URL || 'http://localhost:3001';
const authUrl = `https://${subdomain}.auth.${region}.nhost.run/v1/signin/provider/google?redirectTo=${encodeURIComponent(redirectTo)}`;
```

### 4. 測試流程

#### 步驟 1: 重啟服務器
```bash
# 後端
cd node-beautymemory
npm start

# 前端
cd BeautyMemory
npm start
```

#### 步驟 2: 打開瀏覽器開發者工具
按 F12 打開開發者工具，切換到 **Console** 標籤。

#### 步驟 3: 點擊 Google 登入
點擊網站上的 "Google 登入" 按鈕。

#### 步驟 4: 查看調試日誌
在 Console 中應該看到：

**前端日誌：**
```
🔐 發起 Google 登入: {
  currentOrigin: "http://localhost:2000",
  apiUrl: "http://localhost:3000/api/members/auth/google?redirectTo=http%3A%2F%2Flocalhost%3A2000"
}

🔐 收到 OAuth URL: {
  success: true,
  data: {
    authUrl: "https://xxxxx.auth.ap-southeast-1.nhost.run/v1/signin/provider/google?redirectTo=http%3A%2F%2Flocalhost%3A2000",
    ...
  }
}
```

**後端日誌（在終端機中）：**
```
🔐 Google OAuth Request: {
  receivedRedirectTo: 'http://localhost:2000',
  finalRedirectTo: 'http://localhost:2000',
  authUrl: 'https://xxxxx.auth.ap-southeast-1.nhost.run/v1/signin/provider/google?redirectTo=http%3A%2F%2Flocalhost%3A2000'
}
```

#### 步驟 5: 檢查 OAuth URL
複製 `authUrl`，檢查是否包含正確的 `redirectTo` 參數。

### 5. 常見問題排查

#### 問題 1: 仍然重定向到錯誤的 URL

**可能原因 A: Nhost 配置未生效**
- 解決方法：在 Nhost Dashboard 中重新保存配置，等待 1-2 分鐘

**可能原因 B: URL 格式不匹配**
- 檢查 Allowed Redirect URLs 中的 URL 是否與實際 URL 完全一致
- 常見錯誤：
  - `http://localhost:2000/` ❌（結尾有斜線）
  - `http://localhost:2000` ✅（正確）

**可能原因 C: 瀏覽器快取**
- 清除瀏覽器快取（Ctrl+Shift+Delete）
- 或使用無痕模式測試

#### 問題 2: 看不到調試日誌

**前端看不到日誌：**
- 確認瀏覽器開發者工具已打開
- 重新整理頁面（Ctrl+R）

**後端看不到日誌：**
- 確認後端服務器正在運行
- 檢查終端機視窗是否有輸出

#### 問題 3: API_BASE_URL 不正確

檢查前端環境變數：

**BeautyMemory/.env.local:**
```
REACT_APP_API_BASE_URL=http://localhost:3000
```

### 6. 驗證成功的標誌

✅ Google 登入後，瀏覽器地址欄顯示：`http://localhost:2000/?refreshToken=...`  
✅ 自動登入成功，看到歡迎訊息  
✅ 用戶資料正確顯示在導航列

### 7. 生產環境配置

部署到生產環境時：

1. 在 Nhost Dashboard 的 Allowed Redirect URLs 中添加生產環境 URL：
   ```
   https://beautymemory.life
   https://www.beautymemory.life
   ```

2. 設置環境變數：
   ```bash
   FRONTEND_URL=https://beautymemory.life
   ```

3. 代碼會自動使用正確的 URL，無需修改

## 需要幫助？

如果問題仍然存在，請提供：

1. 瀏覽器 Console 中的完整日誌
2. 後端終端機中的日誌
3. Nhost Dashboard 中 Allowed Redirect URLs 的截圖
4. 您的前端運行端口（例如：localhost:2000）
