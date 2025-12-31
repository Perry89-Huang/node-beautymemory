# Google OAuth 設定指南

本指南說明如何在美魔力系統中設定 Google 帳號登入功能。

## 步驟 1: 在 Google Cloud Console 建立 OAuth 2.0 憑證

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 Google+ API（已被 People API 取代）
4. 前往「APIs & Services」>「Credentials」
5. 點擊「Create Credentials」>「OAuth 2.0 Client IDs」
6. 選擇應用程式類型：「Web application」
7. 設定授權重定向 URI：
   ```
   https://[YOUR_NHOST_SUBDOMAIN].auth.[YOUR_REGION].nhost.run/v1/signin/provider/google/callback
   ```
   
   例如（新格式）：
   ```
   https://kxubxmjrmlevvffkqkev.auth.ap-southeast-1.nhost.run/v1/signin/provider/google/callback
   ```
   
   **注意**: Nhost 已更新為新的 URL 格式，請使用 `{subdomain}.auth.{region}.nhost.run`

8. 儲存後取得：
   - Client ID
   - Client Secret

## 步驟 2: 在 Nhost Dashboard 設定 Google Provider

1. 登入 [Nhost Dashboard](https://app.nhost.io/)
2. 選擇您的專案
3. 前往「Settings」>「Sign-In Methods」
4. 找到「Google」並點擊「Configure」
5. 啟用 Google 登入
6. 輸入從 Google Cloud Console 取得的：
   - **Client ID**
   - **Client Secret**
7. 設定允許的重定向 URL（前端）：
   ```
   http://localhost:3001
   https://beautymemory.vercel.app
   https://your-production-domain.com
   ```
8. 儲存設定

## 步驟 3: 更新環境變數

確保 `.env` 檔案包含以下設定：

```env
# Nhost 配置
NHOST_SUBDOMAIN=your-subdomain
NHOST_REGION=ap-southeast-1
NHOST_ADMIN_SECRET=your-admin-secret

# 前端 URL（用於 OAuth 回調）
FRONTEND_URL=http://localhost:3001

# 或生產環境
# FRONTEND_URL=https://beautymemory.vercel.app
```

## 步驟 4: 測試 Google 登入

1. 啟動後端伺服器：
   ```bash
   cd node-beautymemory
   npm start
   ```

2. 啟動前端應用：
   ```bash
   cd BeautyMemory
   npm start
   ```

3. 在瀏覽器中開啟應用
4. 點擊「會員登入」
5. 點擊「使用 Google 帳號登入」按鈕
6. 選擇 Google 帳號並授權
7. 應該會自動登入並返回應用

## 流程說明

### 登入流程

1. 用戶點擊「使用 Google 帳號登入」
2. 前端呼叫 `GET /api/members/auth/google` 取得 OAuth URL
3. 重定向到 Google 登入頁面
4. 用戶在 Google 授權
5. Google 重定向回 Nhost：`/v1/auth/signin/provider/google/callback`
6. Nhost 處理 OAuth 並重定向到我們的後端：`GET /api/members/auth/google/callback?refreshToken=...`
7. 後端處理 refreshToken 並重定向到前端：`http://localhost:3001?accessToken=...&refreshToken=...`
8. 前端從 URL 參數取得 tokens 並自動登入

### 資料同步

當用戶首次使用 Google 登入時：
- Nhost 自動在 `auth.users` 表建立用戶記錄
- 資料庫觸發器自動在 `user_profiles` 表建立對應的 profile
- 新用戶自動獲得 3 次免費肌膚檢測配額

## 故障排除

### 問題 1: 重定向 URI 不符
**錯誤**: `redirect_uri_mismatch`

**解決方案**: 確保 Google Cloud Console 中設定的重定向 URI 與 Nhost 的完全一致。

### 問題 2: 無法取得用戶資料
**錯誤**: OAuth 回調後無法登入

**解決方案**: 
1. 檢查 Nhost Admin Secret 是否正確
2. 確認資料庫觸發器正常運作
3. 查看後端 console 日誌

### 問題 3: CORS 錯誤
**錯誤**: CORS policy blocking

**解決方案**: 在 Nhost Dashboard 的 Settings > CORS 中添加前端 URL。

## 安全性建議

1. **不要** 將 Client Secret 提交到版本控制
2. 使用環境變數管理敏感資訊
3. 在生產環境使用 HTTPS
4. 定期更新 OAuth 憑證
5. 限制 OAuth 範圍到最小需求

## 相關文件

- [Nhost Authentication Documentation](https://docs.nhost.io/authentication)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Nhost Google Provider Guide](https://docs.nhost.io/authentication/sign-in-with-google)

## 支援

如有問題，請聯繫開發團隊或查閱：
- Nhost Discord: https://discord.com/invite/9V7Qb2U
- 專案 Issues: [GitHub Repository Issues]
