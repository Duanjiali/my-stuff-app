// 全局常量：季节/场合枚举、行为模块定义

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_LABELS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

const OCCASIONS = ['work', 'casual', 'date', 'sport', 'formal', 'home'];
const OCCASION_LABELS = {
  work: '通勤',
  casual: '休闲',
  date: '约会',
  sport: '运动',
  formal: '正式',
  home: '居家',
};

// 行为模块：品类勾选后自动获得对应深度功能
const BEHAVIORS = ['outfit', 'consumable', 'asset'];
const BEHAVIOR_LABELS = {
  outfit: '可搭配（进搭配组合、参与打分）',
  consumable: '消耗品（效期/余量/补货）',
  asset: '资产（保修/存放位置）',
};

// 字段类型（v1 封顶 5 种）
const FIELD_TYPES = ['text', 'number', 'date', 'select', 'bool'];

// 穿着部位槽位：仅"可搭配"品类使用，决定人形预览中的叠放位置
const SLOTS = ['top', 'bottom', 'dress', 'outer', 'shoes'];
const SLOT_LABELS = { top: '上衣', bottom: '下装', dress: '连衣裙', outer: '外套', shoes: '鞋子' };

function seasonLabel(s) { return SEASON_LABELS[s] || s; }
function occasionLabel(o) { return OCCASION_LABELS[o] || o; }

module.exports = {
  SEASONS, SEASON_LABELS, OCCASIONS, OCCASION_LABELS,
  BEHAVIORS, BEHAVIOR_LABELS, FIELD_TYPES,
  SLOTS, SLOT_LABELS,
  seasonLabel, occasionLabel,
};
