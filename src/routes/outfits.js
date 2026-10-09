const express = require('express');
const { db } = require('../db');
const { parseItem, parseOutfit, httpError } = require('../helpers');
const engine = require('../scoring/engine');
const { SEASONS, OCCASIONS } = require('../constants');

const router = express.Router();

async function listItemMap() {
  const rs = await db.execute(`
    SELECT i.*, c.name AS category_name, c.icon AS category_icon
    FROM items i JOIN categories c ON c.id = i.category_id
    WHERE i.status = 'active' ORDER BY i.created_at DESC`);
  const map = new Map();
  for (const row of rs.rows) map.set(Number(row.id), parseItem(row));
  return map;
}

async function listOutfitItems() {
  // 只允许勾选"可搭配"行为品类的物品
  const rs = await db.execute(`
    SELECT i.*, c.name AS category_name, c.icon AS category_icon
    FROM items i JOIN categories c ON c.id = i.category_id
    WHERE i.status = 'active' AND c.behaviors LIKE '%"outfit"%'
    ORDER BY c.sort, i.created_at DESC`);
  return rs.rows.map(parseItem);
}

function parseItemIds(body) {
  let raw = body.item_ids || body['item_ids[]'] || [];
  if (!Array.isArray(raw)) raw = String(raw).split(',');
  return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

async function saveOutfit(req, res, outfit) {
  const ids = parseItemIds(req.body);
  if (!ids.length) throw httpError(400, '至少勾选一件衣物');
  const map = await listItemMap();
  const items = ids.map((id) => map.get(id)).filter(Boolean);
  if (!items.length) throw httpError(400, '所选衣物不存在');

  const context = {
    season: req.body.season || null,
    occasion: req.body.occasion || null,
  };
  const result = engine.score(items, context);
  const name = String(req.body.name || '').trim().slice(0, 30) || '未命名搭配';
  const seasons = SEASONS.filter((s) => req.body[`season_${s}`]);

  if (outfit) {
    await db.execute({
      sql: 'UPDATE outfits SET name=?, item_ids=?, occasion=?, seasons=?, score=?, reasons=? WHERE id=?',
      args: [name, JSON.stringify(ids), context.occasion || '', JSON.stringify(seasons), result.score, JSON.stringify(result.reasons), outfit.id],
    });
    return outfit.id;
  }
  const rs = await db.execute({
    sql: `INSERT INTO outfits (name, item_ids, occasion, seasons, score, reasons, is_favorite, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    args: [name, JSON.stringify(ids), context.occasion || '', JSON.stringify(seasons), result.score, JSON.stringify(result.reasons), Date.now()],
  });
  return Number(rs.lastInsertRowid);
}

async function renderForm(req, res, outfit) {
  const items = await listOutfitItems();
  res.render('outfit-form', {
    title: outfit ? '编辑搭配' : '创建搭配', activeTab: 'outfits',
    mode: outfit ? 'edit' : 'new',
    outfit, items,
    allSeasons: SEASONS, allOccasions: OCCASIONS,
  });
}

router.get('/', async (req, res, next) => {
  try {
    const [outfits, itemMap] = await Promise.all([
      (async () => (await db.execute('SELECT * FROM outfits ORDER BY created_at DESC')).rows.map(parseOutfit))(),
      listItemMap(),
    ]);
    res.render('outfits', { title: '搭配', activeTab: 'outfits', outfits, itemMap });
  } catch (err) { next(err); }
});

router.get('/new', async (req, res, next) => {
  try { await renderForm(req, res, null); } catch (err) { next(err); }
});

router.get('/:id/edit', async (req, res, next) => {
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM outfits WHERE id = ?', args: [req.params.id] });
    const outfit = parseOutfit(rs.rows[0]);
    if (!outfit) return res.status(404).send('搭配不存在');
    await renderForm(req, res, outfit);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try { const id = await saveOutfit(req, res, null); res.redirect(`/outfits/${id}`); } catch (err) { next(err); }
});

router.post('/:id', async (req, res, next) => {
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM outfits WHERE id = ?', args: [req.params.id] });
    const outfit = parseOutfit(rs.rows[0]);
    if (!outfit) return res.status(404).send('搭配不存在');
    await saveOutfit(req, res, outfit);
    res.redirect(`/outfits/${outfit.id}`);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const rs = await db.execute({ sql: 'SELECT * FROM outfits WHERE id = ?', args: [req.params.id] });
    const outfit = parseOutfit(rs.rows[0]);
    if (!outfit) return res.status(404).send('搭配不存在');
    const itemMap = await listItemMap();
    const members = outfit.itemIds.map((id) => itemMap.get(id)).filter(Boolean);
    res.render('outfit-detail', {
      title: outfit.name, activeTab: 'outfits',
      outfit, members,
      occasionLabels: { work: '通勤', casual: '休闲', date: '约会', sport: '运动', formal: '正式', home: '居家' },
      seasonLabels: { spring: '春', summer: '夏', autumn: '秋', winter: '冬' },
    });
  } catch (err) { next(err); }
});

// 记一次穿着：成员衣物 wear_count+1，供打分引擎的"吃灰规则"使用
router.post('/:id/wear', async (req, res, next) => {
  try {
    const rs = await db.execute({ sql: 'SELECT item_ids FROM outfits WHERE id = ?', args: [req.params.id] });
    if (!rs.rows.length) return res.status(404).send('搭配不存在');
    const ids = JSON.parse(rs.rows[0].item_ids || '[]');
    for (const id of ids) {
      await db.execute({
        sql: 'UPDATE items SET wear_count = wear_count + 1, last_worn_at = ? WHERE id = ?',
        args: [Date.now(), id],
      });
    }
    res.redirect(`/outfits/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:id/favorite', async (req, res, next) => {
  try {
    await db.execute({ sql: 'UPDATE outfits SET is_favorite = 1 - is_favorite WHERE id = ?', args: [req.params.id] });
    res.redirect(`/outfits/${req.params.id}`);
  } catch (err) { next(err); }
});

router.post('/:id/delete', async (req, res, next) => {
  try {
    await db.execute({ sql: 'DELETE FROM outfits WHERE id = ?', args: [req.params.id] });
    res.redirect('/outfits');
  } catch (err) { next(err); }
});

module.exports = router;
