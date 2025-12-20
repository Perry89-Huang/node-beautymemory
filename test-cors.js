/**
 * CORS 測試腳本
 * 測試 CORS 設定是否正確
 */

const axios = require('axios');

const BASE_URL = 'https://line-thefreen-1f18f78e0b98.herokuapp.com';
const ORIGIN = 'https://beautymemory.life';

async function testCORS() {
  console.log('='.repeat(70));
  console.log('🧪 CORS 設定測試');
  console.log('='.repeat(70));
  console.log(`\n測試 URL: ${BASE_URL}`);
  console.log(`來源 Origin: ${ORIGIN}\n`);

  // 測試 1: OPTIONS 請求 (Preflight)
  console.log('📍 測試 1: OPTIONS Preflight 請求');
  console.log('-'.repeat(70));
  try {
    const response = await axios.options(`${BASE_URL}/api/members/login`, {
      headers: {
        'Origin': ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type,Authorization'
      }
    });
    
    console.log('✅ OPTIONS 請求成功');
    console.log('CORS Headers:');
    console.log(`  - Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin']}`);
    console.log(`  - Access-Control-Allow-Methods: ${response.headers['access-control-allow-methods']}`);
    console.log(`  - Access-Control-Allow-Headers: ${response.headers['access-control-allow-headers']}`);
    console.log(`  - Access-Control-Allow-Credentials: ${response.headers['access-control-allow-credentials']}`);
  } catch (error) {
    console.error('❌ OPTIONS 請求失敗');
    if (error.response) {
      console.error(`狀態碼: ${error.response.status}`);
      console.error(`Headers:`, error.response.headers);
    } else {
      console.error(`錯誤: ${error.message}`);
    }
  }

  console.log('\n');

  // 測試 2: GET 請求
  console.log('📍 測試 2: GET 請求 (健康檢查)');
  console.log('-'.repeat(70));
  try {
    const response = await axios.get(`${BASE_URL}/health`, {
      headers: {
        'Origin': ORIGIN
      }
    });
    
    console.log('✅ GET 請求成功');
    console.log('CORS Headers:');
    console.log(`  - Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin']}`);
    console.log(`回應:`, response.data);
  } catch (error) {
    console.error('❌ GET 請求失敗');
    console.error(`錯誤: ${error.message}`);
  }

  console.log('\n');

  // 測試 3: POST 請求 (模擬登入)
  console.log('📍 測試 3: POST 請求 (登入端點)');
  console.log('-'.repeat(70));
  try {
    const response = await axios.post(
      `${BASE_URL}/api/members/login`,
      {
        email: 'test@example.com',
        password: 'wrongpassword'
      },
      {
        headers: {
          'Origin': ORIGIN,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true // 接受所有狀態碼
      }
    );
    
    console.log(`✅ POST 請求完成 (狀態: ${response.status})`);
    console.log('CORS Headers:');
    console.log(`  - Access-Control-Allow-Origin: ${response.headers['access-control-allow-origin']}`);
    console.log(`  - Access-Control-Allow-Credentials: ${response.headers['access-control-allow-credentials']}`);
    
    if (response.status === 401 || response.status === 400) {
      console.log('✅ CORS 正常 (預期的驗證失敗)');
    } else {
      console.log(`回應:`, response.data);
    }
  } catch (error) {
    console.error('❌ POST 請求失敗');
    if (error.response) {
      console.error(`狀態碼: ${error.response.status}`);
      console.error(`Headers:`, error.response.headers);
    } else {
      console.error(`錯誤: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('測試完成');
  console.log('='.repeat(70));
}

// 執行測試
testCORS().catch(console.error);
