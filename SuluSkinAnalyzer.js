// SuluSkinAnalyzer.js (now using AILabTools)
// 美魔力 × AILabTools Skin Analyze API 整合
// 版本: 2.0.0

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * AILabTools Skin Analyze API 的 Node.js 封裝類別
 * (原 Sulu API 已關閉，改用 AILabTools)
 */
class SuluSkinAnalyzer {
  /**
   * 初始化分析器
   * @param {string} apiKey - API 金鑰(可選,會從環境變數讀取)
   * @param {string} version - API 版本 ('basic' 或 'advanced'，默認 'advanced')
   */
  constructor(apiKey = null, version = 'advanced') {
    // 支援兩種環境變數名稱(向後兼容)
    this.apiKey = apiKey || process.env.AILAB_API_KEY || process.env.SULU_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('API Key is required. Set AILAB_API_KEY (or SULU_API_KEY) environment variable or pass it to constructor.');
    }
    
    // 設置 API 版本
    this.version = version === 'basic' ? 'basic' : 'advanced';
    
    // AILabTools API 配置
    this.baseURL = 'https://www.ailabapi.com';
    this.endpoints = {
      basic: '/api/portrait/analysis/skin-analysis',
      advanced: '/api/portrait/analysis/skin-analysis-advanced'
    };
    this.endpoint = this.endpoints[this.version];
    this.timeout = 30000; // 30 秒
    this.maxRetries = 3; // 最大重試次數
    this.retryDelay = 1000; // 重試延遲(毫秒)
    
    // 日誌配置(隱藏 API Key 的前綴)
    const maskedKey = this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT_SET';
    console.log(`🔧 AILabTools Skin Analyzer 配置:`);
    console.log(`   - Provider: AILabTools (原 Sulu)`);
    console.log(`   - Version: ${this.version === 'basic' ? '基礎版' : '專業版'} (${this.version})`);
    console.log(`   - Base URL: ${this.baseURL}`);
    console.log(`   - Endpoint: ${this.endpoint}`);
    console.log(`   - API Key: ${maskedKey}`);
    console.log(`   - Timeout: ${this.timeout}ms`);
    console.log(`   - Max Retries: ${this.maxRetries}`);
  }

  /**
   * 設置 API 版本
   * @param {string} version - API 版本 ('basic' 或 'advanced')
   */
  setVersion(version) {
    this.version = version === 'basic' ? 'basic' : 'advanced';
    this.endpoint = this.endpoints[this.version];
    console.log(`🔄 切換到 ${this.version === 'basic' ? '基礎版' : '專業版'} API`);
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

      // 驗證檔案大小 (基礎版 2MB，專業版 5MB)
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
      // 驗證 Buffer 大小 (基礎版 2MB，專業版 5MB)
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

      return this.processResponse(response.data);
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
    
    // 成功回應 - 轉換 AILabTools 格式為統一格式
    const result = this.convertAILabToUnifiedFormat(data.result || {});

    return {
      success: true,
      data: {
        result: result,
        face_rectangle: data.face_rectangle || {},
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
      detailed_scores: this.extractDetailedScores(result)
    };
  }

  /**
   * 計算整體評分
   * @param {Object} result - 分析結果
   * @returns {number} 整體評分 (0-100)
   */
  calculateOverallScore(result) {
    const scores = [];
    
    // 根據 AILabTools API 原始數據計算分數
    // 膚色 - confidence 越高越好
    if (result.skin_color?.confidence) {
      scores.push(result.skin_color.confidence * 100);
    }
    
    // 膚齡 - 年齡越小分數越高
    if (result.skin_age?.value) {
      scores.push(Math.max(0, 100 - result.skin_age.value));
    }
    
    // 眼袋 - value=0 最好
    if (result.eye_pouch?.value !== undefined) {
      scores.push((1 - result.eye_pouch.value) * 100);
    }
    
    // 黑眼圈 - value=0 最好
    if (result.dark_circle?.value !== undefined) {
      const darkCircleScore = result.dark_circle.value === 0 ? 100 : 70;
      scores.push(darkCircleScore);
    }
    
    // 皺紋 - value=0 最好
    if (result.forehead_wrinkle?.value !== undefined) {
      scores.push((1 - result.forehead_wrinkle.value) * 100);
    }
    if (result.crows_feet?.value !== undefined) {
      scores.push((1 - result.crows_feet.value) * 100);
    }
    if (result.nasolabial_fold?.value !== undefined) {
      scores.push((1 - result.nasolabial_fold.value) * 100);
    }
    
    // 毛孔 - value=0 最好
    if (result.pores_forehead?.value !== undefined) {
      scores.push((1 - result.pores_forehead.value) * 100);
    }
    if (result.pores_left_cheek?.value !== undefined) {
      scores.push((1 - result.pores_left_cheek.value) * 100);
    }
    if (result.pores_right_cheek?.value !== undefined) {
      scores.push((1 - result.pores_right_cheek.value) * 100);
    }
    
    // 黑頭 - value=0 最好
    if (result.blackhead?.value !== undefined) {
      scores.push(Math.max(0, 100 - (result.blackhead.value * 25)));
    }
    
    // 痘痘 - rectangle 越少越好
    if (result.acne?.rectangle) {
      const acneCount = result.acne.rectangle.length;
      const acneScore = acneCount === 0 ? 100 : Math.max(30, 100 - (acneCount * 5));
      scores.push(acneScore);
    }
    
    // 斑點 - rectangle 越少越好
    if (result.skin_spot?.rectangle) {
      const spotCount = result.skin_spot.rectangle.length;
      const spotScore = spotCount === 0 ? 100 : Math.max(30, 100 - (spotCount * 3));
      scores.push(spotScore);
    }

    return scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
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
    if (result.eye_pouch?.value === 1) {
      const severity = result.eye_pouch_severity?.value;
      const severityText = severity === 0 ? '輕度' : severity === 1 ? '中度' : severity === 2 ? '嚴重' : '';
      concerns.push(`${severityText}眼袋問題`);
    }

    // 皺紋
    if (result.forehead_wrinkle?.value === 1) {
      concerns.push('額頭皺紋');
    }
    if (result.crows_feet?.value === 1) {
      concerns.push('魚尾紋');
    }
    if (result.nasolabial_fold?.value === 1) {
      const severity = result.nasolabial_fold_severity?.value;
      const severityText = severity === 0 ? '輕度' : severity === 1 ? '中度' : severity === 2 ? '嚴重' : '';
      concerns.push(`${severityText}法令紋`);
    }
    if (result.eye_finelines?.value === 1) {
      concerns.push('眼部細紋');
    }
    if (result.glabella_wrinkle?.value === 1) {
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
        suggestion: '建議使用含水楊酸(BHA)或茶樹精油的控油產品',
        ingredients: ['水楊酸', '茶樹精油', '杜鵑花酸'],
        routine: '早晚清潔後使用,局部點塗於痘痘處'
      });
    }

    // 斑點問題
    if (result.skin_spot?.rectangle && result.skin_spot.rectangle.length > 3) {
      recommendations.push({
        issue: '斑點色素沉澱',
        suggestion: '建議使用美白精華,搭配嚴格防曬',
        ingredients: ['維生素C', '熊果素', '傳明酸', '菸鹼醯胺'],
        routine: '晚上使用美白精華,白天務必防曬(SPF50+)'
      });
    }

    // 黑眼圈
    if (result.dark_circle?.value > 0) {
      recommendations.push({
        issue: '黑眼圈',
        suggestion: '建議使用含咖啡因的眼霜,並改善睡眠品質',
        ingredients: ['咖啡因', '維生素K', '視黃醇'],
        routine: '早晚輕輕拍打於眼周,確保每日睡眠7-8小時'
      });
    }

    // 眼袋
    if (result.eye_pouch?.value === 1) {
      recommendations.push({
        issue: '眼袋',
        suggestion: '建議使用緊緻眼霜,搭配眼周按摩',
        ingredients: ['咖啡因', '勝肽', '玻尿酸'],
        routine: '使用眼霜時搭配輕柔按摩,促進淋巴循環'
      });
    }

    // 皺紋問題
    let hasWrinkles = false;
    if (result.forehead_wrinkle?.value === 1 || 
        result.crows_feet?.value === 1 || 
        result.nasolabial_fold?.value === 1) {
      hasWrinkles = true;
    }

    if (hasWrinkles) {
      recommendations.push({
        issue: '皺紋細紋',
        suggestion: '建議使用抗老精華,加強保濕',
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

module.exports = SuluSkinAnalyzer;
