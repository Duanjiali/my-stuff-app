const express = require('express');
const multer = require('multer');
const { db } = require('../db');
const { parseItem, parseCategory, collectExt, httpError } = require('../helpers');
const { saveImage } = require('../upload');
const { SEASONS, OCCASIONS, SLOTS, SLOT_LABELS } = require('../constants');
const { FAMILY_LABELS, FAMILY_SWATCHES } = require('../scoring/color');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
const COLOR_KEYS = Object.keys(FAMILY_LABELS);

async function listCategories() {
  const rs = await db.execute('SELECT * FROM categories ORDER BY sort, id');
  return rs.rows.map(parseCategory);
}

async function getItemWithCat(id) {
  const rs = await db.execute({
    sql: `SELECT i.*, c.name AS category_name, c.icon AS category_icon, c.behaviors AS category_behaviors, c.field_schema AS category_schema
          FROM items i JOIN categories c ON c.id = i.category_id WHERE i.id = ?`,
    args: [id],
  });
  if (!rs.rows.length) return null;
  const item = parseItem(rs.rows[0]);
  item.categoryBehaviors = JSON.parse(rs.rows[0].category_behaviors || '[]');
  item.categorySchema = JSON.parse(rs.rows[0].category_schema || '[]');
  return item;
}

function buildFilters(query) {
  const where = ['1=1'];
  const args = [];
  const status = query.status === 'archived' ? 'archived' : 'active';
  where.push('i.status = ?');
  args.push(status);
  if (query.category) {
    where.push('i.category_id = ?');
    args.push(Number(query.category));
  }
  if (query.q) {
    where.push('(i.name LIKE ? OR i.brand LIKE ?)');
    const like = `%${query.q}%`;
    args.push(like, like);
  }
  if (query.color && COLOR_KEYS.includes(query.color)) {
    where.push('i.colors LIKE ?');
    args.push(`%"${query.color}"%`);
  }
  return { where: where.join(' AND '), args };
}

router.get('/', async (req, res, next) => {
  try {
    const cats = await listCategories();
    const { where, args } = buildFilters(req.query);
    const rs = await db.execute({
      sql: `SELECT i.*, c.name AS category_name, c.icon AS category_icon
            FROM items i JOIN categories c ON c.id = i.category_id
            WHERE ${where} ORDER BY i.created_at DESC`,
      args,
    });
    const items = rs.rows.map(parseItem);
    const archivedRs = await db.execute({ sql: "SELECT COUNT(*) AS n FROM items WHERE status = 'archived'", args: [] });
    res.render('items', {
      title: '物品库', activeTab: 'items',
      cats, items,
      filters: { category: req.query.category || '', q: req.query.q || '', color: req.query.color || '', status: req.query.status || 'active' },
      archivedCount: Number(archivedRs.rows[0].n),
      colorKeys: COLOR_KEYS, familyLabels: FAMILY_LABELS, swatches: FAMILY_SWATCHES,
    });
  } catch (err) { next(err); }
});

// 表单渲染（新增/编辑共用）；编辑模式下 ?category= 可切换品类刷新字段
async function renderForm(req, res, item) {
  const cats = await listCategories();
  const selId = item ? Number(req.query.category || item.category_id) : Number(req.query.category || cats[0]?.id || 0);
  const cat = cats.find((c) => c.id === selId) || (item ? cats.find((c) => c.id === item.category_id) : null) || cats[0];
  if (!cat) return res.redirect('/categories?err=no_category');
  res.render('item-form', {
    title: item ? '编辑物品' : '添加物品', activeTab: 'items',
    mode: item ? 'edit' : 'new',
    cats, cat, item,
    values: item || {},
    allSeasons: SEASONS, allOccasions: OCCASIONS,
    allSlots: SLOTS, slotLabels: SLOT_LABELS,
    colorKeys: COLOR_KEYS, familyLabels: FAMILY_LABELS, swatches: FAMILY_SWATCHES,
  });
}

router.get('/new', async (req, res, next) => {
  try { await renderForm(req, res, null); } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const item = await getItemWithCat(req.params.id);
    if (!item) return res.status(404).send('物品不存在');
    await renderForm(req, res, item);
  } catch (err) { next(err); }
});

async function saveItem(req, res, item) {
  const catId = Number(req.body.category_id);
  const catRs = await db.execute({ sql: 'SELECT * FROM categories WHERE id = ?', args: [catId] });
  const cat = parseCategory(catRs.rows[0]);
  if (!cat) throw httpError(400, '品类不存在');

  const colors = parseColors(req.body.colors);
  const isPatterned = req.body.is_patterned ? 1 : 0;
  const seasons = SEASONS.filter((s) => req.body[`season_${s}`]);
  const occasions = OCCASIONS.filter((o) => req.body[`occasion_${o}`]);
  const formality = req.body.formality ? Number(req.body.formality) : null;
  // 表单未渲染 slot 字段（非搭配品类）时保留旧值；提交空串表示主动清空
  const slot = 'slot' in req.body
    ? (SLOTS.includes(req.body.slot) ? req.body.slot : '')
    : (item && item.slot ? item.slot : '');
  const ext = collectExt(cat.fieldSchema, req.body);

  let images = item ? item.images : [];
  if (req.file && req.file.buffer) {
    const url = await saveImage(req.file.buffer, req.file.mimetype);
    if (url) images = [url]; // v1 一件一图，重传即替换；存储不可用时保留旧图/无图
  }

  // 数据永不丢：编辑时合并旧 ext，被删字段的旧值保留在数据库里
  const mergedExt = item ? { ...item.ext, ...ext } : ext;

  if (item) {
    await db.execute({
      sql: `UPDATE items SET category_id=?, name=?, brand=?, price=?, purchased_at=?, images=?, colors=?, is_patterned=?,
            seasons=?, occasions=?, formality=?, slot=?, ext=? WHERE id=?`,
      args: [catId, req.body.name, req.body.brand || '', numOrNull(req.body.price), req.body.purchased_at || '',
        JSON.stringify(images), JSON.stringify(colors), isPatterned,
        JSON.stringify(seasons), JSON.stringify(occasions), formality, slot, JSON.stringify(mergedExt), item.id],
    });
    return item.id;
  }
  const rs = await db.execute({
    sql: `INSERT INTO items (category_id, name, brand, price, purchased_at, images, colors, is_patterned,
          seasons, occasions, formality, slot, ext, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    args: [catId, req.body.name, req.body.brand || '', numOrNull(req.body.price), req.body.purchased_at || '',
      JSON.stringify(images), JSON.stringify(colors), isPatterned,
      JSON.stringify(seasons), JSON.stringify(occasions), formality, slot, JSON.stringify(ext), Date.now()],
  });
  return Number(rs.lastInsertRowid);
}

function numOrNull(v) {
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

// 服务端兜底解析 colors JSON（前端已提取，用户可能人工改过）
function parseColors(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, 3).map((c) => ({
      family: String(c.family || 'gray'),
      ratio: Math.max(0, Math.min(1, Number(c.ratio) || 0)),
      l: typeof c.l === 'number' ? c.l : undefined,
      s: typeof c.s === 'number' ? c.s : undefined,
    }));
  } catch { return []; }
}

router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.body.name || !String(req.body.name).trim()) {
      return res.status(400).send('名称必填，请返回补充');
    }
    const id = await saveItem(req, res, null);
    res.redirect(`/items/${id}`);
  } catch (err) { next(err); }
});

router.post('/:id', upload.single('image'), async (req, res, next) => {
  try {
    const item = await getItemWithCat(req.params.id);
    if (!item) return res.status(404).send('物品不存在');
    await saveItem(req, res, item);
    res.redirect(`/items/${item.id}`);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const item = await getItemWithCat(req.params.id);
    if (!item) return res.status(404).send('物品不存在');
    res.render('item-detail', {
      title: item.name, activeTab: 'items',
      item, cat: { name: item.category_name, icon: item.category_icon },
      swatches: FAMILY_SWATCHES, familyLabels: FAMILY_LABELS,
      seasonLabels: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' },
      occasionLabels: { work: '通勤', casual: '休闲', date: '约会', sport: '运动', formal: '正式', home: '居家' },
    });
  } catch (err) { next(err); }
});

router.post('/:id/archive', async (req, res, next) => {
  try {
    await db.execute({ sql: "UPDATE items SET status = 'archived' WHERE id = ?", args: [req.params.id] });
    res.redirect('/items');
  } catch (err) { next(err); }
});

router.post('/:id/restore', async (req, res, next) => {
  try {
    await db.execute({ sql: "UPDATE items SET status = 'active' WHERE id = ?", args: [req.params.id] });
    res.redirect(`/items/${req.params.id}`);
  } catch (err) { next(err); }
});

module.exports = router;
