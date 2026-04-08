// middleware/adminAuth.js
// 後台管理員認證中介層

const jwt = require('jsonwebtoken');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'beauty-memory-admin-secret-2024';

/**
 * 驗證管理員 Token
 */
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'NO_TOKEN', message: '未提供管理員 Token' }
    });
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_ADMIN', message: '權限不足' }
      });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Token 無效或已過期' }
    });
  }
};

module.exports = { authenticateAdmin, ADMIN_JWT_SECRET };
