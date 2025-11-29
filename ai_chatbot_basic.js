/**
 * 荷顏 AI 客服系統 - Node.js 基礎版
 * 使用 Anthropic Claude API + 簡單關鍵字搜尋
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const readline = require('readline');

// ========== 設定 ==========
require('dotenv').config();
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

const anthropic = new Anthropic({
  apiKey: CLAUDE_API_KEY,
});

// ========== 載入知識庫 ==========
function loadKnowledgeBase() {
  const data = fs.readFileSync('knowledge_base.json', 'utf8');
  return JSON.parse(data);
}

// ========== 簡單的關鍵字搜尋 ==========
function searchRelevantInfo(userQuery, knowledgeBase) {
  const relevantInfo = {
    products: [],
    faq: [],
    policies: {}
  };
  
  const queryLower = userQuery.toLowerCase();
  
  // 搜尋相關產品
  knowledgeBase.products.forEach(product => {
    const keywords = [
      product.name.toLowerCase(),
      product.category.toLowerCase(),
      '精華', '面霜', '保濕', '抗老'
    ];
    
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      relevantInfo.products.push(product);
    }
  });
  
  // 搜尋相關 FAQ
  knowledgeBase.faq.forEach(faq => {
    const questionWords = faq.question.toLowerCase().split(' ');
    if (questionWords.some(word => queryLower.includes(word))) {
      relevantInfo.faq.push(faq);
    }
  });
  
  // 搜尋政策資訊
  const shippingKeywords = ['運送', '配送', '出貨', '物流'];
  const returnKeywords = ['退貨', '退換', '退款', '換貨'];
  
  if (shippingKeywords.some(keyword => queryLower.includes(keyword))) {
    relevantInfo.policies.shipping = knowledgeBase.policies.shipping;
  }
  
  if (returnKeywords.some(keyword => queryLower.includes(keyword))) {
    relevantInfo.policies.return = knowledgeBase.policies.return;
  }
  
  return relevantInfo;
}

// ========== 建立 AI 客服提示詞 ==========
function createPrompt(userQuery, relevantInfo, knowledgeBase) {
  const context = `
你是荷顏(Lotus Beauty)的專業AI客服助理。

【公司資訊】
${JSON.stringify(knowledgeBase.company_info, null, 2)}

【相關產品資訊】
${relevantInfo.products.length > 0 ? JSON.stringify(relevantInfo.products, null, 2) : "無直接相關產品"}

【相關常見問題】
${relevantInfo.faq.length > 0 ? JSON.stringify(relevantInfo.faq, null, 2) : "無直接相關FAQ"}

【相關政策】
${Object.keys(relevantInfo.policies).length > 0 ? JSON.stringify(relevantInfo.policies, null, 2) : "無直接相關政策"}

【回答原則】
1. 使用溫暖親切的繁體中文,適度使用表情符號(不要過度)
2. 只根據以上知識庫內容回答,不要編造資訊
3. 如果知識庫沒有相關資訊,請誠實告知並建議聯繫真人客服
4. 涉及醫療建議時,提醒客戶諮詢皮膚科醫師
5. 推薦產品時要說明理由
6. 回答要簡潔明瞭,必要時使用條列式

【客戶問題】
${userQuery}

請以專業親切的態度回答客戶問題。
`;
  
  return context;
}

// ========== 呼叫 Claude API ==========
async function getAIResponse(userQuery, knowledgeBase) {
  try {
    // 1. 搜尋相關資訊
    const relevantInfo = searchRelevantInfo(userQuery, knowledgeBase);
    
    // 2. 建立提示詞
    const prompt = createPrompt(userQuery, relevantInfo, knowledgeBase);
    
    // 3. 呼叫 Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    return message.content[0].text;
    
  } catch (error) {
    return `系統錯誤: ${error.message}`;
  }
}

// ========== 主程式 - 命令列對話介面 ==========
async function main() {
  console.log('='.repeat(60));
  console.log('🌸 荷顏 AI 客服系統 - 測試版 (Node.js)');
  console.log('='.repeat(60));
  console.log('提示: 輸入 \'exit\' 或 \'quit\' 結束對話\n');
  
  // 載入知識庫
  const knowledgeBase = loadKnowledgeBase();
  
  // 建立命令列介面
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // 遞迴函數處理對話
  const chat = () => {
    rl.question('👤 您: ', async (userInput) => {
      const input = userInput.trim();
      
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit' || 
          input === '結束' || input === '離開') {
        console.log('\n🌸 感謝您使用荷顏客服系統,祝您有美好的一天!');
        rl.close();
        return;
      }
      
      if (!input) {
        chat();
        return;
      }
      
      process.stdout.write('\n🤖 荷顏客服: ');
      const response = await getAIResponse(input, knowledgeBase);
      console.log(response);
      console.log('\n' + '-'.repeat(60) + '\n');
      
      chat();
    });
  };
  
  chat();
}

// 執行主程式
if (require.main === module) {
  main();
}

module.exports = { getAIResponse, loadKnowledgeBase };
