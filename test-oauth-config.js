// test-oauth-config.js
// 測試 OAuth 配置的獨立腳本

require('dotenv').config();

const subdomain = process.env.NHOST_SUBDOMAIN;
const region = process.env.NHOST_REGION || 'ap-southeast-1';
const frontendUrl = process.env.FRONTEND_URL;

console.log('\n========================================');
console.log('🔐 Nhost OAuth 配置測試');
console.log('========================================\n');

console.log('環境變數:');
console.log(`  NHOST_SUBDOMAIN: ${subdomain || '❌ 未設定'}`);
console.log(`  NHOST_REGION: ${region}`);
console.log(`  FRONTEND_URL: ${frontendUrl || '❌ 未設定'}`);

console.log('\n測試不同的 redirectTo URL:\n');

const testUrls = [
  'http://localhost:2000',
  'http://localhost:3001',
  frontendUrl
].filter(Boolean);

testUrls.forEach(url => {
  const authUrl = `https://${subdomain}.auth.${region}.nhost.run/v1/signin/provider/google?redirectTo=${encodeURIComponent(url)}`;
  console.log(`✅ ${url}`);
  console.log(`   OAuth URL: ${authUrl}`);
  console.log('');
});

console.log('========================================');
console.log('⚠️  重要提示:');
console.log('========================================\n');
console.log('請確保在 Nhost Dashboard 中設定:');
console.log('1. 前往: https://app.nhost.io > 您的專案 > Settings > Sign-In Methods');
console.log('2. 啟用 Google OAuth');
console.log('3. 在 "Allowed Redirect URLs" 中添加以下 URL:');
testUrls.forEach(url => {
  console.log(`   ✓ ${url}`);
});
console.log('\n注意: URL 必須完全匹配，包括協議 (http:// 或 https://)');
console.log('      結尾的斜線 (/) 可加可不加，但建議不加\n');

console.log('========================================');
console.log('🧪 測試建議:');
console.log('========================================\n');
console.log('1. 重新啟動後端服務器');
console.log('2. 在瀏覽器中打開開發者工具 (F12)');
console.log('3. 點擊 Google 登入按鈕');
console.log('4. 查看 Console 中的調試日誌:');
console.log('   - 前端: 🔐 發起 Google 登入');
console.log('   - 前端: 🔐 收到 OAuth URL');
console.log('   - 後端: 🔐 Google OAuth Request');
console.log('5. 複製 OAuth URL 並檢查 redirectTo 參數是否正確\n');
