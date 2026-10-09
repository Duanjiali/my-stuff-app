const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const config = require('../config');
const { signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// 限流：同 IP 10 分钟内最多 5 次失败尝试（计数存 Turso，serverless 无内存）
async function checkRateLimit(req, res) {
  const ip = clientIp(req);
  const rs = await db.execute({ sql: 'SELECT count, window_start FROM login_attempts WHERE ip = ?', args: [ip] });
  const row = rs.rows[0];
  if (!row) return ip;
  const elapsed = Date.now() - Number(row.window_start);
  if (elapsed > WINDOW_MS) {
    await db.execute({ sql: 'DELETE FROM login_attempts WHERE ip = ?', args: [ip] });
    return ip;
  }
  if (Number(row.count) >= MAX_ATTEMPTS) {
    const waitMin = Math.ceil((WINDOW_MS - elapsed) / 60000);
    res.status(429).render('login', { error: `尝试次数过多，请 ${waitMin} 分钟后再试`, title: '登录' });
    return null;
  }
  return ip;
}

async function recordFailure(ip) {
  const rs = await db.execute({ sql: 'SELECT count, window_start FROM login_attempts WHERE ip = ?', args: [ip] });
  const row = rs.rows[0];
  if (!row || Date.now() - Number(row.window_start) > WINDOW_MS) {
    await db.execute({
      sql: `INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?)
            ON CONFLICT(ip) DO UPDATE SET count = 1, window_start = excluded.window_start`,
      args: [ip, Date.now()],
    });
  } else {
    await db.execute({ sql: 'UPDATE login_attempts SET count = count + 1 WHERE ip = ?', args: [ip] });
  }
}

router.get('/login', (req, res) => {
  res.render('login', { error: null, title: '登录' });
});

router.post('/login', async (req, res, next) => {
  try {
    const ip = await checkRateLimit(req, res);
    if (ip === null) return;

    const { password } = req.body || {};
    let ok = false;
    if (config.adminPasswordHash) {
      ok = await bcrypt.compare(String(password || ''), config.adminPasswordHash);
    } else {
      ok = String(password || '') === config.adminPassword;
    }

    if (!ok) {
      await recordFailure(ip);
      return res.status(401).render('login', { error: '密码不正确', title: '登录' });
    }

    await db.execute({ sql: 'DELETE FROM login_attempts WHERE ip = ?', args: [ip] });
    setAuthCookie(res, signToken());
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.redirect('/login');
});

module.exports = router;
