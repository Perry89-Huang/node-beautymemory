// example.js
// 美魔力 AI 肌膚檢測系統 - 使用範例
require('dotenv').config();
const SuluSkinAnalyzer = require('./SuluSkinAnalyzer');
const fs = require('fs');

async function main() {
  console.log('🌟 美魔力 AI 肌膚檢測系統');
  console.log('================================\n');

  try {
    // 初始化分析器
    const analyzer = new SuluSkinAnalyzer(process.env.SULU_API_KEY);
    console.log('✅ 分析器初始化成功\n');

    // ==========================================
    // 範例 1: 驗證圖片
    // ==========================================
    console.log('📋 範例 1: 驗證圖片');
    console.log('----------------------------');
    
    const imagePath = './test-image.jpg';
    const validation = analyzer.validateImage(imagePath);
    
    if (validation.valid) {
      console.log('✅ 圖片驗證通過');
      console.log(`   檔案大小: ${validation.size}`);
    } else {
      console.log('❌ 圖片驗證失敗:');
      validation.errors.forEach(err => console.log(`   • ${err}`));
      return;
    }
    console.log('');

    // ==========================================
    // 範例 2: 分析單張圖片
    // ==========================================
    console.log('📸 範例 2: 分析單張圖片');
    console.log('----------------------------');
    console.log('開始分析...');
    
    const result = await analyzer.analyzeFromPath(imagePath);
    
    if (result.success) {
      console.log('✅ 分析成功!\n');
      
      // 顯示基本資訊
      console.log('📍 臉部位置:');
      console.log(`   ${JSON.stringify(result.data.face_rectangle, null, 2)}\n`);
      
      // 顯示警告(如果有)
      if (result.metadata.has_warnings) {
        console.log('⚠️  警告訊息:');
        result.data.warnings.forEach(warning => {
          console.log(`   • ${warning}`);
        });
        console.log('');
      }
      
      // 生成並顯示摘要
      console.log('📊 生成分析摘要...');
      const summary = analyzer.generateSummary(result);
      
      console.log(`\n🎯 整體評分: ${summary.overall_score}/100`);
      console.log(`   評級: ${summary.overall_score >= 80 ? '優秀' : summary.overall_score >= 60 ? '良好' : '需改善'}`);
      
      console.log('\n🔍 主要關注:');
      summary.key_concerns.forEach(concern => {
        console.log(`   • ${concern}`);
      });
      
      console.log('\n💡 保養建議:');
      summary.recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec.issue}`);
        console.log(`      建議: ${rec.suggestion}`);
        console.log(`      成分: ${rec.ingredients.join(', ')}`);
        console.log(`      使用: ${rec.routine}`);
        if (index < summary.recommendations.length - 1) console.log('');
      });

      // 儲存 HTML 報告
      console.log('\n💾 生成 HTML 報告...');
      const htmlReport = analyzer.generateHtmlReport(summary);
      fs.writeFileSync('./report.html', htmlReport);
      console.log('✅ 報告已儲存至 report.html');
      
    } else {
      console.error('❌ 分析失敗:');
      console.error(`   錯誤代碼: ${result.error.code}`);
      console.error(`   錯誤訊息: ${result.error.message}`);
      if (result.error.detail) {
        console.error(`   詳細資訊: ${JSON.stringify(result.error.detail, null, 2)}`);
      }
    }
    console.log('');

    // ==========================================
    // 範例 3: 從 Base64 分析
    // ==========================================
    console.log('🔢 範例 3: 從 Base64 分析');
    console.log('----------------------------');
    
    const imageBuffer = fs.readFileSync(imagePath);
    const base64String = imageBuffer.toString('base64');
    
    console.log('開始分析 Base64 圖片...');
    const result2 = await analyzer.analyzeFromBase64(base64String);
    
    if (result2.success) {
      console.log('✅ Base64 分析成功!');
      const summary2 = analyzer.generateSummary(result2);
      console.log(`   整體評分: ${summary2.overall_score}/100`);
    } else {
      console.error('❌ 分析失敗:', result2.error.message);
    }
    console.log('');

    // ==========================================
    // 範例 4: 批次分析
    // ==========================================
    console.log('📦 範例 4: 批次分析');
    console.log('----------------------------');
    
    // 假設有多張圖片
    const imagePaths = [imagePath]; // 在實際使用時,這裡會有多個路徑
    
    console.log(`準備分析 ${imagePaths.length} 張圖片...`);
    
    const batchResults = await analyzer.batchAnalyze(imagePaths, (progress) => {
      console.log(`   進度: ${progress.percentage}% (${progress.current}/${progress.total})`);
    });
    
    console.log(`\n✅ 批次分析完成!`);
    console.log(`   成功: ${batchResults.filter(r => r.success).length}`);
    console.log(`   失敗: ${batchResults.filter(r => !r.success).length}`);
    console.log('');

    // ==========================================
    // 範例 5: 從 URL 分析 (如果有公開圖片URL)
    // ==========================================
    /* 
    console.log('🌐 範例 5: 從 URL 分析');
    console.log('----------------------------');
    
    const imageUrl = 'https://example.com/face.jpg';
    console.log('開始從 URL 下載並分析...');
    
    const result3 = await analyzer.analyzeFromUrl(imageUrl);
    if (result3.success) {
      console.log('✅ URL 分析成功!');
    }
    */

    console.log('\n🎉 所有範例執行完成!');
    console.log('================================');

  } catch (error) {
    console.error('\n❌ 發生錯誤:', error.message);
    console.error('錯誤詳情:', error);
  }
}

// 執行主程式
if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;
