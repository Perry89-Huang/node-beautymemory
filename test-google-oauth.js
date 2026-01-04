// test-google-oauth.js
// 測試 Google OAuth 設定

require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:2000';

async function testGoogleOAuth() {
  console.log('🧪 開始測試 Google OAuth 設定...\n');

  // 測試 1: 檢查環境變數
  console.log('📋 Step 1: 檢查環境變數');
  console.log('----------------------------------------');
  console.log('✓ NHOST_SUBDOMAIN:', process.env.NHOST_SUBDOMAIN || '❌ 未設定');
  console.log('✓ NHOST_REGION:', process.env.NHOST_REGION || 'ap-southeast-1 (預設)');
  console.log('✓ NHOST_ADMIN_SECRET:', process.env.NHOST_ADMIN_SECRET ? '已設定 ✅' : '❌ 未設定');
  console.log('✓ BACKEND_URL:', API_BASE_URL);
  console.log('✓ FRONTEND_URL:', FRONTEND_URL);
  console.log('');

  if (!process.env.NHOST_SUBDOMAIN) {
    console.error('❌ 錯誤: NHOST_SUBDOMAIN 未設定，請檢查 .env 檔案');
    return;
  }

  // 測試 2: 取得 OAuth URL
  console.log('📋 Step 2: 測試取得 Google OAuth URL');
  console.log('----------------------------------------');
  
  try {
    const response = await axios.get(`${API_BASE_URL}/api/members/auth/google`, {
      params: {
        redirectTo: FRONTEND_URL
      }
    });

    if (response.data.success) {
      console.log('✅ OAuth URL 取得成功！');
      console.log('');
      console.log('📍 OAuth URL:');
      console.log(response.data.data.authUrl);
      console.log('');
      console.log('📍 Callback URL:');
      console.log(response.data.data.callbackUrl);
      console.log('');
      
      // 解析 URL
      const url = new URL(response.data.data.authUrl);
      console.log('📊 URL 分析:');
      console.log('  - Host:', url.host);
      console.log('  - Path:', url.pathname);
      console.log('  - Provider:', url.pathname.includes('google') ? 'Google ✅' : '❌ 非 Google');
      console.log('');

      // 測試 3: 檢查 Callback URL 格式
      const callbackUrl = response.data.data.callbackUrl;
      const callbackUrlObj = new URL(callbackUrl);
      
      console.log('📋 Step 3: 檢查 Callback URL');
      console.log('----------------------------------------');
      console.log('✓ Host:', callbackUrlObj.host);
      console.log('✓ Path:', callbackUrlObj.pathname);
      console.log('✓ 格式正確:', callbackUrlObj.pathname === '/api/members/auth/google/callback' ? '✅' : '❌');
      console.log('');

      // Google Cloud 設定建議
      console.log('📋 Step 4: Google Cloud Console 設定檢查');
      console.log('----------------------------------------');
      console.log('請確認以下設定：');
      console.log('');
      console.log('1. 已授權的 JavaScript 來源:');
      console.log('   - http://localhost:2000');
      console.log('   - http://localhost:3001');
      console.log('   - https://beautymemory.life');
      console.log('');
      console.log('2. 已授權的重新導向 URI:');
      console.log(`   - ${callbackUrl}`);
      console.log(`   - https://${process.env.NHOST_SUBDOMAIN}.nhost.run/v1/auth/callback`);
      console.log('');

      console.log('✅ 所有測試通過！');
      console.log('');
      console.log('🔗 測試連結 (複製到瀏覽器開啟):');
      console.log(response.data.data.authUrl);
      console.log('');
      console.log('⚠️ 注意: 如果出現 403 錯誤，請確認 Google Cloud Console 的設定正確');

    } else {
      console.error('❌ OAuth URL 取得失敗:', response.data.error);
    }

  } catch (error) {
    console.error('❌ 測試失敗:', error.message);
    
    if (error.response) {
      console.error('   狀態碼:', error.response.status);
      console.error('   錯誤訊息:', error.response.data);
    }
    
    console.log('');
    console.log('💡 可能的原因:');
    console.log('   1. 後端伺服器未啟動');
    console.log('   2. NHOST 設定錯誤');
    console.log('   3. 環境變數未正確設定');
    console.log('');
    console.log('請執行以下命令啟動後端:');
    console.log('   cd node-beautymemory');
    console.log('   npm start');
  }
}

// 執行測試
testGoogleOAuth().catch(console.error);
