// SkinAnalyzer.js (now using AILabTools)
// 美魔力 × AILabTools Skin Analyze API 整合
// 版本: 2.0.0

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * AILabTools Skin Analyze API 的 Node.js 封裝類別

 */
class SkinAnalyzer {
  /**
   * 初始化分析器
   * @param {string} apiKey - API 金鑰(可選,會從環境變數讀取)
   * @param {string} version - API 版本 ('basic', 'advanced' 或 'pro'，默認 'pro')
   */
  constructor(apiKey = null, version = 'pro') {
    // 支援兩種環境變數名稱(向後兼容)
    this.apiKey = apiKey || process.env.AILAB_API_KEY ;
    
    if (!this.apiKey) {
      throw new Error('API Key is required. Set AILAB_API_KEY  environment variable or pass it to constructor.');
    }
    
    // 設置 API 版本
    if (version === 'basic') {
      this.version = 'basic';
    } else if (version === 'advanced') {
      this.version = 'advanced';
    } else {
      this.version = 'pro';
    }
    
    // AILabTools API 配置
    this.baseURL = 'https://www.ailabapi.com';
    this.endpoints = {
      basic: '/api/portrait/analysis/skin-analysis',
      advanced: '/api/portrait/analysis/skin-analysis-advanced',
      pro: '/api/portrait/analysis/skin-analysis-pro'
    };
    this.endpoint = this.endpoints[this.version];
    this.timeout = 30000; // 30 秒
    this.maxRetries = 3; // 最大重試次數
    this.retryDelay = 1000; // 重試延遲(毫秒)
    
    // 日誌配置(隱藏 API Key 的前綴)
    const maskedKey = this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT_SET';
    console.log(`🔧 AILabTools Skin Analyzer 配置:`);
    console.log(`   - Provider: AILabTools `);
    const versionName = this.version === 'basic' ? '基礎版' : (this.version === 'pro' ? 'Pro 版' : '進階版');
    console.log(`   - Version: ${versionName} (${this.version})`);
    console.log(`   - Base URL: ${this.baseURL}`);
    console.log(`   - Endpoint: ${this.endpoint}`);
    console.log(`   - API Key: ${maskedKey}`);
    console.log(`   - Timeout: ${this.timeout}ms`);
    console.log(`   - Max Retries: ${this.maxRetries}`);
  }

  /**
   * 設置 API 版本
   * @param {string} version - API 版本 ('basic', 'advanced' 或 'pro')
   */
  setVersion(version) {
    if (version === 'basic') {
      this.version = 'basic';
    } else if (version === 'advanced') {
      this.version = 'advanced';
    } else {
      this.version = 'pro';
    }
    this.endpoint = this.endpoints[this.version];
    const versionName = this.version === 'basic' ? '基礎版' : (this.version === 'pro' ? 'Pro 版' : '進階版');
    console.log(`🔄 切換到 ${versionName} API`);
  }

  /**
   * 獲取當前 API 版本
   * @returns {string} 當前版本
   */
  getVersion() {
    return this.version;
  }

  /**
   * 從本地檔案路徑分析肌膚
   * @param {string} imagePath - 圖片檔案路徑
   * @param {string} version - API 版本 (可選，覆蓋默認版本)
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeFromPath(imagePath, version = null) {
    // 臨時切換版本
    const originalVersion = this.version;
    if (version) {
      this.setVersion(version);
    }
    
    try {
      // 驗證檔案存在
      if (!fs.existsSync(imagePath)) {
        throw new Error(`File not found: ${imagePath}`);
      }

      // 驗證檔案格式
      const ext = path.extname(imagePath).toLowerCase();
      if (!['.jpg', '.jpeg'].includes(ext)) {
        throw new Error('Only JPG/JPEG format is supported');
      }

      // 驗證檔案大小 (基礎版 2MB，Pro/進階版 5MB)
      const maxSize = this.version === 'basic' ? 2 : 5;
      const stats = fs.statSync(imagePath);
      const sizeInMB = stats.size / (1024 * 1024);
      if (sizeInMB > maxSize) {
        throw new Error(`Image size (${sizeInMB.toFixed(2)} MB) exceeds ${maxSize} MB limit for ${this.version} version`);
      }

      // 建立 FormData
      const formData = new FormData();
      formData.append('image', fs.createReadStream(imagePath));

      // 發送請求
      const response = await axios.post(
        `${this.baseURL}${this.endpoint}`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders()
          },
          timeout: this.timeout,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      return this.processResponse(response.data);
    } catch (error) {
      return this.handleError(error);
    } finally {
      // 恢復原始版本
      if (version && originalVersion !== version) {
        this.setVersion(originalVersion);
      }
    }
  }

  /**
   * 從 Buffer 分析肌膚
   * @param {Buffer} imageBuffer - 圖片 Buffer
   * @param {string} filename - 檔案名稱 (可選)
   * @param {string} version - API 版本 (可選，覆蓋默認版本)
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeFromBuffer(imageBuffer, filename = 'image.jpg', version = null) {
    // 臨時切換版本
    const originalVersion = this.version;
    if (version) {
      this.setVersion(version);
    }
    
    try {
      // 驗證 Buffer 大小 (基礎版 2MB，Pro/進階版 5MB)
      const maxSize = this.version === 'basic' ? 2 : 5;
      const sizeInMB = imageBuffer.length / (1024 * 1024);
      if (sizeInMB > maxSize) {
        throw new Error(`Image size (${sizeInMB.toFixed(2)} MB) exceeds ${maxSize} MB limit for ${this.version} version`);
      }

      console.log(`📤 準備發送 API 請求:`);
      console.log(`   - File: ${filename}`);
      console.log(`   - Size: ${sizeInMB.toFixed(2)} MB`);
      console.log(`   - URL: ${this.baseURL}${this.endpoint}`);

      // 使用重試機制
      return await this.makeRequestWithRetry(imageBuffer, filename);
    } catch (error) {
      return this.handleError(error);
    } finally {
      // 恢復原始版本
      if (version && originalVersion !== version) {
        this.setVersion(originalVersion);
      }
    }
  }

  /**
   * 發送 API 請求(帶重試機制)
   * @param {Buffer} imageBuffer - 圖片 Buffer
   * @param {string} filename - 檔案名稱
   * @param {number} retryCount - 當前重試次數
   * @returns {Promise<Object>} 分析結果
   */
  async makeRequestWithRetry(imageBuffer, filename, retryCount = 0) {
    try {
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: filename,
        contentType: 'image/jpeg'
      });
      
      // Request red area map for sensitivity visualization (進階版和Pro版)
      if (this.version === 'advanced' || this.version === 'pro') {
        formData.append('return_maps', 'red_area');
      }

      const startTime = Date.now();
      console.log(`🔄 嘗試連接 API (${retryCount + 1}/${this.maxRetries})...`);
      console.log(`   - URL: ${this.baseURL}${this.endpoint}`);
      console.log(`   - Image size: ${imageBuffer.length} bytes`);
      console.log(`   - API Key 長度: ${this.apiKey ? this.apiKey.length : 0}`);

      const response = await axios.post(
        `${this.baseURL}${this.endpoint}`,
        formData,
        {
          headers: {
            'ailabapi-api-key': this.apiKey,
            ...formData.getHeaders()
          },
          timeout: this.timeout,
          validateStatus: function (status) {
            return status < 500; // 只對 5xx 錯誤拋出異常
          }
        }
      );

      const duration = Date.now() - startTime;
      console.log(`✅ API 回應成功 (${duration}ms)`);
      console.log(`   - Status: ${response.status}`);
      console.log(`   - Data:`, JSON.stringify(response.data).substring(0, 500));

      // 檢查 HTTP 狀態碼
      if (response.status !== 200) {
        console.error(`❌ HTTP 錯誤狀態: ${response.status}`);
        return {
          success: false,
          error: {
            code: response.status,
            message: response.data.error_msg || response.statusText || 'HTTP Error',
            detail: response.data.error_detail || response.data,
            type: 'HTTP_ERROR',
            http_status: response.status
          },
          metadata: {
            request_id: response.data.request_id,
            log_id: response.data.log_id
          }
        };
      }

      const rawString = JSON.stringify(response.data);
      console.log('🔍 [RAW_PRO_API_RESPONSE] Pro API 完整回傳字串:');
      console.log(rawString);

      const processed = this.processResponse(response.data);
      if (processed.success) {
        processed.raw_string = rawString;
      }
      return processed;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ API 請求失敗 (${duration}ms):`);
      console.error(`   - Error Type: ${error.code || 'UNKNOWN'}`);
      console.error(`   - Message: ${error.message}`);
      
      if (error.response) {
        console.error(`   - Response Status: ${error.response.status}`);
        console.error(`   - Response Data:`, error.response.data);
      } else if (error.request) {
        console.error(`   - No Response Received`);
        console.error(`   - Request Config:`, {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout
        });
      }

      // 檢查是否應該重試
      const shouldRetry = this.shouldRetry(error, retryCount);
      
      if (shouldRetry) {
        const delay = this.retryDelay * Math.pow(2, retryCount); // 指數退避
        console.log(`⏳ ${delay}ms 後重試...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequestWithRetry(imageBuffer, filename, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * 判斷是否應該重試
   * @param {Error} error - 錯誤物件
   * @param {number} retryCount - 當前重試次數
   * @returns {boolean} 是否應該重試
   */
  shouldRetry(error, retryCount) {
    // 已達最大重試次數
    if (retryCount >= this.maxRetries - 1) {
      console.log(`⚠️ 已達最大重試次數 (${this.maxRetries})`);
      return false;
    }

    // 網路錯誤或超時 - 應該重試
    if (error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ENETUNREACH' ||
        error.code === 'EAI_AGAIN' ||
        error.message.includes('timeout') ||
        error.message.includes('connect')) {
      console.log(`🔄 網路錯誤,可以重試`);
      return true;
    }

    // 5xx 伺服器錯誤 - 應該重試
    if (error.response && error.response.status >= 500) {
      console.log(`🔄 伺服器錯誤 (${error.response.status}),可以重試`);
      return true;
    }

    // 429 Too Many Requests - 應該重試
    if (error.response && error.response.status === 429) {
      console.log(`🔄 請求過於頻繁 (429),可以重試`);
      return true;
    }

    // 其他錯誤(4xx 客戶端錯誤) - 不應該重試
    console.log(`⛔ 客戶端錯誤,不重試`);
    return false;
  }

  /**
   * 從 Base64 字串分析肌膚
   * @param {string} base64String - Base64 編碼的圖片
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeFromBase64(base64String) {
    try {
      // 移除 data:image/jpeg;base64, 前綴(如果有)
      const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      return await this.analyzeFromBuffer(imageBuffer);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 從 URL 分析肌膚
   * @param {string} imageUrl - 圖片 URL
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeFromUrl(imageUrl) {
    try {
      // 下載圖片
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: this.timeout
      });

      const imageBuffer = Buffer.from(response.data);
      return await this.analyzeFromBuffer(imageBuffer);
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 處理 API 回應
   * @param {Object} data - API 回應資料
   * @returns {Object} 處理後的結果
   */
  processResponse(data) {
    console.log('📝 處理 API 回應...');
    console.log('   - error_code:', data.error_code);
    console.log('   - error_msg:', data.error_msg);
    
    // 檢查錯誤 (AILabTools 使用 error_code)
    // error_code 為 0 表示成功
    if (data.error_code !== undefined && data.error_code !== 0) {
      console.error(`❌ API 返回錯誤: code=${data.error_code}, msg=${data.error_msg}`);
      return {
        success: false,
        error: {
          code: data.error_code,
          message: data.error_msg || 'Unknown API error',
          detail: data.error_detail || {},
          error_code_str: data.error_code_str
        },
        metadata: {
          request_id: data.request_id,
          log_id: data.log_id
        }
      };
    }

    // 檢查是否有 result 欄位
    if (!data.result) {
      console.error(`❌ API 回應缺少 result 欄位`);
      return {
        success: false,
        error: {
          code: 'MISSING_RESULT',
          message: 'API response is missing result field',
          detail: data
        },
        metadata: {
          request_id: data.request_id,
          log_id: data.log_id
        }
      };
    }

    console.log('✅ API 回應正常，開始轉換格式...');
    console.log('   - Has face_maps:', !!data.face_maps);
    console.log('   - Has sensitivity:', !!data.sensitivity);
    if (data.face_maps) {
      console.log('   - face_maps keys:', Object.keys(data.face_maps));
    }
    
    // 成功回應 - 轉換 AILabTools 格式為統一格式
    const result = this.convertAILabToUnifiedFormat(data.result || {});

    return {
      success: true,
      data: {
        result: result,
        face_rectangle: data.face_rectangle || {},
        face_maps: data.face_maps || null,
        sensitivity: data.sensitivity || null,
        warnings: data.warning || []
      },
      metadata: {
        request_id: data.request_id,
        log_id: data.log_id,
        has_warnings: Array.isArray(data.warning) && data.warning.length > 0
      }
    };
  }

  /**
   * 將 AILabTools 格式轉換為統一格式
   * @param {Object} ailabResult - AILabTools API 回應
   * @returns {Object} 統一格式
   */
  convertAILabToUnifiedFormat(ailabResult) {
    // 根據版本選擇不同的轉換方法
    if (this.version === 'basic') {
      return this.convertBasicToUnifiedFormat(ailabResult);
    } else {
      // Advanced 和 Pro 版本使用相同的格式轉換
      return this.convertAdvancedToUnifiedFormat(ailabResult);
    }
  }

  /**
   * 將基礎版格式轉換為統一格式
   * @param {Object} basicResult - 基礎版 API 回應
   * @returns {Object} 統一格式
   */
  convertBasicToUnifiedFormat(basicResult) {
    // 直接返回 AILabTools API 原始格式，不添加自定義欄位
    return {
      // 膚色 (基礎版無此欄位)
      skin_color: null,
      // 膚齡 (基礎版無此欄位)
      skin_age: null,
      // 膚質
      skin_type: basicResult.skin_type,
      // 雙眼皮
      left_eyelids: basicResult.left_eyelids,
      right_eyelids: basicResult.right_eyelids,
      // 眼袋
      eye_pouch: basicResult.eye_pouch,
      eye_pouch_severity: null, // 基礎版無此欄位
      // 黑眼圈
      dark_circle: basicResult.dark_circle,
      // 額頭皺紋
      forehead_wrinkle: basicResult.forehead_wrinkle,
      // 魚尾紋
      crows_feet: basicResult.crows_feet,
      // 眼部細紋
      eye_finelines: basicResult.eye_finelines,
      // 眉間紋
      glabella_wrinkle: basicResult.glabella_wrinkle,
      // 法令紋
      nasolabial_fold: basicResult.nasolabial_fold,
      nasolabial_fold_severity: null, // 基礎版無此欄位
      // 毛孔
      pores_forehead: basicResult.pores_forehead,
      pores_left_cheek: basicResult.pores_left_cheek,
      pores_right_cheek: basicResult.pores_right_cheek,
      pores_jaw: basicResult.pores_jaw,
      // 黑頭
      blackhead: basicResult.blackhead,
      // 痘痘
      acne: basicResult.acne,
      // 閉口粉刺 (基礎版無此欄位)
      closed_comedones: null,
      // 痣
      mole: basicResult.mole,
      // 斑點
      skin_spot: basicResult.skin_spot,
      // 膚色標準 (基礎版無此欄位)
      skintone_ita: null,
      skin_hue_ha: null,
      // 敏感度 (基礎版無此欄位)
      sensitivity: null,
      // 臉部色度圖 (基礎版無此欄位)
      face_maps: null
    };
  }

  /**
   * 將專業版格式轉換為統一格式
   * @param {Object} ailabResult - 專業版 API 回應
   * @returns {Object} 統一格式
   */
  convertAdvancedToUnifiedFormat(ailabResult) {
    // 直接返回 AILabTools API 原始格式，不添加自定義欄位
    return {
      // 膚色
      skin_color: ailabResult.skin_color,
      // 膚齡
      skin_age: ailabResult.skin_age,
      // 膚質
      skin_type: ailabResult.skin_type,
      // === Pro API 六力評分 ===
      score_info: ailabResult.score_info,
      // === Pro API 油性強度 ===
      oily_intensity: ailabResult.oily_intensity,
      // === Pro API 水分 ===
      water: ailabResult.water,
      // === Pro API 黑色素 ===
      melanin: ailabResult.melanin,
      // === Pro API 斑點類型 ===
      brown_spot: ailabResult.brown_spot,
      freckle: ailabResult.freckle,
      melasma: ailabResult.melasma,
      // === Pro API 痘痘詳細 ===
      acne_pustule: ailabResult.acne_pustule,
      acne_nodule: ailabResult.acne_nodule,
      acne_mark: ailabResult.acne_mark,
      blackhead_count: ailabResult.blackhead_count,
      // === Pro API 皺紋嚴重度 ===
      left_crows_feet_severity: ailabResult.left_crows_feet_severity,
      right_crows_feet_severity: ailabResult.right_crows_feet_severity,
      forehead_wrinkle_severity: ailabResult.forehead_wrinkle_severity,
      glabella_wrinkle_severity: ailabResult.glabella_wrinkle_severity,
      left_eye_finelines_severity: ailabResult.left_eye_finelines_severity,
      right_eye_finelines_severity: ailabResult.right_eye_finelines_severity,
      forehead_wrinkle_info: ailabResult.forehead_wrinkle_info,
      wrinkle_count: ailabResult.wrinkle_count,
      // 雙眼皮
      left_eyelids: ailabResult.left_eyelids,
      right_eyelids: ailabResult.right_eyelids,
      // 眼袋
      eye_pouch: ailabResult.eye_pouch,
      eye_pouch_severity: ailabResult.eye_pouch_severity,
      // 黑眼圈
      dark_circle: ailabResult.dark_circle,
      // 額頭皺紋
      forehead_wrinkle: ailabResult.forehead_wrinkle,
      // 魚尾紋
      crows_feet: ailabResult.crows_feet,
      // 眼部細紋
      eye_finelines: ailabResult.eye_finelines,
      // 眉間紋
      glabella_wrinkle: ailabResult.glabella_wrinkle,
      // 法令紋
      nasolabial_fold: ailabResult.nasolabial_fold,
      nasolabial_fold_severity: ailabResult.nasolabial_fold_severity,
      // 毛孔
      pores_forehead: ailabResult.pores_forehead,
      pores_left_cheek: ailabResult.pores_left_cheek,
      pores_right_cheek: ailabResult.pores_right_cheek,
      pores_jaw: ailabResult.pores_jaw,
      // 黑頭
      blackhead: ailabResult.blackhead,
      // 痘痘
      acne: ailabResult.acne,
      // 閉口粉刺
      closed_comedones: ailabResult.closed_comedones,
      // 痣
      mole: ailabResult.mole,
      // 斑點
      skin_spot: ailabResult.skin_spot,
      // 膚色標準 (ITA)
      skintone_ita: ailabResult.skintone_ita,
      // 膚色色調 (HA)
      skin_hue_ha: ailabResult.skin_hue_ha,
      // 敏感度
      sensitivity: ailabResult.sensitivity,
      // 臉部色度圖
      face_maps: ailabResult.face_maps
    };
  }

  /**
  /**
   * 錯誤處理
   * @param {Error} error - 錯誤物件
   * @returns {Object} 錯誤回應
   */
  handleError(error) {
    console.error(`🔍 詳細錯誤分析:`);
    
    if (error.response) {
      // API 回應錯誤
      const data = error.response.data || {};
      console.error(`   - 類型: API 回應錯誤`);
      console.error(`   - HTTP Status: ${error.response.status}`);
      console.error(`   - Response Data:`, data);
      
      return {
        success: false,
        error: {
          code: error.response.status,
          message: data.error_msg || error.message,
          detail: data.error_detail,
          type: 'API_RESPONSE_ERROR'
        },
        metadata: {
          request_id: data.request_id,
          log_id: data.log_id,
          http_status: error.response.status
        }
      };
    } else if (error.request) {
      // 請求發送失敗(網路問題)
      console.error(`   - 類型: 網路連接錯誤`);
      console.error(`   - Error Code: ${error.code}`);
      console.error(`   - Error Message: ${error.message}`);
      console.error(`   - Target URL: ${this.baseURL}${this.endpoint}`);
      
      // 提供更具體的錯誤訊息
      let specificMessage = 'Failed to connect to API server';
      let troubleshooting = [];
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        specificMessage = 'API 請求超時,伺服器未在時限內回應';
        troubleshooting = [
          '請檢查網路連接是否穩定',
          '可能是伺服器負載過高',
          '嘗試稍後再試'
        ];
      } else if (error.code === 'ENOTFOUND') {
        specificMessage = 'DNS 解析失敗,找不到伺服器';
        troubleshooting = [
          '請檢查網路連接',
          '確認 DNS 設定正確',
          '可能是防火牆阻擋'
        ];
      } else if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
        specificMessage = '連接被重置或拒絕';
        troubleshooting = [
          '可能是防火牆或代理設定問題',
          '檢查 Heroku 的網路設定',
          '確認目標伺服器正在運行'
        ];
      } else if (error.code === 'ENETUNREACH') {
        specificMessage = '網路不可達';
        troubleshooting = [
          '檢查網路連接',
          '可能需要配置代理',
          '確認沒有網路限制'
        ];
      }
      
      return {
        success: false,
        error: {
          code: error.code || 'NETWORK_ERROR',
          message: specificMessage,
          detail: error.message,
          type: 'NETWORK_ERROR',
          troubleshooting: troubleshooting,
          technical: {
            url: `${this.baseURL}${this.endpoint}`,
            timeout: `${this.timeout}ms`,
            error_code: error.code
          }
        }
      };
    } else {
      // 其他錯誤
      console.error(`   - 類型: 未知錯誤`);
      console.error(`   - Message: ${error.message}`);
      console.error(`   - Stack:`, error.stack);
      
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error.message,
          type: 'UNKNOWN_ERROR',
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }
      };
    }
  }

  /**
   * 驗證圖片是否符合規格
   * @param {string} imagePath - 圖片路徑
   * @returns {Object} 驗證結果
   */
  validateImage(imagePath) {
    const errors = [];

    // 檢查檔案是否存在
    if (!fs.existsSync(imagePath)) {
      errors.push('File does not exist');
      return { valid: false, errors };
    }

    // 檢查檔案格式
    const ext = path.extname(imagePath).toLowerCase();
    if (!['.jpg', '.jpeg'].includes(ext)) {
      errors.push('File format must be JPG or JPEG');
    }

    // 檢查檔案大小
    const stats = fs.statSync(imagePath);
    const sizeInMB = stats.size / (1024 * 1024);
    if (sizeInMB > 5) {
      errors.push(`File size (${sizeInMB.toFixed(2)} MB) exceeds 5 MB limit`);
    }

    return {
      valid: errors.length === 0,
      errors,
      size: sizeInMB.toFixed(2) + ' MB'
    };
  }

  /**
   * 批次分析多張圖片
   * @param {string[]} imagePaths - 圖片路徑陣列
   * @param {Function} onProgress - 進度回調函數
   * @returns {Promise<Object[]>} 分析結果陣列
   */
  async batchAnalyze(imagePaths, onProgress = null) {
    const results = [];
    const total = imagePaths.length;

    for (let i = 0; i < total; i++) {
      const imagePath = imagePaths[i];
      
      try {
        const result = await this.analyzeFromPath(imagePath);
        results.push({
          path: imagePath,
          ...result
        });

        if (onProgress) {
          onProgress({
            current: i + 1,
            total,
            percentage: Math.round(((i + 1) / total) * 100),
            currentFile: imagePath
          });
        }

        // 添加延遲避免觸發 rate limit
        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        results.push({
          path: imagePath,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * 生成分析報告摘要
   * @param {Object} analysisResult - 分析結果
   * @returns {Object} 報告摘要
   */
  generateSummary(analysisResult) {
    if (!analysisResult.success) {
      return {
        success: false,
        message: 'Analysis failed',
        error: analysisResult.error
      };
    }

    const result = analysisResult.data.result;
    const warnings = analysisResult.data.warnings;

    return {
      success: true,
      overall_score: this.calculateOverallScore(result),
      skin_age: result.skin_age?.value || null,
      key_concerns: this.identifyKeyConcerns(result),
      warnings: this.interpretWarnings(warnings),
      recommendations: this.generateRecommendations(result),
      scores: this.calculateDetailedScores(result),
      detailed_scores: this.extractDetailedScores(result)
    };
  }

  /**
   * 計算詳細分數（水潤度、光澤度、緊緻度）
   * @param {Object} result - 分析結果
   * @returns {Object} 詳細分數對象
   */
  calculateDetailedScores(result) {
    // 水潤度計算 (基於毛孔、膚質、黑頭等指標)
    const hydration = this.calculateHydrationScore(result);
    
    // 光澤度計算 (基於斑點、膚色、整體膚質)
    const radiance = this.calculateRadianceScore(result);
    
    // 緊緻度計算 (基於皺紋、眼袋、法令紋等)
    const firmness = this.calculateFirmnessScore(result);
    
    // 其他現有分數
    const texture = this.calculateTextureScore(result);
    const wrinkles = this.calculateWrinklesScore(result);
    const pores = this.calculatePoresScore(result);
    const pigmentation = this.calculatePigmentationScore(result);
    
    return {
      hydration,
      radiance,
      firmness,
      texture,
      wrinkles,
      pores,
      pigmentation
    };
  }

  /**
   * 計算水潤度分數（基於皮膚屏障功能評估）
   * @param {Object} result - 分析結果
   * @returns {number} 水潤度分數 (0-100)
   */
  calculateHydrationScore(result) {
    const scores = [];
    const weights = [];
    
    // === 1. 毛孔狀態（主要指標，權重 1.3）===
    // 毛孔擴大通常與皮膚缺水、油脂分泌過度相關
    const poreFields = ['pores_forehead', 'pores_left_cheek', 'pores_right_cheek', 'pores_jaw'];
    let poreCount = 0;
    let poreIssues = 0;
    
    poreFields.forEach(field => {
      if (result[field]?.value !== undefined) {
        poreCount++;
        if (result[field].value === 1) poreIssues++;
      }
    });
    
    if (poreCount > 0) {
      // 根據有問題的毛孔區域比例計分
      const poreRatio = poreIssues / poreCount;
      let score;
      if (poreRatio === 0) score = 95;          // 無毛孔問題
      else if (poreRatio <= 0.25) score = 85;   // 1個區域
      else if (poreRatio <= 0.5) score = 70;    // 2個區域
      else if (poreRatio <= 0.75) score = 55;   // 3個區域
      else score = 40;                          // 4個區域均有問題
      
      scores.push(score);
      weights.push(1.3);
    }
    
    // === 2. 黑頭問題（權重 1.2）===
    // 黑頭與皮膚水油平衡、角質代謝相關
    if (result.blackhead?.value !== undefined) {
      const blackheadScores = [95, 80, 60, 40]; // 0=無, 1=輕度, 2=中度, 3=嚴重
      scores.push(blackheadScores[result.blackhead.value] || 70);
      weights.push(1.2);
    }
    
    // === 3. 閉口粉刺（權重 1.0）===
    // 閉口粉刺與皮膚代謝、水分不足相關
    if (result.closed_comedones?.rectangle) {
      const count = result.closed_comedones.rectangle.length;
      let score;
      if (count === 0) score = 95;
      else if (count <= 3) score = 80;
      else if (count <= 8) score = 65;
      else if (count <= 15) score = 50;
      else score = 35;
      scores.push(score);
      weights.push(1.0);
    }
    
    // === 計算加權平均 ===
    if (scores.length === 0) return 75;
    
    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i];
      weightSum += weights[i];
    }
    const avgScore = Math.round(weightedSum / weightSum);
    
    // 設置合理範圍：30-95 分
    return Math.max(30, Math.min(avgScore, 95));
  }

  /**
   * 計算光澤度分數（基於膚色均勻度與色素評估）
   * @param {Object} result - 分析結果
   * @returns {number} 光澤度分數 (0-100)
   */
  calculateRadianceScore(result) {
    const scores = [];
    const weights = [];
    
    // === 1. 色素沉積 - 斑點（權重 1.4）===
    // 斑點是影響膚色均勻度的主要因素
    if (result.skin_spot?.rectangle) {
      const count = result.skin_spot.rectangle.length;
      let score;
      if (count === 0) score = 95;
      else if (count <= 3) score = 85;      // 輕微
      else if (count <= 8) score = 70;      // 輕度
      else if (count <= 15) score = 55;     // 中度
      else if (count <= 25) score = 40;     // 中重度
      else score = 30;                      // 嚴重
      scores.push(score);
      weights.push(1.4);
    } else {
      scores.push(90);
      weights.push(1.4);
    }
    
    // === 2. 炎症反應 - 痘痘（權重 1.2）===
    // 痘痘會導致炎症後色素沉積，影響光澤
    if (result.acne?.rectangle) {
      const count = result.acne.rectangle.length;
      let score;
      if (count === 0) score = 95;
      else if (count <= 2) score = 80;
      else if (count <= 5) score = 65;
      else if (count <= 10) score = 50;
      else score = 35;
      scores.push(score);
      weights.push(1.2);
    } else {
      scores.push(90);
      weights.push(1.2);
    }
    
    // === 3. 眼周色素 - 黑眼圈（權重 1.1）===
    if (result.dark_circle?.value !== undefined) {
      const score = result.dark_circle.value === 0 ? 95 : 65;
      scores.push(score);
      weights.push(1.1);
    }
    
    // === 4. 膚色均勻度 - ITA 值（權重 1.0）===
    if (result.skintone_ita?.ITA !== undefined) {
      const skintone = result.skintone_ita.skintone;
      // skintone: 0-5 正常範圍, 6 異常（光線不佳）
      const score = skintone === 6 ? 60 : 85;
      scores.push(score);
      weights.push(1.0);
    }
    
    // === 計算加權平均 ===
    if (scores.length === 0) return 75;
    
    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i];
      weightSum += weights[i];
    }
    const avgScore = Math.round(weightedSum / weightSum);
    
    // 設置合理範圍：30-95 分
    return Math.max(30, Math.min(avgScore, 95));
  }

  /**
   * 計算緊緻度分數（基於皺紋與老化評估）
   * @param {Object} result - 分析結果
   * @returns {number} 緊緻度分數 (0-100)
   */
  calculateFirmnessScore(result) {
    const scores = [];
    const weights = [];
    
    // === 1. 静態皺紋（權重 1.3）===
    const staticWrinkles = [
      { key: 'forehead_wrinkle', name: '抬頭紋', weight: 1.2 },
      { key: 'glabella_wrinkle', name: '眉間紋', weight: 1.1 }
    ];
    
    staticWrinkles.forEach(item => {
      if (result[item.key]?.value !== undefined) {
        const score = result[item.key].value === 0 ? 95 : 70;
        scores.push(score);
        weights.push(item.weight);
      }
    });
    
    // === 2. 動態皺紋（權重 1.4）===
    const dynamicWrinkles = [
      { key: 'crows_feet', name: '魚尾紋', weight: 1.4 },
      { key: 'nasolabial_fold', name: '法令紋', weight: 1.5 },
      { key: 'eye_finelines', name: '眼周細紋', weight: 1.3 }
    ];
    
    dynamicWrinkles.forEach(item => {
      if (result[item.key]?.value !== undefined) {
        let score = result[item.key].value === 0 ? 95 : 70;
        
        // 法令紋特殊處理：根據嚴重度調整
        if (item.key === 'nasolabial_fold' && result[item.key].value === 1) {
          if (result.nasolabial_fold_severity?.value !== undefined) {
            const severity = result.nasolabial_fold_severity.value;
            score = severity === 0 ? 75 : severity === 1 ? 60 : 45;
          }
        }
        
        scores.push(score);
        weights.push(item.weight);
      }
    });
    
    // === 3. 眼袋（權重 1.2）===
    if (result.eye_pouch?.value !== undefined) {
      let score = 95;
      if (result.eye_pouch.value === 1) {
        if (result.eye_pouch_severity?.value !== undefined) {
          const severity = result.eye_pouch_severity.value;
          score = severity === 0 ? 75 : severity === 1 ? 60 : 45;
        } else {
          score = 70;
        }
      }
      scores.push(score);
      weights.push(1.2);
    }
    
    // === 計算加權平均 ===
    if (scores.length === 0) return 75;
    
    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i];
      weightSum += weights[i];
    }
    const avgScore = Math.round(weightedSum / weightSum);
    
    // 設置合理範圍：30-95 分
    return Math.max(30, Math.min(avgScore, 95));
  }

  /**
   * 計算膚質分數
   * @param {Object} result - 分析結果
   * @returns {number} 膚質分數 (0-100)
   */
  calculateTextureScore(result) {
    const scores = [];
    
    const poreFields = ['pores_forehead', 'pores_left_cheek', 'pores_right_cheek', 'pores_jaw'];
    poreFields.forEach(field => {
      if (result[field]?.value !== undefined) {
        scores.push(Math.max(0, 100 - (result[field].value * 20)));
      }
    });
    
    if (result.blackhead?.value !== undefined) {
      scores.push(Math.max(0, 100 - (result.blackhead.value * 20)));
    }
    
    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 80;
  }

  /**
   * 計算皺紋分數
   * @param {Object} result - 分析結果
   * @returns {number} 皺紋分數 (0-100)
   */
  calculateWrinklesScore(result) {
    const scores = [];
    const wrinkleFields = ['forehead_wrinkle', 'crows_feet', 'nasolabial_fold', 'eye_finelines', 'glabella_wrinkle'];
    
    wrinkleFields.forEach(field => {
      if (result[field]?.value !== undefined) {
        scores.push(Math.max(0, 100 - (result[field].value * 20)));
      }
    });
    
    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;
  }

  /**
   * 計算毛孔分數
   * @param {Object} result - 分析結果
   * @returns {number} 毛孔分數 (0-100)
   */
  calculatePoresScore(result) {
    const scores = [];
    const poreFields = ['pores_forehead', 'pores_left_cheek', 'pores_right_cheek', 'pores_jaw'];
    
    poreFields.forEach(field => {
      if (result[field]?.value !== undefined) {
        scores.push(Math.max(0, 100 - (result[field].value * 20)));
      }
    });
    
    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 100;
  }

  /**
   * 計算色素沉澱分數
   * @param {Object} result - 分析結果
   * @returns {number} 色素沉澱分數 (0-100)
   */
  calculatePigmentationScore(result) {
    const scores = [];
    
    if (result.skin_spot?.rectangle) {
      const count = result.skin_spot.rectangle.length;
      scores.push(Math.max(40, 100 - (count * 3)));
    }
    
    if (result.acne?.rectangle) {
      const count = result.acne.rectangle.length;
      scores.push(Math.max(50, 100 - (count * 4)));
    }
    
    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 90;
  }

  /**
   * 提取詳細分數用於報告顯示
   * @param {Object} result - 分析結果
   * @returns {Object} 詳細分數結構
   */
  extractDetailedScores(result) {
    return {
      skin_quality: {
        color: result.skin_color ? ['白皙', '黃調', '棕調', '黑調'][result.skin_color.value || result.skin_color.skin_color] : 'N/A',
        texture: result.skin_type ? ['油性', '乾性', '中性', '混合性'][result.skin_type.skin_type] : 'N/A'
      },
      eyes: {
        eye_bags: result.eye_pouch?.value >= 1 ? '檢測到' : '無',
        dark_circles: result.dark_circle?.value > 0 ? ['無', '色素型', '血管型', '陰影型'][result.dark_circle.value] : '無'
      },
      blemishes: {
        acne: result.acne?.rectangle ? {
          count: result.acne.rectangle.length,
          score: Math.max(40, 100 - (result.acne.rectangle.length * 5))
        } : { count: 0, score: 100 },
        spots: result.skin_spot?.rectangle ? {
          count: result.skin_spot.rectangle.length,
          score: Math.max(40, 100 - (result.skin_spot.rectangle.length * 3))
        } : { count: 0, score: 100 }
      }
    };
  }

  /**
   * 計算整體評分
   *
   * 依據皮膚科臨床量表校正：
   *   - 痘痘：IGA (Investigator's Global Assessment) + GAGS (Global Acne Grading System)
   *   - 色斑：MASI (Melasma Area and Severity Index)
   *   - 皺紋：WSRS (Wrinkle Severity Rating Scale) + Glogau 光老化分級
   *   - 黑頭/粉刺：GAGS 粉刺病灶因子
   *   - 眼袋：Barton 眼袋臨床三分法
   *
   * 權重優先級依據：
   *   1. 痘痘 (1.5)：IGA/GAGS 首要評估工具；炎症風險最高，QoL 影響最大 (Dreno et al., 2018)
   *   2. 色斑 (1.4)：MASI 驗證量表；Fitzpatrick III-V 亞洲膚色第一美容困擾 (Vashi et al., 2016)
   *   3. 皺紋 (1.3)：WSRS/Glogau 驗證；重要老化指標，但屬生理預期變化
   *   4. 眼袋/黑頭/閉口粉刺 (1.2)：有臨床分級但視覺影響或炎症風險次於上述
   *   5. 黑眼圈 (1.1)：無國際標準量表，以視覺顯著性評估
   *   6. 毛孔 (1.0)：結構性問題，無炎症風險，臨床優先度最低
   *
   * @param {Object} result - 分析結果
   * @returns {number} 整體評分 (0-100)
   */
  calculateOverallScore(result) {
    const scores = [];
    const weights = [];

    // ---------- 計分函數 ----------

    // 二元值 (0/1) — WSRS 啟發：偵測到即代表至少 Grade 2（輕度可見），約 70 分
    const calculateBinaryScore = (value) => {
      if (value === undefined || value === null) return null;
      return value === 0 ? 100 : 70; // WSRS Grade 2-3 中間值
    };

    // 多級值 (0-3) — GAGS 粉刺因子 / IGA 四級分法
    // 0=清潔(100), 1=輕度IGA1(78), 2=中度IGA2-3(55), 3=嚴重IGA4(32)
    const calculateMultiLevelScore = (value) => {
      if (value === undefined || value === null) return null;
      const scores = [100, 78, 55, 32];
      return scores[value] ?? 50;
    };

    // === 1. 皺紋 / 老化指標（WSRS + Glogau 光老化分級，權重 1.3）===
    const wrinkleFields = [
      { key: 'forehead_wrinkle', name: '抬頭紋' },
      { key: 'crows_feet',       name: '魚尾紋' },
      { key: 'nasolabial_fold',  name: '法令紋' },
      { key: 'eye_finelines',    name: '眼周細紋' },
      { key: 'glabella_wrinkle', name: '眉間紋' }
    ];

    wrinkleFields.forEach(field => {
      if (result[field.key]?.value !== undefined) {
        const score = calculateBinaryScore(result[field.key].value);
        if (score !== null) {
          scores.push(score);
          weights.push(1.3); // WSRS 老化指標：重要但低於炎症性問題
        }
      }
    });

    // === 2. 眼部問題 ===

    // 眼袋（Barton 臨床三分法，權重 1.2）
    // Grade I(輕度脂肪疝出)→73, Grade II(中度)→52, Grade III(重度+皮膚鬆弛)→33
    if (result.eye_pouch?.value !== undefined) {
      let score = 100;
      if (result.eye_pouch.value === 1) {
        if (result.eye_pouch_severity?.value !== undefined) {
          const severity = result.eye_pouch_severity.value;
          score = severity === 0 ? 73 : severity === 1 ? 52 : 33;
        } else {
          score = 63; // 無嚴重度資料時取 Grade I-II 中間值
        }
      }
      scores.push(score);
      weights.push(1.2); // Barton 眼袋分級
    }

    // 黑眼圈：無國際標準量表，以視覺顯著性評估（權重 1.1）
    if (result.dark_circle?.value !== undefined) {
      const score = result.dark_circle.value === 0 ? 100 : 68;
      scores.push(score);
      weights.push(1.1);
    }

    // === 3. 毛孔問題（臨床 4 分法，權重 1.0）===
    // 毛孔屬結構性問題，無炎症風險，臨床優先度最低
    const poreFields = [
      'pores_forehead', 'pores_left_cheek', 'pores_right_cheek', 'pores_jaw'
    ];
    let poreCount = 0;
    let poreSum = 0;
    poreFields.forEach(field => {
      if (result[field]?.value !== undefined) {
        poreSum += calculateBinaryScore(result[field].value);
        poreCount++;
      }
    });
    if (poreCount > 0) {
      scores.push(Math.round(poreSum / poreCount));
      weights.push(1.0);
    }

    // === 4. 瑕疵問題 ===

    // 黑頭（GAGS 粉刺病灶因子，權重 1.2）
    // GAGS 中粉刺因子 = 1（最低），但為炎症性痘痘的前驅病灶
    if (result.blackhead?.value !== undefined) {
      const score = calculateMultiLevelScore(result.blackhead.value);
      if (score !== null) {
        scores.push(score);
        weights.push(1.2); // GAGS 粉刺因子
      }
    }

    // 痘痘（IGA + GAGS 雙量表校正，權重 1.5）
    // IGA：0=清潔 → 1=幾乎清潔 → 2=輕度 → 3=中度 → 4=重度 → 5=極重度
    // GAGS 總分：1-18=輕度, 19-30=中度, 31-38=重度, >39=極重度
    if (result.acne?.rectangle) {
      const count = result.acne.rectangle.length;
      let score;
      if (count === 0)      score = 100; // IGA 0 — Clear
      else if (count <= 2)  score = 83;  // IGA 1 — Almost clear
      else if (count <= 6)  score = 65;  // IGA 2 — Mild     (GAGS ~8-24)
      else if (count <= 12) score = 45;  // IGA 3 — Moderate (GAGS ~25-48)
      else if (count <= 20) score = 28;  // IGA 4 — Severe   (GAGS ~52-80)
      else                  score = 15;  // IGA 5 — Very severe
      scores.push(score);
      weights.push(1.5); // IGA/GAGS 首要評估工具，最高 QoL 影響
    }

    // 色斑（MASI 量表校正，權重 1.4）
    // MASI = 面積(0-6) × 深度(1-4) × 均勻度(1-2)，總分 0-48
    // 色素沉澱為亞洲 Fitzpatrick III-V 膚色第一美容困擾
    if (result.skin_spot?.rectangle) {
      const count = result.skin_spot.rectangle.length;
      let score;
      if (count === 0)       score = 100; // MASI 0
      else if (count <= 3)   score = 83;  // MASI 1-6   — 極輕
      else if (count <= 8)   score = 65;  // MASI 7-15  — 輕度
      else if (count <= 15)  score = 47;  // MASI 16-25 — 中度
      else if (count <= 25)  score = 30;  // MASI 26-35 — 中重度
      else                   score = 18;  // MASI >35   — 嚴重
      scores.push(score);
      weights.push(1.4); // MASI 亞洲肌膚首要困擾
    }

    // 閉口粉刺（GAGS 非炎症性病灶，權重 1.2）
    // GAGS 粉刺因子 = 1（非炎症），但可進展為炎症性痘痘
    if (result.closed_comedones?.rectangle) {
      const count = result.closed_comedones.rectangle.length;
      let score;
      if (count === 0)      score = 100;
      else if (count <= 3)  score = 82;  // 極少量
      else if (count <= 8)  score = 63;  // 輕度 (GAGS comedone range)
      else if (count <= 15) score = 45;  // 中度
      else                  score = 28;  // 嚴重
      scores.push(score);
      weights.push(1.2); // 非炎症但具進展風險
    }

    // === 計算加權平均分數 ===
    if (scores.length === 0) return 75; // 預設分數

    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i];
      weightSum += weights[i];
    }
    const avgScore = Math.round(weightedSum / weightSum);

    // === 膚齡修正（Glogau 光老化分級）===
    // Glogau I（≤30 歲）：無皺紋，基礎良好 → +3
    // Glogau II（31-38 歲）：動態紋開始出現 → +1
    let finalScore = avgScore;
    if (result.skin_age?.value) {
      const skinAge = result.skin_age.value;
      if (skinAge >= 20 && skinAge <= 30) {
        finalScore = Math.min(finalScore + 3, 100); // Glogau I
      } else if (skinAge >= 31 && skinAge <= 38) {
        finalScore = Math.min(finalScore + 1, 100); // Glogau II
      }
    }

    // 上下限：最高 92（臨床不給滿分），最低 25
    return Math.max(25, Math.min(finalScore, 92));
  }

  /**
   * 識別主要肌膚問題
   * @param {Object} result - 分析結果
   * @returns {string[]} 主要問題列表
   */
  identifyKeyConcerns(result) {
    const concerns = [];

    // 痘痘
    if (result.acne?.rectangle && result.acne.rectangle.length > 0) {
      const count = result.acne.rectangle.length;
      const level = count > 10 ? '嚴重' : count > 5 ? '中度' : '輕度';
      concerns.push(`${level}痘痘問題 (${count} 處)`);
    }
    
    // 斑點
    if (result.skin_spot?.rectangle && result.skin_spot.rectangle.length > 0) {
      const count = result.skin_spot.rectangle.length;
      const level = count > 15 ? '明顯' : '輕微';
      concerns.push(`${level}斑點色素沉澱 (${count} 處)`);
    }
    
    // 黑眼圈
    if (result.dark_circle?.value > 0) {
      const types = ['無', '色素型', '血管型', '陰影型'];
      const type = types[result.dark_circle.value] || '未知';
      concerns.push(`黑眼圈 (${type})`);
    }
    
    // 眼袋
    if (result.eye_pouch?.value >= 1) {
      const severity = result.eye_pouch_severity?.value;
      const severityText = severity === 0 ? '輕度' : severity === 1 ? '中度' : severity === 2 ? '嚴重' : '';
      concerns.push(`${severityText}眼袋問題`);
    }

    // 皺紋
    if (result.forehead_wrinkle?.value >= 1) {
      concerns.push('額頭皺紋');
    }
    if (result.crows_feet?.value >= 1) {
      concerns.push('魚尾紋');
    }
    if (result.nasolabial_fold?.value >= 1) {
      const severity = result.nasolabial_fold_severity?.value;
      const severityText = severity === 0 ? '輕度' : severity === 1 ? '中度' : severity === 2 ? '嚴重' : '';
      concerns.push(`${severityText}法令紋`);
    }
    if (result.eye_finelines?.value >= 1) {
      concerns.push('眼部細紋');
    }
    if (result.glabella_wrinkle?.value >= 1) {
      concerns.push('眉間紋');
    }

    // 黑頭
    if (result.blackhead?.value > 0) {
      const levels = ['無', '輕度', '中度', '嚴重'];
      concerns.push(`${levels[result.blackhead.value] || ''}黑頭問題`);
    }

    // 閉口粉刺
    if (result.closed_comedones?.rectangle && result.closed_comedones.rectangle.length > 0) {
      concerns.push(`閉口粉刺 (${result.closed_comedones.rectangle.length} 處)`);
    }

    // 膚齡
    if (result.skin_age?.value && result.skin_age.value > 40) {
      concerns.push(`膚齡偏高 (${result.skin_age.value} 歲)`);
    }

    return concerns.length > 0 ? concerns : ['肌膚狀況良好 ✨'];
  }

  /**
   * 解釋警告訊息
   * @param {string[]} warnings - 警告代碼陣列
   * @returns {string[]} 警告說明
   */
  interpretWarnings(warnings) {
    const warningMap = {
      'imporper_headpose': '頭部角度不當,可能影響分析準確度。建議重新拍攝正面照片。'
    };

    return warnings.map(code => warningMap[code] || code);
  }

  /**
   * 生成保養建議
   * @param {Object} result - 分析結果
   * @returns {string[]} 建議列表
   */
  generateRecommendations(result) {
    const recommendations = [];

    // 痘痘問題
    if (result.acne?.rectangle && result.acne.rectangle.length > 5) {
      recommendations.push({
        issue: '痘痘問題',
        suggestion: '建議使用含水楊酸(BHA)或茶樹精油的控油產品 (改善項目: 痘痘)',
        ingredients: ['水楊酸', '茶樹精油', '杜鵑花酸'],
        routine: '早晚清潔後使用,局部點塗於痘痘處'
      });
    }

    // 斑點問題
    if (result.skin_spot?.rectangle && result.skin_spot.rectangle.length > 3) {
      recommendations.push({
        issue: '斑點色素沉澱',
        suggestion: '建議使用美白精華,搭配嚴格防曬 (改善項目: 色斑)',
        ingredients: ['維生素C', '熊果素', '傳明酸', '菸鹼醯胺'],
        routine: '晚上使用美白精華,白天務必防曬(SPF50+)'
      });
    }

    // 黑眼圈
    if (result.dark_circle?.value > 0) {
      recommendations.push({
        issue: '黑眼圈',
        suggestion: '建議使用含咖啡因的眼霜,並改善睡眠品質 (改善項目: 黑眼圈)',
        ingredients: ['咖啡因', '維生素K', '視黃醇'],
        routine: '早晚輕輕拍打於眼周,確保每日睡眠7-8小時'
      });
    }

    // 眼袋
    if (result.eye_pouch?.value >= 1) {
      recommendations.push({
        issue: '眼袋',
        suggestion: '建議使用緊緻眼霜,搭配眼周按摩 (改善項目: 眼袋)',
        ingredients: ['咖啡因', '勝肽', '玻尿酸'],
        routine: '使用眼霜時搭配輕柔按摩,促進淋巴循環'
      });
    }

    // 皺紋問題
    let hasWrinkles = false;
    let wrinkleTypes = [];
    if (result.forehead_wrinkle?.value >= 1) wrinkleTypes.push('抬頭紋');
    if (result.crows_feet?.value >= 1) wrinkleTypes.push('魚尾紋');
    if (result.nasolabial_fold?.value >= 1) wrinkleTypes.push('法令紋');
    
    if (wrinkleTypes.length > 0) {
      hasWrinkles = true;
    }

    if (hasWrinkles) {
      recommendations.push({
        issue: '皺紋細紋',
        suggestion: `建議使用抗老精華,加強保濕 (改善項目: ${wrinkleTypes.join('、')})`,
        ingredients: ['視黃醇', '勝肽', '玻尿酸', '維生素E'],
        routine: '晚上使用抗老精華(從低濃度開始),搭配防曬'
      });
    }

    // 如果沒有特別問題
    if (recommendations.length === 0) {
      recommendations.push({
        issue: '肌膚狀況良好',
        suggestion: '繼續保持良好的保養習慣!',
        ingredients: ['基礎保濕', '防曬'],
        routine: '維持清潔→保濕→防曬的日常保養'
      });
    }

    return recommendations;
  }

  /**
   * 提取詳細分數
   * @param {Object} result - 分析結果
   * @returns {Object} 詳細分數
   */
  extractDetailedScores(result) {
    return {
      skin_quality: {
        color: result.skin_color,
        age: result.skin_age,
        type: result.skin_type
      },
      eyes: {
        eye_pouch: result.eye_pouch,
        eye_pouch_severity: result.eye_pouch_severity,
        dark_circle: result.dark_circle,
        left_eyelids: result.left_eyelids,
        right_eyelids: result.right_eyelids
      },
      wrinkles: {
        forehead_wrinkle: result.forehead_wrinkle,
        crows_feet: result.crows_feet,
        eye_finelines: result.eye_finelines,
        glabella_wrinkle: result.glabella_wrinkle,
        nasolabial_fold: result.nasolabial_fold,
        nasolabial_fold_severity: result.nasolabial_fold_severity
      },
      pores: {
        forehead: result.pores_forehead,
        left_cheek: result.pores_left_cheek,
        right_cheek: result.pores_right_cheek,
        jaw: result.pores_jaw
      },
      blemishes: {
        blackhead: result.blackhead,
        acne: result.acne,
        mole: result.mole,
        skin_spot: result.skin_spot,
        closed_comedones: result.closed_comedones
      },
      color_analysis: {
        skintone_ita: result.skintone_ita,
        skin_hue_ha: result.skin_hue_ha
      },
      sensitivity: result.sensitivity
    };
  }

  /**
   * 生成 HTML 報告
   * @param {Object} summary - 分析摘要
   * @returns {string} HTML 字串
   */
  generateHtmlReport(summary) {
    if (!summary.success) {
      return `
        <div class="error-report">
          <h2>分析失敗</h2>
          <p>${summary.error?.message || '未知錯誤'}</p>
        </div>
      `;
    }

    const scoreClass = summary.overall_score >= 80 ? 'excellent' : 
                       summary.overall_score >= 60 ? 'good' : 'needs-improvement';

    return `
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <title>美魔力 AI 肌膚分析報告</title>
        <style>
          body { font-family: 'Microsoft JhengHei', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .score-circle { width: 150px; height: 150px; border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 48px; font-weight: bold; }
          .excellent { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .good { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; }
          .needs-improvement { background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%); color: #333; }
          .section { margin: 30px 0; padding: 20px; background: #f8f9fa; border-radius: 10px; }
          .concern { padding: 10px; margin: 5px 0; background: white; border-left: 4px solid #ff6b6b; border-radius: 5px; }
          .recommendation { padding: 15px; margin: 10px 0; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .recommendation h4 { margin-top: 0; color: #667eea; }
          .ingredients { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0; }
          .ingredient-tag { background: #e7f3ff; padding: 5px 10px; border-radius: 15px; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>✨ 美魔力 AI 肌膚分析報告</h1>
          <div class="score-circle ${scoreClass}">
            ${summary.overall_score}
          </div>
          <p style="margin-top: 10px; color: #666;">整體評分 / 100</p>
        </div>

        ${summary.warnings.length > 0 ? `
          <div class="warning">
            <strong>⚠️ 注意事項</strong><br>
            ${summary.warnings.map(w => `• ${w}`).join('<br>')}
          </div>
        ` : ''}

        <div class="section">
          <h3>🎯 主要關注</h3>
          ${summary.key_concerns.map(concern => `
            <div class="concern">${concern}</div>
          `).join('')}
        </div>

        <div class="section">
          <h3>💡 保養建議</h3>
          ${summary.recommendations.map(rec => `
            <div class="recommendation">
              <h4>${rec.issue}</h4>
              <p><strong>建議:</strong> ${rec.suggestion}</p>
              <p><strong>推薦成分:</strong></p>
              <div class="ingredients">
                ${rec.ingredients.map(ing => `
                  <span class="ingredient-tag">${ing}</span>
                `).join('')}
              </div>
              <p><strong>使用方式:</strong> ${rec.routine}</p>
            </div>
          `).join('')}
        </div>

        <div class="section">
          <h3>📊 詳細評分</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: white;">
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">膚色</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${summary.detailed_scores.skin_quality.color || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">膚質</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${summary.detailed_scores.skin_quality.texture || 'N/A'}</td>
            </tr>
            <tr style="background: white;">
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">眼袋</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${summary.detailed_scores.eyes.eye_bags || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">黑眼圈</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${summary.detailed_scores.eyes.dark_circles || 'N/A'}</td>
            </tr>
            <tr style="background: white;">
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">痘痘</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${summary.detailed_scores.blemishes.acne?.score || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">斑點</td>
              <td style="padding: 10px; border-bottom: 1px solid #ddd;">${summary.detailed_scores.blemishes.spots?.score || 'N/A'}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-top: 40px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px;">
          <p style="margin: 0; font-size: 18px;">✨ 讓美魔力陪你一起變美 ✨</p>
          <p style="margin: 10px 0 0 0; font-size: 14px;">定期檢測,見證肌膚的魔力蛻變</p>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports =SkinAnalyzer;
