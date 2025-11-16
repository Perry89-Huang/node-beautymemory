# 故障排除指南

## 問題: "Failed to connect to API server"

這個錯誤表示無法連接到 Perfect Corp 的 Sulu Skin Analyze API。

### 可能的原因和解決方案

#### 1. 網路連接問題

**症狀:**
- Error code: `ENOTFOUND`, `ENETUNREACH`, `ETIMEDOUT`
- 日誌顯示 "網路連接錯誤"

**解決方案:**
```bash
# 檢查網路連接
ping skin-analyze.p.sulu.sh

# 測試 DNS 解析
nslookup skin-analyze.p.sulu.sh

# 測試 HTTPS 連接
curl -I https://skin-analyze.p.sulu.sh
```

#### 2. API Key 配置問題

**檢查步驟:**
1. 訪問診斷端點: `https://your-app.herokuapp.com/api/diagnostics`
2. 確認 `analyzer.api_key_set` 為 `true`
3. 確認 `analyzer.api_key_length` 不為 0

**設置 API Key (Heroku):**
```bash
# 設置環境變數
heroku config:set SULU_API_KEY=your_api_key_here

# 檢查環境變數
heroku config:get SULU_API_KEY

# 查看所有配置
heroku config
```

#### 3. 防火牆或代理問題

**Heroku 特定:**
- Heroku 的出站連接應該沒有限制
- 檢查是否有 IP 白名單限制

**解決方案:**
```bash
# 檢查 Heroku 日誌
heroku logs --tail

# 查看詳細的網路錯誤
heroku logs --tail | grep "Error Code"
```

#### 4. API 服務器問題

**症狀:**
- Error code: 500, 502, 503, 504
- 間歇性連接失敗

**解決方案:**
- 等待幾分鐘後重試
- 已實施自動重試機制(最多 3 次)

#### 5. 請求超時

**症狀:**
- Error code: `ECONNABORTED`, `ETIMEDOUT`
- 日誌顯示 "API 請求超時"

**配置已優化:**
- 超時時間: 30 秒
- 自動重試: 3 次
- 指數退避: 1s, 2s, 4s

## 診斷工具

### 1. 基本健康檢查
```bash
curl https://your-app.herokuapp.com/health
```

### 2. 完整診斷(包含 API 測試)
```bash
curl https://your-app.herokuapp.com/api/diagnostics?test=true
```

### 3. 檢查 Heroku 日誌
```bash
# 實時日誌
heroku logs --tail

# 最近的日誌
heroku logs -n 500

# 篩選錯誤
heroku logs --tail | grep "ERROR\\|Error\\|❌"
```

## 更新後的功能

### 1. 增強的錯誤日誌
現在會顯示:
- 錯誤類型和代碼
- 詳細的錯誤消息
- 故障排除建議
- 技術細節(URL、超時時間等)

### 2. 自動重試機制
- 網路錯誤: 自動重試
- 5xx 服務器錯誤: 自動重試
- 429 限流: 自動重試
- 4xx 客戶端錯誤: 不重試

### 3. 指數退避
- 第一次重試: 1 秒後
- 第二次重試: 2 秒後
- 第三次重試: 4 秒後

## 常見錯誤代碼解釋

| 錯誤代碼 | 說明 | 解決方案 |
|---------|------|---------|
| `ENOTFOUND` | DNS 解析失敗 | 檢查網路連接和 DNS 設定 |
| `ETIMEDOUT` | 請求超時 | 檢查網路速度,會自動重試 |
| `ECONNRESET` | 連接被重置 | 檢查防火牆設定,會自動重試 |
| `ECONNREFUSED` | 連接被拒絕 | 檢查目標服務器狀態 |
| `ENETUNREACH` | 網路不可達 | 檢查網路連接 |
| 401 | 未授權 | 檢查 API Key 是否正確 |
| 429 | 請求過於頻繁 | 會自動重試,降低請求頻率 |
| 500-504 | 服務器錯誤 | 會自動重試,稍後再試 |

## 部署檢查清單

在部署到 Heroku 之前:

- [ ] 已設置 `SULU_API_KEY` 環境變數
- [ ] API Key 有效且未過期
- [ ] 已測試本地連接 API
- [ ] 已檢查 API 使用配額
- [ ] 已查看 Heroku 日誌無錯誤

## 聯繫支援

如果問題持續存在:

1. 收集以下信息:
   - Heroku 日誌(最近 100 行)
   - 診斷端點輸出
   - 錯誤發生的時間戳
   - 測試圖片的大小和格式

2. 檢查 Perfect Corp API 狀態:
   - 訪問 API 文檔
   - 聯繫技術支援
   - 查看服務狀態頁面

## 測試命令

### 本地測試
```bash
# 安裝依賴
npm install

# 設置環境變數
$env:SULU_API_KEY="your_api_key_here"

# 啟動服務器
npm start

# 測試端點
curl http://localhost:3000/api/diagnostics?test=true
```

### Heroku 測試
```bash
# 部署最新代碼
git push heroku master

# 查看日誌
heroku logs --tail

# 測試診斷端點
curl https://your-app.herokuapp.com/api/diagnostics?test=true

# 測試分析端點
curl -X POST https://your-app.herokuapp.com/api/analyze \
  -F "image=@test-image.jpg"
```
