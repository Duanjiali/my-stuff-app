// 打分引擎：规则制、可解释，权重写死（v1 不做配置）
// 输出：{ score: 0-100, hardFail: bool, reasons: [{level: good|bad|info, text}] }

const { familyLabel, isNeutral, hueOf, hueDist } = require('./color');
const { seasonLabel, occasionLabel } = require('../constants');

const BASE = 60;

const DAY = 24 * 3600 * 1000;

function dominantColors(item) {
  // 有效色系：占比 >= 15% 的主色
  return (item.colors || []).filter((c) => (c.ratio || 0) >= 0.15);
}

function ruleColorCount(reasons, items) {
  const fams = new Set();
  for (const it of items) for (const c of dominantColors(it)) fams.add(c.family);
  const n = fams.size;
  if (n >= 1 && n <= 3) {
    reasons.push({ level: 'good', text: `全身 ${n} 个色系，克制不乱 +10` });
    return 10;
  }
  if (n === 4) {
    reasons.push({ level: 'bad', text: '4 个色系偏多，容易显乱 -5' });
    return -5;
  }
  reasons.push({ level: 'bad', text: `${n} 个色系太多，色彩没有重点 -15` });
  return -15;
}

function ruleNeutralAnchor(reasons, items) {
  const fams = new Set();
  for (const it of items) for (const c of dominantColors(it)) fams.add(c.family);
  const has = [...fams].some(isNeutral);
  if (has) {
    reasons.push({ level: 'good', text: '有中性色压场，整体稳 +5' });
    return 5;
  }
  reasons.push({ level: 'bad', text: '全身缺少黑白灰驼等中性色，建议加一件 -8' });
  return -8;
}

// 色相关系：邻近/类似加分，尴尬区扣分，互补看饱和度
function ruleHuePairs(reasons, items) {
  const chromas = [];
  for (const it of items) {
    for (const c of dominantColors(it)) {
      if (!isNeutral(c.family) && hueOf(c.family) !== null) chromas.push(c);
    }
  }
  // 去重同色系
  const uniq = [];
  const seen = new Set();
  for (const c of chromas) {
    if (!seen.has(c.family)) { seen.add(c.family); uniq.push(c); }
  }
  if (uniq.length < 2 || uniq.length > 3) return 0; // 色系过多时由颜色数规则惩罚

  let delta = 0;
  const pairs = [];
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      pairs.push([uniq[i], uniq[j]]);
    }
  }
  for (const [a, b] of pairs) {
    const d = hueDist(hueOf(a.family), hueOf(b.family));
    const an = familyLabel(a.family), bn = familyLabel(b.family);
    if (d <= 30) {
      delta += 8;
      reasons.push({ level: 'good', text: `${an}与${bn}是邻近色，和谐 +8` });
    } else if (d <= 60) {
      delta += 4;
      reasons.push({ level: 'good', text: `${an}与${bn}是类似色，安全 +4` });
    } else if (d <= 120) {
      delta -= 10;
      reasons.push({ level: 'bad', text: `${an}与${bn}处在色相尴尬区，建议一件换中性色 -10` });
    } else if (Math.min(a.s ?? 0.5, b.s ?? 0.5) < 0.55) {
      delta += 12;
      reasons.push({ level: 'good', text: `${an}与${bn}互补撞色，且有一件低饱和压得住，进阶 +12` });
    } else {
      delta -= 8;
      reasons.push({ level: 'bad', text: `${an}与${bn}双高饱和对撞，太刺眼 -8` });
    }
  }
  return delta;
}

function ruleLightness(reasons, items) {
  if (items.length < 3) return 0;
  const ls = items.map((it) => (it.colors && it.colors[0] ? it.colors[0].l : null)).filter((v) => v !== null && v !== undefined);
  if (ls.length < items.length) return 0;
  if (Math.max(...ls) - Math.min(...ls) < 0.30) {
    reasons.push({ level: 'bad', text: '全身明度接近，缺乏层次感 -5' });
    return -5;
  }
  return 0;
}

function rulePatterned(reasons, items) {
  const n = items.filter((it) => it.isPatterned).length;
  if (n >= 2) {
    reasons.push({ level: 'bad', text: `${n} 件花色单品互相打架 -20` });
    return -20;
  }
  if (n === 1) {
    reasons.push({ level: 'good', text: '一件花色做视觉焦点，恰到好处 +3' });
    return 3;
  }
  return 0;
}

// 硬规则：季节/场合不符只标记不直接归零，理由足够醒目
function ruleContext(reasons, items, context) {
  let delta = 0;
  let hardFail = false;
  if (context.season) {
    for (const it of items) {
      if ((it.seasons || []).length > 0 && !it.seasons.includes(context.season)) {
        hardFail = true;
        reasons.push({ level: 'info', text: `「${it.name}」未标记适合${seasonLabel(context.season)}季` });
      }
    }
  }
  if (context.occasion) {
    for (const it of items) {
      if ((it.occasions || []).length > 0 && !it.occasions.includes(context.occasion)) {
        hardFail = true;
        reasons.push({ level: 'info', text: `「${it.name}」未标记适合${occasionLabel(context.occasion)}场合` });
      }
    }
  }
  const forms = items.map((it) => it.formality).filter((v) => v !== null && v !== undefined);
  if (forms.length >= 2 && Math.max(...forms) - Math.min(...forms) >= 3) {
    delta -= 8;
    reasons.push({ level: 'bad', text: '正式度跨度太大（近似西装配拖鞋）-8' });
  }
  return { delta, hardFail };
}

function ruleWearBalance(reasons, items) {
  const now = Date.now();
  const dormant = items.find((it) => !it.wearCount || (it.lastWornAt && now - it.lastWornAt > 90 * DAY));
  if (dormant) {
    reasons.push({ level: 'good', text: `带上吃灰的「${dormant.name}」，物尽其用 +10` });
    return 10;
  }
  return 0;
}

/**
 * @param {Array} items 解析后的物品数组
 * @param {Object} context { season, occasion } 搭配本身的属性
 */
function score(items, context = {}) {
  const reasons = [];
  if (!items.length) return { score: 0, hardFail: false, reasons: [{ level: 'info', text: '还没有选择衣物' }] };

  let total = BASE;
  total += ruleColorCount(reasons, items);
  total += ruleNeutralAnchor(reasons, items);
  total += ruleHuePairs(reasons, items);
  total += ruleLightness(reasons, items);
  total += rulePatterned(reasons, items);
  const ctx = ruleContext(reasons, items, context);
  total += ctx.delta;
  total += ruleWearBalance(reasons, items);

  const final = Math.max(0, Math.min(100, Math.round(total)));
  if (ctx.hardFail) {
    reasons.unshift({ level: 'info', text: '注意：存在与季节/场合可能不符的单品，建议核对' });
  }
  return { score: final, hardFail: ctx.hardFail, reasons };
}

module.exports = { score };
