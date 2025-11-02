// SuluSkinAnalyzer.js
// 美魔力 × Sulu Skin Analyze API 整合
// 版本: 1.0.0

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

/**
 * Sulu Skin Analyze API 的 Node.js 封裝類別
 */
class SuluSkinAnalyzer {
  /**
   * 初始化分析器
   * @param {string} apiKey - API 金鑰(可選,會從環境變數讀取)
   */
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.SULU_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('API Key is required. Set SULU_API_KEY environment variable or pass it to constructor.');
    }
    
    this.baseURL = 'https://skin-analyze.p.sulu.sh';
    this.endpoint = '/portrait/analysis/skinanalyze';
    this.timeout = 30000; // 30 秒
  }

  /**
   * 從本地檔案路徑分析肌膚
   * @param {string} imagePath - 圖片檔案路徑
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeFromPath(imagePath) {
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

      // 驗證檔案大小 (5MB)
      const stats = fs.statSync(imagePath);
      const sizeInMB = stats.size / (1024 * 1024);
      if (sizeInMB > 5) {
        throw new Error(`Image size (${sizeInMB.toFixed(2)} MB) exceeds 5 MB limit`);
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
    }
  }

  /**
   * 從 Buffer 分析肌膚
   * @param {Buffer} imageBuffer - 圖片 Buffer
   * @param {string} filename - 檔案名稱 (可選)
   * @returns {Promise<Object>} 分析結果
   */
  async analyzeFromBuffer(imageBuffer, filename = 'image.jpg') {
    try {
      // 驗證 Buffer 大小
      const sizeInMB = imageBuffer.length / (1024 * 1024);
      if (sizeInMB > 5) {
        throw new Error(`Image size (${sizeInMB.toFixed(2)} MB) exceeds 5 MB limit`);
      }

      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: filename,
        contentType: 'image/jpeg'
      });

      const response = await axios.post(
        `${this.baseURL}${this.endpoint}`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            ...formData.getHeaders()
          },
          timeout: this.timeout
        }
      );

      return this.processResponse(response.data);
    } catch (error) {
      return this.handleError(error);
    }
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
    // 檢查錯誤
    if (data.error_code !== 0) {
      return {
        success: false,
        error: {
          code: data.error_code,
          message: data.error_msg || 'Unknown error',
          detail: data.error_detail
        },
        metadata: {
          request_id: data.request_id,
          log_id: data.log_id
        }
      };
    }

    // 成功回應
    return {
      success: true,
      data: {
        result: data.result || {},
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
   * 錯誤處理
   * @param {Error} error - 錯誤物件
   * @returns {Object} 錯誤回應
   */
  handleError(error) {
    if (error.response) {
      // API 回應錯誤
      const data = error.response.data || {};
      return {
        success: false,
        error: {
          code: error.response.status,
          message: data.error_msg || error.message,
          detail: data.error_detail
        },
        metadata: {
          request_id: data.request_id,
          log_id: data.log_id
        }
      };
    } else if (error.request) {
      // 請求發送失敗
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Failed to connect to API server',
          detail: error.message
        }
      };
    } else {
      // 其他錯誤
      return {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: error.message
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
    
    // 收集所有分數
    if (result.skin_color?.score) scores.push(result.skin_color.score);
    if (result.skin_texture?.score) scores.push(result.skin_texture.score);
    if (result.eye_bags?.score) scores.push(result.eye_bags.score);
    if (result.dark_circles?.score) scores.push(result.dark_circles.score);
    if (result.acne?.score) scores.push(result.acne.score);
    if (result.spots?.score) scores.push(result.spots.score);

    if (result.wrinkles) {
      if (result.wrinkles.forehead?.score) scores.push(result.wrinkles.forehead.score);
      if (result.wrinkles.eye_corner?.score) scores.push(result.wrinkles.eye_corner.score);
      if (result.wrinkles.nasolabial?.score) scores.push(result.wrinkles.nasolabial.score);
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
    const threshold = {
      high: 70,
      medium: 60
    };

    if (result.acne?.score < threshold.high) {
      const level = result.acne.score < threshold.medium ? '嚴重' : '輕度';
      concerns.push(`${level}痘痘問題 (${result.acne.count || 0} 處)`);
    }
    
    if (result.spots?.score < threshold.high) {
      const level = result.spots.score < threshold.medium ? '明顯' : '輕微';
      concerns.push(`${level}斑點色素沉澱 (${result.spots.count || 0} 處)`);
    }
    
    if (result.dark_circles?.score < threshold.medium) {
      concerns.push('明顯黑眼圈');
    }
    
    if (result.eye_bags?.score < threshold.medium) {
      concerns.push('眼袋問題');
    }

    if (result.wrinkles) {
      if (result.wrinkles.forehead?.score < threshold.high) {
        concerns.push(`額頭皺紋 (${result.wrinkles.forehead.count || 0} 條)`);
      }
      if (result.wrinkles.eye_corner?.score < threshold.high) {
        concerns.push(`魚尾紋 (${result.wrinkles.eye_corner.count || 0} 條)`);
      }
      if (result.wrinkles.nasolabial?.score < threshold.high) {
        concerns.push(`法令紋 (${result.wrinkles.nasolabial.count || 0} 條)`);
      }
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
    if (result.acne?.count > 5) {
      recommendations.push({
        issue: '痘痘問題',
        suggestion: '建議使用含水楊酸(BHA)或茶樹精油的控油產品',
        ingredients: ['水楊酸', '茶樹精油', '杜鵑花酸'],
        routine: '早晚清潔後使用,局部點塗於痘痘處'
      });
    }

    // 斑點問題
    if (result.spots?.count > 3) {
      recommendations.push({
        issue: '斑點色素沉澱',
        suggestion: '建議使用美白精華,搭配嚴格防曬',
        ingredients: ['維生素C', '熊果素', '傳明酸', '菸鹼醯胺'],
        routine: '晚上使用美白精華,白天務必防曬(SPF50+)'
      });
    }

    // 黑眼圈
    if (result.dark_circles?.score < 60) {
      recommendations.push({
        issue: '黑眼圈',
        suggestion: '建議使用含咖啡因的眼霜,並改善睡眠品質',
        ingredients: ['咖啡因', '維生素K', '視黃醇'],
        routine: '早晚輕輕拍打於眼周,確保每日睡眠7-8小時'
      });
    }

    // 眼袋
    if (result.eye_bags?.score < 60) {
      recommendations.push({
        issue: '眼袋',
        suggestion: '建議使用緊緻眼霜,搭配眼周按摩',
        ingredients: ['咖啡因', '勝肽', '玻尿酸'],
        routine: '使用眼霜時搭配輕柔按摩,促進淋巴循環'
      });
    }

    // 皺紋問題
    const wrinkleCount = 
      (result.wrinkles?.forehead?.count || 0) +
      (result.wrinkles?.eye_corner?.count || 0) +
      (result.wrinkles?.nasolabial?.count || 0);

    if (wrinkleCount > 3) {
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
        color: result.skin_color?.score || null,
        texture: result.skin_texture?.score || null
      },
      eyes: {
        eye_bags: result.eye_bags?.score || null,
        dark_circles: result.dark_circles?.score || null,
        double_eyelid: result.double_eyelid || null
      },
      wrinkles: {
        forehead: result.wrinkles?.forehead || null,
        eye_corner: result.wrinkles?.eye_corner || null,
        nasolabial: result.wrinkles?.nasolabial || null
      },
      blemishes: {
        acne: result.acne || null,
        spots: result.spots || null
      }
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
