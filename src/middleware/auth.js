const jwt = require('jsonwebtoken');
const config = require('../config');

const COOKIE_NAME = 'mystuff_token';
const MAX_AGE_DAYS = 30;

function signToken() {
  return jwt.sign({ sub: 'admin' }, config.jwtSecret, { expiresIn: `${MAX_AGE_DAYS}d` });
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: MAX_AGE_DAYS * 24 * 3600 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

function verifyToken(req) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return false;
  try {
    jwt.verify(token, config.jwtSecret);
    return true;
  } catch {
    return false;
  }
}

// 页面路由：未登录重定向到 /login
function requireAuth(req, res, next) {
  if (verifyToken(req)) return next();
  res.redirect('/login');
}

// API 路由：未登录返回 401
function requireAuthApi(req, res, next) {
  if (verifyToken(req)) return next();
  res.status(401).json({ error: '未登录' });
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireAuthApi, COOKIE_NAME };
