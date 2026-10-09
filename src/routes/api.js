const express = require('express');
const { db } = require('../db');
const { parseItem } = require('../helpers');
const engine = require('../scoring/engine');
const { requireAuthApi } = require('../middleware/auth');

const router = express.Router();

// 搭配编辑器局部刷新打分：POST /api/score { itemIds: [], season, occasion }
router.post('/score', requireAuthApi, async (req, res, next) => {
  try {
    const ids = (req.body.itemIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 12);
    if (!ids.length) return res.json({ score: null, hardFail: false, reasons: [{ level: 'info', text: '勾选衣物后实时打分' }] });
    const placeholders = ids.map(() => '?').join(',');
    const rs = await db.execute({
      sql: `SELECT i.*, c.name AS category_name FROM items i JOIN categories c ON c.id = i.category_id
            WHERE i.id IN (${placeholders}) AND i.status = 'active'`,
      args: ids,
    });
    const items = rs.rows.map(parseItem);
    const context = { season: req.body.season || null, occasion: req.body.occasion || null };
    res.json(engine.score(items, context));
  } catch (err) { next(err); }
});

module.exports = router;
