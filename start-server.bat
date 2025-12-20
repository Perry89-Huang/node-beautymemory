@echo off
chcp 65001 >nul
echo.
echo ========================================
echo 🌸 美魔力 AI 系統快速啟動
echo ========================================
echo.

REM 檢查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 錯誤: 未安裝 Node.js
    echo 請先安裝 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js 版本:
node --version
echo.

REM 檢查 .env 文件
if not exist ".env" (
    echo ⚠️  警告: 找不到 .env 文件
    echo.
    echo 請創建 .env 文件並添加以下內容:
    echo.
    echo CLAUDE_API_KEY=your_claude_api_key
    echo NHOST_SUBDOMAIN=your_nhost_subdomain
    echo AILAB_API_KEY=your_ailab_api_key
    echo.
    pause
    exit /b 1
)

echo ✅ .env 文件存在
echo.

REM 檢查 node_modules
if not exist "node_modules" (
    echo 📦 正在安裝依賴...
    call npm install
    if errorlevel 1 (
        echo ❌ npm install 失敗
        pause
        exit /b 1
    )
    echo ✅ 依賴安裝完成
    echo.
)

echo 🚀 啟動伺服器...
echo.
echo 伺服器將在 http://localhost:3000 啟動
echo.
echo 📋 可用端點:
echo    - POST /api/ai/skin-recommendation  (AI 肌膚推薦)
echo    - POST /api/ai/chat                  (AI 客服)
echo    - POST /api/analysis/analyze         (肌膚檢測)
echo.
echo 按 Ctrl+C 停止伺服器
echo.
echo ========================================
echo.

node server1.js

pause
