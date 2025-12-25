// utils/timezone.js
// 台灣時區處理工具

/**
 * 獲取台灣當前時間（UTC+8）
 * @returns {Date} 台灣時間的 Date 對象
 */
function getTaiwanTime() {
  const now = new Date();
  // 台灣是 UTC+8
  const taiwanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  return taiwanTime;
}

/**
 * 將 UTC 時間轉換為台灣時間字符串
 * @param {Date|string} date - UTC 時間
 * @returns {string} 台灣時間的 ISO 字符串
 */
function toTaiwanISO(date) {
  const d = new Date(date);
  return d.toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(' ', 'T') + '+08:00';
}

/**
 * 獲取台灣當前時間的 ISO 字符串
 * @returns {string} 台灣時間的 ISO 字符串
 */
function getTaiwanISO() {
  return toTaiwanISO(new Date());
}

/**
 * 格式化為台灣時間顯示
 * @param {Date|string} date - 日期
 * @param {Object} options - 格式選項
 * @returns {string} 格式化後的台灣時間字符串
 */
function formatTaiwanTime(date, options = {}) {
  const d = new Date(date);
  const defaultOptions = {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  return d.toLocaleString('zh-TW', { ...defaultOptions, ...options });
}

/**
 * 獲取台灣當前小時（0-23）
 * @returns {number} 當前小時
 */
function getTaiwanHour() {
  const taiwanTime = getTaiwanTime();
  return taiwanTime.getHours();
}

module.exports = {
  getTaiwanTime,
  toTaiwanISO,
  getTaiwanISO,
  formatTaiwanTime,
  getTaiwanHour
};
