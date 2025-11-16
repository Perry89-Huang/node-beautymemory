# 400 Bad Request 錯誤診斷指南

## 問題描述
收到 HTTP 400 (Bad Request) 錯誤，API 返回 "Unknown error"。

## 快速診斷步驟

### 1. 檢查 API Key
```bash
# Heroku
heroku config:get AILAB_API_KEY
heroku config:get SULU_API_KEY

# 本地
echo $env:AILAB_API_KEY
```

**常見問題:**
- ❌ API Key 未設置
- ❌ API Key 格式錯誤 (有多餘空格)
- ❌ 使用了過期的 API Key
- ❌ API Key 沒有使用此服務的權限

**解決方案:**
1. 前往 [AILabTools Console](https://www.ailabtools.com/console)
2. 確認 API Key 有效
3. 檢查 API 配額是否充足
4. 重新設置環境變數:
```bash
# Heroku
heroku config:set AILAB_API_KEY=your_correct_api_key_here

# 本地 .env
AILAB_API_KEY=your_correct_api_key_here
```

### 2. 檢查圖片格式

AILabTools API 要求:
- ✅ 格式: JPG/JPEG only
- ✅ 大小: 最大 5 MB
- ✅ 解析度: 200×200px ~ 4096×4096px
- ✅ 臉部像素: 最小 400×400px (建議)

**檢查方法:**
```javascript
// 使用測試腳本
node test-ailab-api.js
```

### 3. 運行診斷測試

```bash
# 1. 安裝依賴 (如果還沒安裝)
npm install

# 2. 運行測試腳本
node test-ailab-api.js

# 3. 查看詳細日誌
heroku logs --tail | grep "❌"
```

### 4. 檢查 API 配額

訪問 [AILabTools Console](https://www.ailabtools.com/console) 確認:
- API 使用配額是否充足
- API Key 是否啟用
- 是否有地區限制

## 常見錯誤碼

| HTTP 狀態 | 說明 | 解決方案 |
|----------|------|---------|
| 400 | 請求格式錯誤 | 檢查圖片格式、大小、API Key 格式 |
| 401 | 未授權 | API Key 無效或過期 |
| 403 | 禁止訪問 | API 配額不足或無權限 |
| 429 | 請求過頻 | 降低請求頻率，稍後重試 |

## 具體檢查項目

### ✅ 檢查清單

- [ ] API Key 已正確設置
- [ ] API Key 格式正確 (無多餘空格或換行)
- [ ] 圖片格式為 JPG/JPEG
- [ ] 圖片大小 < 5MB
- [ ] 圖片解析度在範圍內
- [ ] API 配額充足
- [ ] 網路連接正常

## 測試命令

### 測試 1: 環境變數
```powershell
# 檢查環境變數
$env:AILAB_API_KEY
$env:SULU_API_KEY

# 設置環境變數 (臨時)
$env:AILAB_API_KEY="your_api_key_here"

# 或在 .env 文件
AILAB_API_KEY=your_api_key_here
```

### 測試 2: API 連接
```bash
# 運行測試腳本
node test-ailab-api.js
```

### 測試 3: 手動測試
```bash
# 使用 curl 測試 (Windows PowerShell)
curl.exe -X POST "https://www.ailabapi.com/api/portrait/analysis/skin-analysis-advanced" `
  -H "ailabapi-api-key: YOUR_API_KEY" `
  -F "image=@test-image.jpg"
```

### 測試 4: 診斷端點
```bash
# 本地
curl http://localhost:3000/api/diagnostics?test=true

# Heroku
curl https://beautymemory-6a58c48154f4.herokuapp.com/api/diagnostics?test=true
```

## 更新代碼後的改進

我已經在代碼中添加了:

1. **更詳細的日誌**
   - 顯示 HTTP 狀態碼
   - 顯示完整錯誤訊息
   - 顯示 API Key 長度

2. **更好的錯誤處理**
   - 檢查 HTTP 狀態碼
   - 檢查 error_code 欄位
   - 檢查是否有 result 欄位

3. **診斷工具**
   - `test-ailab-api.js` 測試腳本
   - `/api/diagnostics` 診斷端點

## 下一步操作

1. **重新部署**
```bash
git add .
git commit -m "改進錯誤處理和日誌"
git push heroku master
```

2. **運行診斷**
```bash
# 查看日誌
heroku logs --tail

# 運行測試
node test-ailab-api.js
```

3. **檢查結果**
   - 查看詳細的錯誤訊息
   - 根據錯誤碼採取相應措施
   - 檢查 API Key 是否有效

## 聯繫支援

如果問題持續:

1. 收集信息:
   - 完整的錯誤日誌
   - API Key (前8位)
   - 測試圖片的資訊 (大小、格式)
   - `test-ailab-api.js` 的輸出

2. 聯繫 AILabTools 支援:
   - 網站: https://www.ailabtools.com/support
   - 提供收集的信息

3. 檢查服務狀態:
   - 確認 AILabTools API 服務正常運行
   - 查看是否有維護公告
