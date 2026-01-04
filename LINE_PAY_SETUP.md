# LINE Pay 整合設定指南

## 概述
本專案已整合 LINE Pay 付款功能，用於會員升級方案的付款處理。

## 功能特點
- ✅ 三種會員方案（專業版、高級版、企業版）
- ✅ LINE Pay 沙盒環境測試
- ✅ HMAC SHA256 安全簽名
- ✅ 完整的付款流程（Request → Redirect → Confirm）
- ✅ 訂單狀態追蹤
- ✅ 自動更新會員等級

## 設定步驟

### 1. 註冊 LINE Pay 商戶帳號

1. 前往 [LINE Pay 商戶中心](https://pay.line.me/tw/center/payment/main)
2. 申請商戶帳號
3. 等待審核通過

### 2. 取得 API 憑證

1. 登入 LINE Pay 商戶中心
2. 進入「技術串接」→「Channel」
3. 創建新的 Channel
4. 取得以下資訊：
   - Channel ID
   - Channel Secret Key

### 3. 設定環境變數

在 `node-beautymemory/.env` 文件中設定：

```env
# LINE Pay Channel ID (必填)
LINE_PAY_CHANNEL_ID=your_actual_channel_id

# LINE Pay Channel Secret (必填)
LINE_PAY_CHANNEL_SECRET=your_actual_channel_secret

# LINE Pay 環境 (sandbox 或 production)
LINE_PAY_ENV=sandbox
```

### 4. 設定回調 URL

在 LINE Pay 商戶後台設定以下回調 URL：

**開發環境：**
- Confirm URL: `http://localhost:2000/payment/confirm`

**生產環境：**
- Confirm URL: `https://beautymemory.life/payment/confirm`

### 5. 測試付款流程

1. 啟動後端服務：
```bash
cd node-beautymemory
npm start
```

2. 啟動前端服務：
```bash
cd BeautyMemory
npm start
```

3. 登入系統後點擊「立即升級」按鈕
4. 選擇方案並點擊「前往付款」
5. 在 LINE Pay 頁面完成付款
6. 系統自動確認付款並升級會員等級

## API 端點

### 取得方案列表
```
GET /api/payment/plans
```

### 發起付款請求
```
POST /api/payment/linepay/request
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "planId": "intermediate"  // intermediate, expert, 或 enterprise
}
```

### 確認付款
```
POST /api/payment/linepay/confirm
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "transactionId": "2024...",
  "orderId": "BM-..."
}
```

## 方案說明

### 專業會員方案
- 價格：NT$ 299
- 期限：30 天
- 檢測次數：30 次
- 功能：
  - 每日 AI 肌膚檢測
  - 個人化護膚建議
  - 肌膚數據追蹤
  - 專業分析報告

### 高級會員方案 ⭐ 推薦
- 價格：NT$ 999
- 期限：90 天
- 檢測次數：100 次
- 功能：
  - 專業方案所有功能
  - 優先客服支援
  - 產品推薦服務

### 企業版方案
- 價格：NT$ 2,999
- 期限：365 天
- 檢測次數：無限次
- 功能：
  - 高級方案所有功能
  - API 存取權限
  - 專屬美容顧問

## 付款流程

```
用戶選擇方案
    ↓
後端發起付款請求 (/api/payment/linepay/request)
    ↓
LINE Pay 返回付款 URL
    ↓
前端重定向到 LINE Pay
    ↓
用戶在 LINE Pay 完成付款
    ↓
LINE Pay 重定向到確認頁面 (/payment/confirm)
    ↓
後端確認付款 (/api/payment/linepay/confirm)
    ↓
更新資料庫會員等級
    ↓
顯示付款成功訊息
```

## 安全性

1. **HMAC SHA256 簽名**
   - 所有 API 請求都使用 HMAC SHA256 簽名
   - 防止請求被竄改

2. **Token 驗證**
   - 所有付款 API 需要有效的 JWT Token
   - 確保只有登入用戶可以付款

3. **訂單驗證**
   - 確認付款時驗證訂單金額
   - 防止金額被修改

## 測試卡號

在沙盒環境中，可以使用以下測試卡號：

- **成功付款**: 使用 LINE Pay 測試帳號
- **失敗付款**: 使用無效的測試帳號

## 常見問題

### Q: 付款後沒有自動升級會員等級？
A: 檢查以下項目：
1. 資料庫連線是否正常
2. Nhost GraphQL API 是否可正常存取
3. 確認 members 表有 level 和 expires_at 欄位

### Q: LINE Pay 回調失敗？
A: 檢查以下項目：
1. Confirm URL 是否正確設定
2. 前端路由是否正確配置
3. 檢查瀏覽器控制台的錯誤訊息

### Q: 簽名驗證失敗？
A: 檢查以下項目：
1. Channel ID 和 Secret 是否正確
2. 請求體格式是否正確（必須是 JSON）
3. nonce 是否為唯一值

## 相關文件

- [LINE Pay API 文件](https://pay.line.me/documents/online_v3.html)
- [LINE Pay 商戶中心](https://pay.line.me/tw/center/payment/main)
- [Nhost 文件](https://docs.nhost.io/)

## 技術支援

如有問題，請聯繫技術支援團隊或查閱 LINE Pay 官方文件。
