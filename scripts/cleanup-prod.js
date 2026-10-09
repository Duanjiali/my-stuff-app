// 清理生产库测试数据：删除 生产测试- 物品 + 对应 Cloudinary 图
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.production.local') });
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

(async () => {
  const rows = await db.execute("SELECT id, images FROM items WHERE name LIKE '生产测试-%'");
  // 从 URL 提取 public_id：https://res.cloudinary.com/<cloud>/image/upload/v<ts>/<public_id>.<ext>
  const ids = [];
  for (const r of rows.rows) {
    try {
      JSON.parse(r.images || '[]').forEach((u) => {
        const m = String(u).match(/\/upload\/v\d+\/(.+)\.[a-z]+$/i);
        if (m) ids.push(m[1]);
      });
    } catch { /* 忽略坏数据 */ }
  }
  if (ids.length && process.env.CLOUDINARY_URL) {
    const { v2 } = require('cloudinary');
    v2.config(true);
    for (const id of ids) {
      try {
        await v2.uploader.destroy(id);
        console.log('cloudinary destroyed:', id);
      } catch (e) {
        console.warn('destroy fail:', id, e.message);
      }
    }
  }
  const a = await db.execute("DELETE FROM items WHERE name LIKE '生产测试-%'");
  console.log(`cleaned: ${a.rowsAffected} items, ${ids.length} cloudinary images`);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
