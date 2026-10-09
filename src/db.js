const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const config = require('./config');

// libsql 不会自动创建父目录：file: 模式下先确保 data 目录存在
if (config.databaseUrl.startsWith('file:')) {
  const dbPath = path.resolve(config.databaseUrl.slice('file:'.length));
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = createClient({
  url: config.databaseUrl,
  authToken: config.dbAuthToken || undefined,
});

async function initDb() {
  await db.execute(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '',
    behaviors TEXT DEFAULT '[]',
    field_schema TEXT DEFAULT '[]',
    sort INTEGER DEFAULT 0,
    created_at INTEGER
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    price REAL,
    purchased_at TEXT DEFAULT '',
    images TEXT DEFAULT '[]',
    colors TEXT DEFAULT '[]',
    is_patterned INTEGER DEFAULT 0,
    seasons TEXT DEFAULT '[]',
    occasions TEXT DEFAULT '[]',
    formality INTEGER,
    ext TEXT DEFAULT '{}',
    status TEXT DEFAULT 'active',
    wear_count INTEGER DEFAULT 0,
    last_worn_at INTEGER,
    created_at INTEGER
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS outfits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT '',
    item_ids TEXT DEFAULT '[]',
    occasion TEXT DEFAULT '',
    seasons TEXT DEFAULT '[]',
    score REAL,
    reasons TEXT DEFAULT '[]',
    is_favorite INTEGER DEFAULT 0,
    created_at INTEGER
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    window_start INTEGER
  )`);

  await seedCategories();
}

const SEED_CATEGORIES = [
  { name: '服装', icon: '衣', behaviors: ['outfit'], field_schema: [] },
  { name: '鞋子', icon: '鞋', behaviors: ['outfit'], field_schema: [
    { key: 'size', label: '尺码', type: 'number', unit: '', options: [], required: false },
  ] },
  { name: '化妆品', icon: '妆', behaviors: ['consumable'], field_schema: [
    { key: 'shade', label: '色号', type: 'text', unit: '', options: [], required: false },
    { key: 'opened_at', label: '开封日期', type: 'date', unit: '', options: [], required: false },
    { key: 'pao_months', label: '开封后保质期', type: 'number', unit: '月', options: [], required: false },
    { key: 'remaining', label: '余量', type: 'number', unit: '%', options: [], required: false },
  ] },
  { name: '电器', icon: '电', behaviors: ['asset'], field_schema: [
    { key: 'warranty_until', label: '保修至', type: 'date', unit: '', options: [], required: false },
    { key: 'location', label: '存放位置', type: 'text', unit: '', options: [], required: false },
  ] },
];

async function seedCategories() {
  const rs = await db.execute('SELECT COUNT(*) AS n FROM categories');
  if (Number(rs.rows[0].n) > 0) return;
  const now = Date.now();
  for (let i = 0; i < SEED_CATEGORIES.length; i++) {
    const c = SEED_CATEGORIES[i];
    await db.execute({
      sql: 'INSERT INTO categories (name, icon, behaviors, field_schema, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [c.name, c.icon, JSON.stringify(c.behaviors), JSON.stringify(c.field_schema), i, now],
    });
  }
}

module.exports = { db, initDb };
