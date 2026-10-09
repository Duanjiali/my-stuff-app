const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { initDb, db } = require('./db');
const { requireAuth } = require('./middleware/auth');
const { parseItem } = require('./helpers');

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const categoryRoutes = require('./routes/categories');
const outfitRoutes = require('./routes/outfits');
const apiRoutes = require('./routes/api');

// views 目录定位双保险：本地 cwd 与 Netlify bundle 内均能命中
function resolveViewsDir() {
  const candidates = [
    path.join(process.cwd(), 'views'),
    path.join(__dirname, '..', 'views'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

async function home(req, res, next) {
  try {
    const statsRs = await db.execute(`
      SELECT
        (SELECT COUNT(*) FROM items WHERE status = 'active') AS items,
        (SELECT COUNT(*) FROM categories) AS cats,
        (SELECT COUNT(*) FROM outfits) AS outfits`);
    const recentRs = await db.execute(`
      SELECT i.*, c.name AS category_name, c.icon AS category_icon
      FROM items i JOIN categories c ON c.id = i.category_id
      WHERE i.status = 'active' ORDER BY i.created_at DESC LIMIT 6`);
    res.render('home', {
      title: 'MyStuff', activeTab: 'home',
      stats: statsRs.rows[0],
      recent: recentRs.rows.map(parseItem),
    });
  } catch (err) { next(err); }
}

async function createApp() {
  await initDb();

  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', resolveViewsDir());

  // 静态资源：线上由 Netlify CDN 直出 publish 目录，这里的 static 仅本地生效
  app.use(express.static(path.join(process.cwd(), 'public')));
  app.use('/uploads', express.static(config.uploadsDir));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.use(authRoutes);        // /login /logout（无需登录）
  app.use(requireAuth);       // 之后所有页面需要登录
  app.get('/', home);
  app.use('/items', itemRoutes);
  app.use('/categories', categoryRoutes);
  app.use('/outfits', outfitRoutes);
  app.use('/api', apiRoutes);

  app.use((req, res) => res.status(404).send('页面不存在'));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err && err.status ? err.status : 500;
    if (status < 500) {
      if (req.path.startsWith('/api')) return res.status(status).json({ error: err.message });
      return res.status(status).send(err.message);
    }
    console.error(err);
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).send('图片过大（上限 6MB），请重拍或压缩后再传');
    }
    if (req.path.startsWith('/api')) return res.status(500).json({ error: '服务器错误' });
    if (res.headersSent) return next(err);
    res.status(500).send('服务器错误，请稍后再试');
  });

  return app;
}

if (require.main === module) {
  createApp()
    .then((app) => {
      app.listen(config.port, () => {
        console.log(`MyStuff running at http://localhost:${config.port}`);
      });
    })
    .catch((err) => {
      console.error('启动失败:', err);
      process.exit(1);
    });
}

module.exports = { createApp };
