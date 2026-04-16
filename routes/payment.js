// routes/payment.js
// 付款處理：LINE Pay + 藍新金流 MPG

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const { authenticateToken } = require('../middleware/auth');
const { nhost } = require('../config/nhost');

// Helper: 使用 admin secret 執行 GraphQL（與 members.js 相同模式）
async function graphqlRequest(query, variables = {}) {
  const response = await axios.post(
    nhost.graphql.url,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
      }
    }
  );
  if (response.data.errors) {
    const error = new Error(response.data.errors[0].message);
    error.errors = response.data.errors;
    throw error;
  }
  return { data: response.data.data, error: null };
}

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
    durationDays: 30,
    analyses: 30,
    description: '30 天 30 次 AI 肌膚檢測',
    features: [
      '每日 AI 肌膚檢測',
      '個人化護膚建議',
      '肌膚數據追蹤',
      '專業分析報告'
    ],
    recommended: true
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
        confirmUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/confirm?orderId=${orderId}`,
        cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`
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

        await graphqlRequest(insertOrderMutation, {
            order: {
              user_id: userId,
              plan_id: planId,
              amount: plan.price,
              currency: 'TWD',
              transaction_id: response.data.info.transactionId,
              line_pay_order_id: orderId,
              status: 'pending',
              plan_name: plan.name,
              plan_duration: plan.durationDays,
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

    const orderResult = await graphqlRequest(getOrderQuery, { orderId });
    
    // ── Recovery path ──────────────────────────────────────────────────────────
    // Order not in DB (e.g. insert failed silently before the orders table existed).
    // We still attempt the LINE Pay confirm so the user isn't stuck.
    if (!orderResult.data?.orders || orderResult.data.orders.length === 0) {
      console.warn(`[recovery] Order ${orderId} not found in DB – attempting LINE Pay confirm anyway`);

      // Default to the only available plan; amount must match what LINE Pay holds.
      const recoveryPlan = PLANS['intermediate'];
      const recoveryBody = { amount: recoveryPlan.price, currency: 'TWD' };
      const recoveryNonce = Date.now().toString();
      const recoveryUri = `/v3/payments/${transactionId}/confirm`;
      const recoverySig = generateSignature(LINE_PAY_CHANNEL_SECRET, recoveryUri, recoveryBody, recoveryNonce);

      let linePayRes;
      try {
        linePayRes = await axios.post(`${LINE_PAY_API_URL}${recoveryUri}`, recoveryBody, {
          headers: {
            'Content-Type': 'application/json',
            'X-LINE-ChannelId': LINE_PAY_CHANNEL_ID,
            'X-LINE-Authorization-Nonce': recoveryNonce,
            'X-LINE-Authorization': recoverySig
          }
        });
      } catch (lineErr) {
        console.error('[recovery] LINE Pay confirm error:', lineErr.response?.data || lineErr.message);
        return res.status(404).json({
          success: false,
          error: { code: 'ORDER_NOT_FOUND', message: '找不到訂單，付款確認失敗，請聯繫客服' }
        });
      }

      if (linePayRes.data.returnCode !== '0000') {
        console.error('[recovery] LINE Pay returned error:', linePayRes.data);
        return res.status(400).json({
          success: false,
          error: { code: 'PAYMENT_FAILED', message: `付款確認失敗: ${linePayRes.data.returnMessage}` }
        });
      }

      // LINE Pay confirmed – create order + upgrade member
      const now = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + recoveryPlan.durationDays);
      const recoveryOrderId = orderId; // keep the original LINE Pay orderId

      try {
        const insertOrderMutation = `
          mutation InsertOrder($order: orders_insert_input!) {
            insert_orders_one(object: $order) { id }
          }
        `;
        await graphqlRequest(insertOrderMutation, {
          order: {
            user_id: userId,
            plan_id: 'intermediate',
            amount: recoveryPlan.price,
            currency: 'TWD',
            transaction_id: transactionId,
            line_pay_order_id: recoveryOrderId,
            status: 'completed',
            plan_name: recoveryPlan.name,
            plan_duration: recoveryPlan.durationDays,
            analyses_count: recoveryPlan.analyses,
            paid_at: now,
            payment_info: linePayRes.data
          }
        });
        const updateMemberMutation = `
          mutation UpdateMember($userId: uuid!, $updates: user_profiles_set_input!) {
            update_user_profiles(where: {user_id: {_eq: $userId}}, _set: $updates) { affected_rows }
          }
        `;
        await graphqlRequest(updateMemberMutation, {
          userId,
          updates: {
            member_level: 'intermediate',
            subscription_end: expiresAt.toISOString(),
            subscription_start: now,
            total_analyses: recoveryPlan.analyses,
            remaining_analyses: recoveryPlan.analyses
          }
        });
        console.log('[recovery] Order created and member upgraded for userId:', userId);
      } catch (dbErr) {
        console.error('[recovery] DB update failed:', dbErr.message);
      }

      return res.json({
        success: true,
        message: '付款成功！會員已升級',
        data: { orderId, transactionId, level: 'intermediate', expiresAt: expiresAt.toISOString() }
      });
    }
    // ── End recovery path ──────────────────────────────────────────────────────

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
      expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

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

        await graphqlRequest(updateOrderMutation, {
            orderId: order.id,
            updates: {
              status: 'completed',
              paid_at: now,
              payment_info: response.data
            }
          });

        // 2. 更新 user_profiles 會員等級
        const updateMemberMutation = `
          mutation UpdateMember($userId: uuid!, $updates: user_profiles_set_input!) {
            update_user_profiles(where: {user_id: {_eq: $userId}}, _set: $updates) {
              affected_rows
              returning {
                member_level
                subscription_end
                total_analyses
                remaining_analyses
              }
            }
          }
        `;

        const memberUpdates = {
          member_level: order.plan_id,
          subscription_end: expiresAt.toISOString(),
          subscription_start: now,
          total_analyses: plan.analyses,
          remaining_analyses: plan.analyses
        };

        const memberResult = await graphqlRequest(updateMemberMutation, {
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

// ========================================
// 藍新金流 MPG 整合
// ========================================

const NEWEBPAY_MERCHANT_ID = process.env.NEWEBPAY_MERCHANT_ID;
const NEWEBPAY_HASH_KEY = process.env.NEWEBPAY_HASH_KEY;
const NEWEBPAY_HASH_IV = process.env.NEWEBPAY_HASH_IV;
const NEWEBPAY_ENV = process.env.NEWEBPAY_ENV || 'test';

const NEWEBPAY_GATEWAY_URL = NEWEBPAY_ENV === 'production'
  ? 'https://core.newebpay.com/MPG/mpg_gateway'
  : 'https://ccore.newebpay.com/MPG/mpg_gateway';

// AES-256-CBC 加密（等同 PHP bin2hex(openssl_encrypt(...))）
function newebpayAesEncrypt(data) {
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(NEWEBPAY_HASH_KEY, 'utf8'),
    Buffer.from(NEWEBPAY_HASH_IV, 'utf8')
  );
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

// AES-256-CBC 解密
function newebpayAesDecrypt(data) {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(NEWEBPAY_HASH_KEY, 'utf8'),
    Buffer.from(NEWEBPAY_HASH_IV, 'utf8')
  );
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// SHA-256 雜湊產生 TradeSha
function generateNewebpayTradeSha(tradeInfoHex) {
  const str = `HashKey=${NEWEBPAY_HASH_KEY}&${tradeInfoHex}&HashIV=${NEWEBPAY_HASH_IV}`;
  return crypto.createHash('sha256').update(str).digest('hex').toUpperCase();
}

// 從解密後的 query string 取得 JSON 結果
function parseTradeInfo(tradeInfoHex) {
  const decrypted = newebpayAesDecrypt(tradeInfoHex);
  // TradeInfo 可能是 JSON 格式（RespondType=JSON）
  try {
    return JSON.parse(decrypted);
  } catch {
    return querystring.parse(decrypted);
  }
}

// 將 orders 的 member 升級
async function upgradeMemberAfterPayment(userId, planId, tradeNo) {
  const plan = PLANS[planId] || PLANS['intermediate'];
  const now = new Date().toISOString();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

  const updateMemberMutation = `
    mutation UpdateMember($userId: uuid!, $updates: user_profiles_set_input!) {
      update_user_profiles(where: {user_id: {_eq: $userId}}, _set: $updates) {
        affected_rows
      }
    }
  `;
  await graphqlRequest(updateMemberMutation, {
    userId,
    updates: {
      member_level: planId,
      subscription_end: expiresAt.toISOString(),
      subscription_start: now,
      total_analyses: plan.analyses,
      remaining_analyses: plan.analyses
    }
  });
  return expiresAt;
}

// ──────────────────────────────────────
// POST /api/payment/newebpay/request
// 產生藍新金流 MPG 表單資料，由前端 POST 至藍新閘道
// ──────────────────────────────────────
router.post('/newebpay/request', authenticateToken, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    if (!planId || !PLANS[planId]) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_PLAN', message: '無效的方案' } });
    }
    if (!NEWEBPAY_MERCHANT_ID || !NEWEBPAY_HASH_KEY || !NEWEBPAY_HASH_IV) {
      return res.status(500).json({ success: false, error: { code: 'CONFIG_ERROR', message: '藍新金流設定未完成' } });
    }

    const plan = PLANS[planId];
    const merchantOrderNo = `BM${Date.now()}`;
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const backendUrl = process.env.BACKEND_URL || 'https://beautymemory-6a58c48154f4.herokuapp.com';
    const frontendUrl = process.env.FRONTEND_URL || 'https://beautymemory.life';

    // TradeInfo 參數
    const tradeInfoParams = {
      MerchantID: NEWEBPAY_MERCHANT_ID,
      RespondType: 'JSON',
      TimeStamp: timeStamp,
      Version: '2.3',
      MerchantOrderNo: merchantOrderNo,
      Amt: plan.price,
      ItemDesc: plan.name,
      NotifyURL: `${backendUrl}/api/payment/newebpay/notify`,
      ReturnURL: `${backendUrl}/api/payment/newebpay/return`,
      Email: req.user.email || '',
      CREDIT: 1,
      LoginType: 0
    };

    const tradeInfoStr = querystring.stringify(tradeInfoParams);
    const tradeInfoHex = newebpayAesEncrypt(tradeInfoStr);
    const tradeSha = generateNewebpayTradeSha(tradeInfoHex);

    // 儲存訂單到資料庫
    try {
      const insertOrderMutation = `
        mutation InsertOrder($order: orders_insert_input!) {
          insert_orders_one(object: $order) { id }
        }
      `;
      await graphqlRequest(insertOrderMutation, {
        order: {
          user_id: userId,
          plan_id: planId,
          amount: plan.price,
          currency: 'TWD',
          line_pay_order_id: merchantOrderNo,
          status: 'pending',
          plan_name: plan.name,
          plan_duration: plan.durationDays,
          analyses_count: plan.analyses,
          payment_info: { gateway: 'newebpay', merchantOrderNo, timeStamp }
        }
      });
    } catch (dbError) {
      console.error('[newebpay] 儲存訂單失敗:', dbError.message);
    }

    res.json({
      success: true,
      data: {
        gatewayUrl: NEWEBPAY_GATEWAY_URL,
        formData: {
          MerchantID: NEWEBPAY_MERCHANT_ID,
          TradeInfo: tradeInfoHex,
          TradeSha: tradeSha,
          Version: '2.3'
        }
      }
    });
  } catch (error) {
    console.error('[newebpay] 請求錯誤:', error.message);
    res.status(500).json({ success: false, error: { code: 'REQUEST_FAILED', message: '付款請求失敗: ' + error.message } });
  }
});

// ──────────────────────────────────────
// POST /api/payment/newebpay/notify
// 藍新金流後端通知（server-to-server），更新訂單與會員等級
// ──────────────────────────────────────
router.post('/newebpay/notify', async (req, res) => {
  try {
    const { Status, MerchantID, TradeInfo, TradeSha } = req.body;

    // 驗證 TradeSha
    const expectedSha = generateNewebpayTradeSha(TradeInfo);
    if (expectedSha !== TradeSha) {
      console.error('[newebpay notify] TradeSha 驗證失敗');
      return res.send('0|TradeSha verify failed');
    }

    if (Status !== 'SUCCESS') {
      console.warn('[newebpay notify] 付款未成功 Status:', Status);
      return res.send('1|OK');
    }

    // 解密 TradeInfo
    const tradeData = parseTradeInfo(TradeInfo);
    const merchantOrderNo = tradeData.MerchantOrderNo || tradeData.Result?.MerchantOrderNo;
    const tradeNo = tradeData.TradeNo || tradeData.Result?.TradeNo;

    if (!merchantOrderNo) {
      console.error('[newebpay notify] 無法取得 MerchantOrderNo');
      return res.send('0|Missing MerchantOrderNo');
    }

    // 查詢訂單
    const getOrderQuery = `
      query GetOrder($orderNo: String!) {
        orders(where: {line_pay_order_id: {_eq: $orderNo}}, limit: 1) {
          id user_id plan_id amount status
        }
      }
    `;
    const orderResult = await graphqlRequest(getOrderQuery, { orderNo: merchantOrderNo });
    const order = orderResult.data?.orders?.[0];

    if (!order) {
      console.error('[newebpay notify] 找不到訂單:', merchantOrderNo);
      return res.send('0|Order not found');
    }

    if (order.status === 'completed') {
      return res.send('1|OK'); // 已處理過
    }

    // 更新訂單狀態
    const now = new Date().toISOString();
    const updateOrderMutation = `
      mutation UpdateOrder($id: uuid!, $updates: orders_set_input!) {
        update_orders_by_pk(pk_columns: {id: $id}, _set: $updates) { id }
      }
    `;
    await graphqlRequest(updateOrderMutation, {
      id: order.id,
      updates: { status: 'completed', paid_at: now, transaction_id: tradeNo, payment_info: tradeData }
    });

    // 升級會員
    await upgradeMemberAfterPayment(order.user_id, order.plan_id, tradeNo);
    console.log('[newebpay notify] 付款成功，會員升級 userId:', order.user_id);

    res.send('1|OK');
  } catch (error) {
    console.error('[newebpay notify] 錯誤:', error.message);
    res.send('0|' + error.message);
  }
});

// ──────────────────────────────────────
// POST /api/payment/newebpay/return
// 藍新金流前端瀏覽器返回，解析狀態並重導向前端
// ──────────────────────────────────────
router.post('/newebpay/return', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://beautymemory.life';
  try {
    const { Status, TradeInfo, TradeSha } = req.body;

    if (Status !== 'SUCCESS') {
      return res.redirect(`${frontendUrl}/payment/result?status=fail&message=${encodeURIComponent('付款未完成')}`);
    }

    // 驗證並解密
    const expectedSha = generateNewebpayTradeSha(TradeInfo);
    if (expectedSha !== TradeSha) {
      return res.redirect(`${frontendUrl}/payment/result?status=fail&message=${encodeURIComponent('驗證失敗')}`);
    }

    const tradeData = parseTradeInfo(TradeInfo);
    const merchantOrderNo = tradeData.MerchantOrderNo || tradeData.Result?.MerchantOrderNo;

    res.redirect(`${frontendUrl}/payment/result?status=success&orderNo=${encodeURIComponent(merchantOrderNo || '')}`);
  } catch (error) {
    console.error('[newebpay return] 錯誤:', error.message);
    res.redirect(`${frontendUrl}/payment/result?status=fail&message=${encodeURIComponent('系統錯誤')}`);
  }
});

module.exports = router;
