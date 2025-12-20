/**
 * AI 推薦系統 - 簡單使用範例
 */

// ========================================
// 範例 1: 從前端調用 AI 推薦
// ========================================

// 在 React 組件中
async function handleGetAIRecommendation() {
  try {
    const response = await fetch('http://localhost:3000/api/ai/skin-recommendation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        analysisResult: {
          overall_score: 75,
          skin_age: 28,
          analysis: {
            skin_type: { value: 1 },  // 乾性
            wrinkle_detection_result: { value: 1 },
            dark_circle_severity: { value: 2 },
            pigmentation: { value: 1 }
          }
        },
        userQuery: '我的黑眼圈很嚴重，有什麼推薦的改善方法嗎？'
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('AI 推薦:', data.data.recommendation);
      // 顯示推薦內容到 UI
    }
  } catch (error) {
    console.error('錯誤:', error);
  }
}

// ========================================
// 範例 2: AI 客服對話
// ========================================

async function chatWithAI(userMessage) {
  try {
    const response = await fetch('http://localhost:3000/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: userMessage
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('AI 回應:', data.data.response);
      console.log('相關產品數:', data.data.relevantProducts);
      console.log('相關 FAQ 數:', data.data.relevantFAQ);
    }
  } catch (error) {
    console.error('錯誤:', error);
  }
}

// 使用範例
chatWithAI('請問荷顏有哪些適合乾性肌膚的產品？');

// ========================================
// 範例 3: 完整的 React Hook
// ========================================

import { useState } from 'react';

function useAIRecommendation() {
  const [recommendation, setRecommendation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getRecommendation = async (analysisResult, userQuery = '') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:3000/api/ai/skin-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analysisResult,
          userQuery
        })
      });

      if (!response.ok) {
        throw new Error('獲取推薦失敗');
      }

      const data = await response.json();
      setRecommendation(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { recommendation, loading, error, getRecommendation };
}

// 在組件中使用
function SkinAnalysisPage() {
  const { recommendation, loading, error, getRecommendation } = useAIRecommendation();
  const [analysisResult, setAnalysisResult] = useState(null);

  const handleGetAIAdvice = () => {
    if (analysisResult) {
      getRecommendation(analysisResult, '希望能改善皺紋問題');
    }
  };

  return (
    <div>
      {/* 顯示分析結果 */}
      {analysisResult && (
        <button onClick={handleGetAIAdvice} disabled={loading}>
          {loading ? '正在獲取 AI 推薦...' : '獲取 AI 專家建議'}
        </button>
      )}

      {/* 顯示推薦 */}
      {recommendation && (
        <div className="ai-recommendation">
          <h3>AI 專家推薦</h3>
          <p>{recommendation.recommendation}</p>
          <small>生成時間: {new Date(recommendation.timestamp).toLocaleString()}</small>
        </div>
      )}

      {/* 錯誤訊息 */}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

// ========================================
// 範例 4: 使用 Axios
// ========================================

import axios from 'axios';

const aiAPI = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// AI 推薦
export async function getAISkinRecommendation(analysisResult, userQuery) {
  const response = await aiAPI.post('/ai/skin-recommendation', {
    analysisResult,
    userQuery
  });
  return response.data.data;
}

// AI 客服
export async function chatWithAI(message) {
  const response = await aiAPI.post('/ai/chat', {
    message
  });
  return response.data.data;
}

// 使用
async function example() {
  try {
    // 獲取推薦
    const recommendation = await getAISkinRecommendation({
      overall_score: 80,
      skin_age: 25,
      analysis: {
        skin_type: { value: 2 }
      }
    });
    console.log(recommendation);

    // 客服對話
    const chatResponse = await chatWithAI('請問運送需要多久？');
    console.log(chatResponse);
  } catch (error) {
    console.error(error);
  }
}

// ========================================
// 範例 5: 錯誤處理
// ========================================

async function robustAICall(analysisResult) {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/ai/skin-recommendation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ analysisResult })
      });

      if (response.status === 429) {
        // 速率限制，等待後重試
        console.log('速率限制，等待 10 秒後重試...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        continue;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || '請求失敗');
      }

      const data = await response.json();
      return data.data;

    } catch (error) {
      lastError = error;
      console.error(`嘗試 ${i + 1}/${maxRetries} 失敗:`, error.message);
      
      if (i < maxRetries - 1) {
        // 等待後重試
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  throw new Error(`經過 ${maxRetries} 次重試後仍然失敗: ${lastError.message}`);
}

// ========================================
// 範例 6: TypeScript 類型定義
// ========================================

// types.ts
export interface AnalysisResult {
  overall_score?: number;
  skin_age?: number;
  analysis: {
    [key: string]: {
      value: number;
      confidence?: number;
    };
  };
}

export interface AIRecommendation {
  recommendation: string;
  timestamp: string;
  model: string;
}

export interface ChatResponse {
  response: string;
  timestamp: string;
  relevantProducts: number;
  relevantFAQ: number;
}

// api.ts
export async function getAISkinRecommendation(
  analysisResult: AnalysisResult,
  userQuery?: string
): Promise<AIRecommendation> {
  const response = await fetch('http://localhost:3000/api/ai/skin-recommendation', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ analysisResult, userQuery })
  });

  if (!response.ok) {
    throw new Error('Failed to get AI recommendation');
  }

  const data = await response.json();
  return data.data;
}
