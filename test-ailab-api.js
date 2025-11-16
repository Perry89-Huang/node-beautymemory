// test-ailab-api.js
// 測試 AILabTools API 連接

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function testAPIConnection() {
  console.log('🧪 測試 AILabTools API 連接\n');
  
  // 1. 檢查環境變數
  console.log('1️⃣ 檢查環境變數:');
  const apiKey = process.env.AILAB_API_KEY || process.env.SULU_API_KEY;
  console.log(`   - AILAB_API_KEY: ${process.env.AILAB_API_KEY ? '✅ 已設置' : '❌ 未設置'}`);
  console.log(`   - SULU_API_KEY: ${process.env.SULU_API_KEY ? '✅ 已設置' : '❌ 未設置'}`);
  console.log(`   - 使用的 API Key: ${apiKey ? apiKey.substring(0, 10) + '...' : '無'}`);
  console.log(`   - API Key 長度: ${apiKey ? apiKey.length : 0}\n`);
  
  if (!apiKey) {
    console.error('❌ 錯誤: 未找到 API Key');
    console.log('\n💡 解決方案:');
    console.log('   1. 在 .env 文件中設置 AILAB_API_KEY=your_key_here');
    console.log('   2. 或設置環境變數: $env:AILAB_API_KEY="your_key_here"');
    process.exit(1);
  }
  
  // 2. 測試 API 端點連接
  console.log('2️⃣ 測試 API 端點連接:');
  const baseURL = 'https://www.ailabapi.com';
  const endpoint = '/api/portrait/analysis/skin-analysis-advanced';
  console.log(`   - URL: ${baseURL}${endpoint}`);
  
  try {
    const pingResponse = await axios.get(baseURL, { timeout: 5000, validateStatus: () => true });
    console.log(`   - 基礎連接: ✅ 成功 (${pingResponse.status})\n`);
  } catch (error) {
    console.log(`   - 基礎連接: ❌ 失敗 (${error.message})\n`);
  }
  
  // 3. 測試圖片上傳 (如果有測試圖片)
  const testImagePath = './test-image.jpg';
  if (fs.existsSync(testImagePath)) {
    console.log('3️⃣ 測試圖片分析:');
    console.log(`   - 測試圖片: ${testImagePath}`);
    
    const stats = fs.statSync(testImagePath);
    console.log(`   - 圖片大小: ${(stats.size / 1024).toFixed(2)} KB`);
    
    try {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(testImagePath));
      
      console.log('   - 發送請求...');
      const response = await axios.post(
        `${baseURL}${endpoint}`,
        formData,
        {
          headers: {
            'ailabapi-api-key': apiKey,
            ...formData.getHeaders()
          },
          timeout: 30000,
          validateStatus: () => true
        }
      );
      
      console.log(`   - HTTP 狀態: ${response.status}`);
      console.log(`   - 回應資料:`);
      console.log(JSON.stringify(response.data, null, 2).substring(0, 1000));
      
      if (response.status === 200 && response.data.error_code === 0) {
        console.log('\n✅ 測試成功！API 連接正常。');
      } else {
        console.log(`\n❌ API 返回錯誤:`);
        console.log(`   - error_code: ${response.data.error_code}`);
        console.log(`   - error_msg: ${response.data.error_msg}`);
        console.log(`   - error_detail:`, response.data.error_detail);
        
        // 常見錯誤解決方案
        console.log('\n💡 可能的問題:');
        if (response.status === 401) {
          console.log('   ❌ API Key 無效或過期');
          console.log('      → 請檢查 API Key 是否正確');
          console.log('      → 前往 https://www.ailabtools.com/console 確認');
        } else if (response.status === 400) {
          console.log('   ❌ 請求格式錯誤');
          console.log('      → 檢查圖片格式 (需要 JPG/JPEG)');
          console.log('      → 檢查圖片大小 (最大 5MB)');
          console.log('      → 檢查圖片解析度 (200x200 ~ 4096x4096)');
        } else if (response.status === 403) {
          console.log('   ❌ API 配額不足或權限問題');
          console.log('      → 檢查 API 使用配額');
          console.log('      → 確認 API Key 有使用此服務的權限');
        } else if (response.status === 429) {
          console.log('   ❌ 請求過於頻繁');
          console.log('      → 稍後再試');
          console.log('      → 檢查 API 速率限制');
        }
      }
      
    } catch (error) {
      console.log(`\n❌ 請求失敗:`);
      console.log(`   - 錯誤類型: ${error.code || 'UNKNOWN'}`);
      console.log(`   - 錯誤訊息: ${error.message}`);
      
      if (error.response) {
        console.log(`   - HTTP 狀態: ${error.response.status}`);
        console.log(`   - 回應資料:`, error.response.data);
      }
    }
  } else {
    console.log('3️⃣ 跳過圖片測試 (找不到 test-image.jpg)');
    console.log('   💡 提示: 在當前目錄放置 test-image.jpg 進行完整測試\n');
  }
}

// 執行測試
testAPIConnection().catch(error => {
  console.error('\n💥 測試過程發生錯誤:', error.message);
  process.exit(1);
});
