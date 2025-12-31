// config/nhost.js
// Nhost 配置與初始化

const { createClient } = require('@nhost/nhost-js');

// 從環境變數讀取 Nhost 配置
const NHOST_SUBDOMAIN = process.env.NHOST_SUBDOMAIN;
const NHOST_REGION = process.env.NHOST_REGION || 'ap-southeast-1';

if (!NHOST_SUBDOMAIN) {
  console.error('❌ 錯誤: 未設定 NHOST_SUBDOMAIN 環境變數');
  process.exit(1);
}

// 初始化 Nhost Client
const nhost = createClient({
  subdomain: NHOST_SUBDOMAIN,
  region: NHOST_REGION,
  
  // 自動刷新 Token
  autoRefreshToken: true,
  
  // 自動登入設定
  autoSignIn: false,
  
  // 客戶端儲存設定 (伺服器端使用記憶體儲存)
  clientStorageType: 'memory'
});

// 測試連線
async function testConnection() {
  try {
    console.log('🔄 測試 Nhost 連線...');
    
    // 使用 axios 執行簡單的 GraphQL 查詢測試連線
    const axios = require('axios');
    const response = await axios.post(
      nhost.graphql.url,
      { query: `query TestConnection { __typename }` },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET
        }
      }
    );

    if (response.data.errors) {
      console.error('❌ Nhost 連線失敗:', response.data.errors);
      return false;
    }

    console.log('✅ Nhost 連線成功');
    console.log(`   Subdomain: ${NHOST_SUBDOMAIN}`);
    console.log(`   Region: ${NHOST_REGION}`);
    console.log(`   GraphQL: ${nhost.graphql.url}`);
    return true;
  } catch (error) {
    console.error('❌ Nhost 連線測試錯誤:', error.message);
    return false;
  }
}

// 取得 Admin Secret (用於伺服器端操作)
const NHOST_ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET;

/**
 * 使用 Admin Secret 執行 GraphQL 操作
 * 用於需要繞過權限檢查的伺服器端操作
 */
async function executeAsAdmin(query, variables = {}) {
  try {
    const response = await fetch(
      `https://${NHOST_SUBDOMAIN}.nhost.run/v1/graphql`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': NHOST_ADMIN_SECRET
        },
        body: JSON.stringify({
          query,
          variables
        })
      }
    );

    const result = await response.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }

    return { data: result.data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * 儲存檔案到 Nhost Storage
 * @param {Buffer} fileBuffer - 檔案 Buffer
 * @param {String} fileName - 檔案名稱
 * @param {String} bucketId - Storage Bucket ID
 * @returns {String} 公開 URL
 */
async function uploadToStorage(fileBuffer, fileName, bucketId = 'default') {
  try {
    const { fileMetadata, error } = await nhost.storage.upload({
      file: fileBuffer,
      name: fileName,
      bucketId
    });

    if (error) {
      throw new Error(error.message);
    }

    // 取得公開 URL
    const publicUrl = nhost.storage.getPublicUrl({
      fileId: fileMetadata.id
    });

    return {
      success: true,
      url: publicUrl,
      fileId: fileMetadata.id,
      metadata: fileMetadata
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 從 Storage 刪除檔案
 */
async function deleteFromStorage(fileId) {
  try {
    const { error } = await nhost.storage.delete({ fileId });
    
    if (error) {
      throw new Error(error.message);
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  nhost,
  testConnection,
  executeAsAdmin,
  uploadToStorage,
  deleteFromStorage,
  config: {
    subdomain: NHOST_SUBDOMAIN,
    region: NHOST_REGION,
    hasAdminSecret: !!NHOST_ADMIN_SECRET
  }
};
