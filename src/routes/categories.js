const express = require('express');
const { db } = require('../db');
const { parseCategory, parseJson } = require('../helpers');
const { BEHAVIORS, FIELD_TYPES } = require('../constants');

const router = express.Router();

async function countItems(catId) {
  const rs = await db.execute({ sql: "SELECT COUNT(*) AS n FROM items WHERE category_id = ? AND status = 'active'", args: [catId] });
  return Number(rs.rows[0].n);
}

function sanitizeSchema(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && f.key && f.label && FIELD_TYPES.includes(f.type))
      .slice(0, 12)
      .map((f) => ({
        key: String(f.key).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30),
        label: String(f.label).slice(0, 20),
        type: f.type,
        unit: String(f.unit || '').slice(0, 8),
        options: Array.isArray(f.options) ? f.options.map((o) => String(o).slice(0, 20)).slice(0, 12) : [],
        required: false,
      }))
      .filter((f) => f.key);
  } catch { return []; }
}

function sanitizeBehaviors(body) {
  return BEHAVIORS.filter((b) => body[`behavior_${b}`]);
}

router.get('/', async (req, res, next) => {
  try {
    const rs = await db.execute(`
      SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id AND i.status = 'active') AS item_count
      FROM categories c ORDER BY c.sort, c.id`);
    res.render('categories', {
      title: '品类管理', activeTab: 'settings',
      cats: rs.rows.map((r) => ({ ...parseCategory(r), itemCount: Number(r.item_count) })),
      err: req.query.err || null,
      behaviorLabels: { outfit: '可搭配', consumable: '消耗品', asset: '资产' },
    });
  } catch (err) { next(err); }
});

async function renderForm(req, res, cat) {
  res.render('category-form', {
    title: cat ? '编辑品类' : '新建品类', activeTab: 'settings',
    cat, mode: cat ? 'edit' : 'new',
    behaviors: BEHAVIORS,
    behaviorLabels: { outfit: '可搭配', consumable: '消耗品', asset: '资产' },
    behaviorDesc: {
      outfit: '拥有季节/场合/色系字段，进搭配组合并参与打分',
      consumable: '面向效期与余量（适合化妆品、洗衣液、油盐酱醋）',
      asset: '面向保修与存放（适合电器）',
    },
  });
}

router.get('/new', async (req, res, next) => {
  try { await renderForm(req, res, null); } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [req.params.id] });
    const cat = parseCategory(rs.rows[0]);
    if (!cat) return res.status(404).send('品类不存在');
    await renderForm(req, res, cat);
  } catch (err) { next(err); }
});

async function save(req, res, cat) {
  const name = String(req.body.name || '').trim().slice(0, 20);
  if (!name) return res.status(400).send('品类名称必填');
  const icon = String(req.body.icon || name.slice(0, 1)).slice(0, 2);
  const behaviors = sanitizeBehaviors(req.body);
  const fieldSchema = sanitizeSchema(req.body.fields);

  if (cat) {
    await db.execute({
      sql: 'UPDATE categories SET name=?, icon=?, behaviors=?, field_schema=? WHERE id=?',
      args: [name, icon, JSON.stringify(behaviors), JSON.stringify(fieldSchema), cat.id],
    });
    return cat.id;
  }
  const rs = await db.execute({
    sql: 'INSERT INTO categories (name, icon, behaviors, field_schema, sort, created_at) VALUES (?, ?, ?, ?, 99, ?)',
    args: [name, icon, JSON.stringify(behaviors), JSON.stringify(fieldSchema), Date.now()],
  });
  return Number(rs.lastInsertRowid);
}

router.post('/', async (req, res, next) => {
  try { await save(req, res, null); res.redirect('/categories'); } catch (err) { next(err); }
});

router.post('/:id', async (req, res, next) => {
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [req.params.id] });
    const cat = parseCategory(rs.rows[0]);
    if (!cat) return res.status(404).send('品类不存在');
    await save(req, res, cat);
    res.redirect('/categories');
  } catch (err) { next(err); }
});

// 变更矩阵裁决：删配置永不删数据——有物品时拦截删除
router.post('/:id/delete', async (req, res, next) => {
  try {
    const n = await countItems(Number(req.params.id));
    if (n > 0) return res.redirect('/categories?err=has_items');
    await db.execute({ sql: 'DELETE FROM categories WHERE id = ?', args: [req.params.id] });
    res.redirect('/categories');
  } catch (err) { next(err); }
});

module.exports = router;
