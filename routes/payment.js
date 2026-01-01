// routes/payment.js
// LINE Pay 付款處理

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');
const { nhost } = require('../config/nhost');

// LINE Pay 配置
const LINE_PAY_CHANNEL_ID = process.env.LINE_PAY_CHANNEL_ID;
const LINE_PAY_CHANNEL_SECRET = process.env.LINE_PAY_CHANNEL_SECRET;
const LINE_PAY_ENV = process.env.LINE_PAY_ENV || 'sandbox'; // sandbox 或 production

// LINE Pay API URLs
const LINE_PAY_API_URL = LINE_PAY_ENV === 'production' 
  ? 'https://api-pay.line.me'
  : 'https://sandbox-api-pay.line.me';

// 方案配置
const PLANS = {
  intermediate: {
    name: '專業會員方案',
    price: 299,
    duration: '30 天',
    analyses: 30,
    description: '每月 30 次 AI 肌膚檢測',
    features: [
      '每日 AI 肌膚檢測',
      '個人化護膚建議',
      '肌膚數據追蹤',
      '專業分析報告'
    ],
    recommended: false
  },
  expert: {
    name: '高級會員方案',
    price: 999,
    duration: '90 天',
    analyses: 100,
    description: '三個月 100 次 AI 肌膚檢測',
    features: [
      '每日 AI 肌膚檢測',
      '個人化護膚建議',
      '肌膚數據追蹤',
      '專業分析報告',
      '優先客服支援',
      '產品推薦服務'
    ],
    recommended: true
  },
  enterprise: {
    name: '企業版方案',
    price: 2999,
    duration: '365 天',
    analyses: -1, // 無限次
    description: '一年無限次 AI 肌膚檢測',
    features: [
      '無限次 AI 肌膚檢測',
      '個人化護膚建議',
      '肌膚數據追蹤',
      '專業分析報告',
      '優先客服支援',
      '產品推薦服務',
      'API 存取權限',
      '專屬美容顧問'
    ],
    recommended: false
  }
};

// 生成 HMAC 簽名
function generateSignature(channelSecret, uri, body, nonce) {
  const message = channelSecret + uri + JSON.stringify(body) + nonce;
  return crypto.createHmac('sha256', channelSecret).update(message).digest('base64');
}

// ========================================
// 取得可用方案
// ========================================
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    data: Object.entries(PLANS).map(([key, plan]) => ({
      id: key,
      ...plan
    }))
  });
});

// ========================================
// 發起付款請求
// ========================================
router.post('/linepay/request', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    if (!planId || !PLANS[planId]) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PLAN',
          message: '無效的方案'
        }
      });
    }

    if (!LINE_PAY_CHANNEL_ID || !LINE_PAY_CHANNEL_SECRET) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'LINE Pay 配置未完成'
        }
      });
    }

    const plan = PLANS[planId];
    const orderId = `BM-${Date.now()}-${userId.substring(0, 8)}`;

    // LINE Pay Request API 請求體
    const requestBody = {
      amount: plan.price,
      currency: 'TWD',
      orderId: orderId,
      packages: [
        {
          id: planId,
          amount: plan.price,
          name: plan.name,
          products: [
            {
              id: planId,
              name: plan.name,
              quantity: 1,
              price: plan.price
            }
          ]
        }
      ],
      redirectUrls: {
        confirmUrl: `${process.env.FRONTEND_URL || 'http://localhost:2000'}/payment/confirm?orderId=${orderId}`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:2000'}/payment/cancel`
      }
    };

    // 生成簽名
    const nonce = Date.now().toString();
    const uri = '/v3/payments/request';
    const signature = generateSignature(LINE_PAY_CHANNEL_SECRET, uri, requestBody, nonce);

    // 呼叫 LINE Pay API
    const response = await axios.post(
      `${LINE_PAY_API_URL}${uri}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization': signature
        }
      }
    );

    if (response.data.returnCode === '0000') {
      // 儲存訂單資訊到資料庫
      try {
        const insertOrderMutation = `
          mutation InsertOrder($order: orders_insert_input!) {
            insert_orders_one(object: $order) {
              id
              line_pay_order_id
            }
          }
        `;

        await nhost.graphql.request(insertOrderMutation, {
          order: {
            user_id: userId,
            plan_id: planId,
            amount: plan.price,
            currency: 'TWD',
            transaction_id: response.data.info.transactionId,
            line_pay_order_id: orderId,
            status: 'pending',
            plan_name: plan.name,
            plan_duration: parseInt(plan.duration),
            analyses_count: plan.analyses,
            payment_info: response.data
          }
        });
      } catch (dbError) {
        console.error('儲存訂單失敗:', dbError);
        // 即使資料庫儲存失敗，仍返回付款連結給用戶
      }
      
      res.json({
        success: true,
        data: {
          orderId: orderId,
          transactionId: response.data.info.transactionId,
          paymentUrl: response.data.info.paymentUrl.web,
          plan: plan
        }
      });
    } else {
      throw new Error(`LINE Pay 錯誤: ${response.data.returnMessage}`);
    }

  } catch (error) {
    console.error('LINE Pay 請求錯誤:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_REQUEST_FAILED',
        message: '付款請求失敗: ' + (error.response?.data?.returnMessage || error.message)
      }
    });
  }
});

// ========================================
// 確認付款
// ========================================
router.post('/linepay/confirm', authenticateToken, async (req, res) => {
  try {
    const { transactionId, orderId } = req.body;
    const userId = req.user.id;

    if (!transactionId || !orderId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: '缺少交易 ID 或訂單 ID'
        }
      });
    }

    // 從資料庫查詢訂單資訊
    const getOrderQuery = `
      query GetOrder($orderId: String!) {
        orders(where: {line_pay_order_id: {_eq: $orderId}}, limit: 1) {
          id
          user_id
          plan_id
          amount
          status
        }
      }
    `;

    const orderResult = await nhost.graphql.request(getOrderQuery, { orderId });
    
    if (!orderResult.data?.orders || orderResult.data.orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ORDER_NOT_FOUND',
          message: '找不到訂單'
        }
      });
    }

    const order = orderResult.data.orders[0];
    
    // 確認訂單屬於當前用戶
    if (order.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '無權存取此訂單'
        }
      });
    }

    // 如果訂單已經完成，直接返回成功
    if (order.status === 'completed') {
      return res.json({
        success: true,
        message: '訂單已完成'
      });
    }

    const requestBody = {
      amount: order.amount,
      currency: 'TWD'
    };

    const nonce = Date.now().toString();
    const uri = `/v3/payments/${transactionId}/confirm`;
    const signature = generateSignature(LINE_PAY_CHANNEL_SECRET, uri, requestBody, nonce);

    const response = await axios.post(
      `${LINE_PAY_API_URL}${uri}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
          'X-LINE-Authorization-Nonce': nonce,
          'X-LINE-Authorization': signature
        }
      }
    );

    if (response.data.returnCode === '0000') {
      // 付款成功，更新訂單狀態和會員等級
      const plan = PLANS[order.plan_id];
      const now = new Date().toISOString();
      
      // 計算會員到期日
      const expiresAt = new Date();
      const durationDays = parseInt(plan.duration);
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      try {
        // 1. 更新訂單狀態
        const updateOrderMutation = `
          mutation UpdateOrder($orderId: uuid!, $updates: orders_set_input!) {
            update_orders_by_pk(pk_columns: {id: $orderId}, _set: $updates) {
              id
              status
            }
          }
        `;

        await nhost.graphql.request(updateOrderMutation, {
          orderId: order.id,
          updates: {
            status: 'completed',
            paid_at: now,
            payment_info: response.data
          }
        });

        // 2. 更新會員等級
        const updateMemberMutation = `
          mutation UpdateMember($userId: uuid!, $updates: members_set_input!) {
            update_members(where: {user_id: {_eq: $userId}}, _set: $updates) {
              affected_rows
              returning {
                level
                expires_at
                total_analyses
                remaining_analyses
              }
            }
          }
        `;

        const memberUpdates = {
          level: order.plan_id,
          expires_at: expiresAt.toISOString(),
          total_analyses: plan.analyses,
          remaining_analyses: plan.analyses,
          updated_at: now
        };

        const memberResult = await nhost.graphql.request(updateMemberMutation, {
          userId: userId,
          updates: memberUpdates
        });

        console.log('會員升級成功:', memberResult.data);

      } catch (dbError) {
        console.error('更新資料庫失敗:', dbError);
        // 即使更新失敗，也返回付款成功
        // 可以之後手動處理
      }
      
      res.json({
        success: true,
        message: '付款成功！會員已升級',
        data: {
          orderId: orderId,
          transactionId: transactionId,
          level: order.plan_id,
          expiresAt: expiresAt.toISOString()
        }
      });
    } else {
      throw new Error(`付款確認失敗: ${response.data.returnMessage}`);
    }

  } catch (error) {
    console.error('LINE Pay 確認錯誤:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_CONFIRM_FAILED',
        message: '付款確認失敗: ' + (error.response?.data?.returnMessage || error.message)
      }
    });
  }
});

module.exports = router;
