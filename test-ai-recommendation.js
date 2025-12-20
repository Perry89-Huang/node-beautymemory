/**
 * AI 推薦系統測試腳本
 * 測試 AI 專家推薦功能
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// 模擬肌膚分析結果
const mockAnalysisResult = {
  overall_score: 72,
  skin_age: 28,
  analysis: {
    skin_type: { value: 1, confidence: 0.85 }, // 乾性
    wrinkle_detection_result: { value: 1, confidence: 0.78 },
    wrinkle_forehead_severity: { value: 2, confidence: 0.82 },
    dark_circle_severity: { value: 1, confidence: 0.75 },
    pigmentation: { value: 1, confidence: 0.70 },
    pores_forehead: { value: 1, confidence: 0.65 },
    sensitivity: { value: 0, confidence: 0.90 }
  }
};

/**
 * 測試 AI 肌膚推薦
 */
async function testSkinRecommendation() {
  console.log('='.repeat(70));
  console.log('🧪 測試 1: AI 肌膚專家推薦');
  console.log('='.repeat(70));
  
  try {
    const response = await axios.post(`${API_BASE_URL}/api/ai/skin-recommendation`, {
      analysisResult: mockAnalysisResult,
      userQuery: '我的額頭皺紋比較明顯，希望能改善，有什麼推薦的產品嗎？'
    });
    
    console.log('✅ API 回應成功\n');
    console.log('📊 推薦內容:');
    console.log('-'.repeat(70));
    console.log(response.data.data.recommendation);
    console.log('-'.repeat(70));
    console.log(`\n⏰ 時間戳記: ${response.data.data.timestamp}`);
    console.log(`🤖 使用模型: ${response.data.data.model}\n`);
    
  } catch (error) {
    console.error('❌ 錯誤:', error.response?.data || error.message);
  }
}

/**
 * 測試 AI 客服對話
 */
async function testAIChat() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 測試 2: AI 智能客服');
  console.log('='.repeat(70));
  
  const testMessages = [
    '請問荷顏有哪些抗老產品？',
    '野山蔘幹細胞精華液適合什麼膚質？',
    '你們的運送政策是什麼？'
  ];
  
  for (const message of testMessages) {
    try {
      console.log(`\n👤 客戶問題: ${message}`);
      console.log('-'.repeat(70));
      
      const response = await axios.post(`${API_BASE_URL}/api/ai/chat`, {
        message: message
      });
      
      console.log('🤖 AI 客服回應:');
      console.log(response.data.data.response);
      console.log('-'.repeat(70));
      console.log(`📦 相關產品數: ${response.data.data.relevantProducts}`);
      console.log(`❓ 相關 FAQ 數: ${response.data.data.relevantFAQ}`);
      
      // 避免請求過快
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('❌ 錯誤:', error.response?.data || error.message);
    }
  }
}

/**
 * 測試完整流程
 */
async function testCompleteFlow() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 測試 3: 完整推薦流程');
  console.log('='.repeat(70));
  
  try {
    // 1. 先獲取 AI 專家推薦
    console.log('\n📍 步驟 1: 獲取專業肌膚分析推薦...');
    const recommendResponse = await axios.post(`${API_BASE_URL}/api/ai/skin-recommendation`, {
      analysisResult: mockAnalysisResult,
      userQuery: ''
    });
    
    console.log('✅ 專業推薦獲取成功');
    console.log('\n' + '─'.repeat(70));
    console.log(recommendResponse.data.data.recommendation);
    console.log('─'.repeat(70));
    
    // 等待 2 秒
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. 針對推薦提問
    console.log('\n📍 步驟 2: 針對推薦產品進行諮詢...');
    const chatResponse = await axios.post(`${API_BASE_URL}/api/ai/chat`, {
      message: '剛才推薦的野山蔘精華液，可以和其他品牌的產品一起使用嗎？'
    });
    
    console.log('✅ 客服回答獲取成功');
    console.log('\n' + '─'.repeat(70));
    console.log(chatResponse.data.data.response);
    console.log('─'.repeat(70));
    
  } catch (error) {
    console.error('❌ 錯誤:', error.response?.data || error.message);
  }
}

/**
 * 主測試函數
 */
async function main() {
  console.log('\n');
  console.log('🌸'.repeat(35));
  console.log('          荷顏 AI 推薦系統測試');
  console.log('🌸'.repeat(35));
  console.log('\n');
  
  try {
    // 測試伺服器是否運行
    console.log('🔍 檢查伺服器狀態...');
    const healthCheck = await axios.get(`${API_BASE_URL}/health`);
    console.log(`✅ 伺服器運行正常 (v${healthCheck.data.version})\n`);
    
    // 執行測試
    await testSkinRecommendation();
    await testAIChat();
    await testCompleteFlow();
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ 所有測試完成！');
    console.log('='.repeat(70));
    console.log('\n');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ 無法連接到伺服器');
      console.error('請確保伺服器已啟動: node server1.js\n');
    } else {
      console.error('\n❌ 測試失敗:', error.message);
    }
  }
}

// 執行測試
if (require.main === module) {
  main();
}

module.exports = { testSkinRecommendation, testAIChat, testCompleteFlow };
