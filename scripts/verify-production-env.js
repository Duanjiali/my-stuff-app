// 一次性验证：用生产凭证直连 Turso + Cloudinary，确认有效并初始化表结构
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production.local') });

(async () => {
  // 1. Turso：建表 + 种子（幂等），再读回验证
  const { initDb, db } = require('../src/db');
  await initDb();
  const cats = await db.execute('SELECT name FROM categories ORDER BY sort, id');
  console.log('Turso OK -> 种子品类:', cats.rows.map((r) => r.name).join(' / '), `(共 ${cats.rows.length} 条)`);

  // 2. Cloudinary：上传测试图 -> 拿 URL -> 清理
  const { v2 } = require('cloudinary');
  v2.config(true);
  const rs = await v2.uploader.upload('public/icons/icon.png', { folder: 'my-stuff' });
  console.log('Cloudinary OK ->', rs.secure_url);
  await v2.uploader.destroy(rs.public_id);
  console.log('测试图已清理，生产凭证全部有效');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
