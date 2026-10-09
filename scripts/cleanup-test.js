// 清理验证用测试数据：测试- 前缀物品 + 限流计数
require('dotenv').config();
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:data/local.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

(async () => {
  const a = await db.execute("DELETE FROM items WHERE name LIKE '测试-%'");
  const b = await db.execute('DELETE FROM login_attempts');
  console.log(`cleaned: ${a.rowsAffected} items, ${b.rowsAffected} attempts`);
})();
