// test-payment.js
// 測試 LINE Pay 付款流程

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// 測試用的 Access Token (需要替換成實際的 token)
const TEST_ACCESS_TOKEN = 'your_access_token_here';

async function testPaymentFlow() {
  console.log('='.repeat(60));
  console.log('測試 LINE Pay 付款流程');
  console.log('='.repeat(60));

  try {
    // 1. 取得方案列表
    console.log('\n1. 取得方案列表...');
    const plansResponse = await axios.get(`${API_BASE_URL}/api/payment/plans`);
    console.log('方案列表:', JSON.stringify(plansResponse.data, null, 2));

    // 2. 發起付款請求 (intermediate 方案)
    console.log('\n2. 發起付款請求...');
    try {
      const requestResponse = await axios.post(
        `${API_BASE_URL}/api/payment/linepay/request`,
        {
          planId: 'intermediate'
        },
        {
          headers: {
            'Authorization': `Bearer ${TEST_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('付款請求結果:');
      console.log('- 訂單 ID:', requestResponse.data.data.orderId);
      console.log('- 交易 ID:', requestResponse.data.data.transactionId);
      console.log('- 付款 URL:', requestResponse.data.data.paymentUrl);
      console.log('\n請複製上面的付款 URL 到瀏覽器完成付款測試');

    } catch (error) {
      if (error.response?.status === 401) {
        console.log('❌ 需要登入 Token，請先登入系統取得 accessToken');
        console.log('提示: 可以從瀏覽器的 localStorage.getItem("accessToken") 取得');
      } else if (error.response?.status === 500 && 
                 error.response?.data?.error?.code === 'CONFIG_ERROR') {
        console.log('❌ LINE Pay 配置未完成');
        console.log('請在 .env 文件中設定:');
        console.log('  LINE_PAY_CHANNEL_ID=your_channel_id');
        console.log('  LINE_PAY_CHANNEL_SECRET=your_channel_secret');
        console.log('  LINE_PAY_ENV=sandbox');
      } else {
        throw error;
      }
    }

    // 3. 確認付款 (需要先完成付款才能測試)
    // console.log('\n3. 確認付款...');
    // const confirmResponse = await axios.post(
    //   `${API_BASE_URL}/api/payment/linepay/confirm`,
    //   {
    //     transactionId: 'YOUR_TRANSACTION_ID',
    //     orderId: 'YOUR_ORDER_ID'
    //   },
    //   {
    //     headers: {
    //       'Authorization': `Bearer ${TEST_ACCESS_TOKEN}`,
    //       'Content-Type': 'application/json'
    //     }
    //   }
    // );
    // console.log('確認付款結果:', JSON.stringify(confirmResponse.data, null, 2));

  } catch (error) {
    console.error('\n❌ 測試失敗:', error.message);
    if (error.response) {
      console.error('回應狀態:', error.response.status);
      console.error('錯誤詳情:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n' + '='.repeat(60));
}

// 顯示使用說明
function showUsage() {
  console.log(`
使用說明:
--------

1. 確保後端服務已啟動:
   cd node-beautymemory
   npm start

2. 設定環境變數 (.env):
   LINE_PAY_CHANNEL_ID=your_channel_id
   LINE_PAY_CHANNEL_SECRET=your_channel_secret
   LINE_PAY_ENV=sandbox

3. 取得測試用的 Access Token:
   - 在瀏覽器登入系統
   - 開啟開發者工具 (F12)
   - Console 執行: localStorage.getItem('accessToken')
   - 將 token 複製到本腳本的 TEST_ACCESS_TOKEN 變數

4. 執行測試:
   node test-payment.js

5. 完整付款流程測試:
   - 執行腳本取得付款 URL
   - 在瀏覽器開啟付款 URL
   - 使用 LINE Pay 測試帳號完成付款
   - 系統自動重定向回確認頁面
   - 檢查會員等級是否已升級
  `);
}

// 執行測試
if (TEST_ACCESS_TOKEN === 'your_access_token_here') {
  showUsage();
  console.log('\n⚠️  請先設定 TEST_ACCESS_TOKEN 變數\n');
} else {
  testPaymentFlow();
}
