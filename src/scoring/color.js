// 色彩体系：RGB→HSL→色系映射 + 花色判定
// 设计哲学：机器给初值，人拥有终值（前端提取的色卡必须可人工修改）

// 中性色家族（穿搭语义上的百搭色）
const NEUTRALS = new Set(['black', 'white', 'gray', 'beige', 'indigo']);

// 彩色色系的代表色相（度）
const CHROMA_HUES = {
  red: 0, orange: 30, yellow: 55, green: 115,
  cyan: 180, blue: 225, purple: 272, magenta: 317, pink: 350,
};

const FAMILY_LABELS = {
  black: '黑', white: '白', gray: '灰', beige: '米/驼', indigo: '靛蓝',
  red: '红', orange: '橙', yellow: '黄', green: '绿', cyan: '青',
  blue: '蓝', purple: '紫', magenta: '玫红', pink: '粉',
};

// 各色系代表色（UI 色点用）
const FAMILY_SWATCHES = {
  black: '#1c1c1e', white: '#f4f4f5', gray: '#9ca3af', beige: '#d6c4a8', indigo: '#3f5277',
  red: '#d94f4f', orange: '#e88c3a', yellow: '#e6c74a', green: '#5c9e5c', cyan: '#4aa8a8',
  blue: '#4a72b8', purple: '#8a6bb8', magenta: '#c04a86', pink: '#e8a0b4',
};

/** rgb(0-255) → { h: 0-360, s: 0-1, l: 0-1 } */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return { h, s, l };
}

/** HSL → 色系 key（判定顺序：中性 → 暖中性 → 粉 → 色相分段） */
function familyOf(h, s, l) {
  if (s < 0.12) {
    if (l < 0.18) return 'black';
    if (l > 0.82) return 'white';
    return 'gray';
  }
  // 暖中性：米/驼（低饱和 + 橙黄区色相）
  if (s < 0.30 && h >= 20 && h <= 55) return 'beige';
  // 粉：高明度低饱和红，穿搭语义与红完全不同
  if ((h >= 330 || h < 15) && l > 0.65 && s < 0.60) return 'pink';
  if (h >= 330 || h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 200) return 'cyan';
  if (h < 250) {
    // 靛蓝特判：近似牛仔蓝，视作准中性百搭色
    if (h >= 210 && h <= 230 && s >= 0.35 && s <= 0.65 && l >= 0.22 && l <= 0.50) return 'indigo';
    return 'blue';
  }
  if (h < 290) return 'purple';
  return 'magenta';
}

function familyLabel(key) { return FAMILY_LABELS[key] || key; }
function isNeutral(key) { return NEUTRALS.has(key); }
function hueOf(key) { return (key in CHROMA_HUES) ? CHROMA_HUES[key] : null; }

/** 环形色相距离 0-180 */
function hueDist(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * 花色判定：前两主色占比都 >25% 且（色相距离 >60° 或 一彩一中性且对比强烈）
 * colors: [{family, ratio, l, s}]
 */
function detectPatterned(colors) {
  if (!Array.isArray(colors) || colors.length < 2) return false;
  const [a, b] = colors;
  if ((a.ratio || 0) <= 0.25 || (b.ratio || 0) <= 0.25) return false;
  const ha = hueOf(a.family), hb = hueOf(b.family);
  if (ha !== null && hb !== null) return hueDist(ha, hb) > 60;
  // 一彩一中性：明度差大也视为花色（如黑白条纹）
  if ((ha === null) !== (hb === null)) return Math.abs(a.l - b.l) > 0.45;
  return false;
}

module.exports = {
  NEUTRALS, CHROMA_HUES, FAMILY_LABELS, FAMILY_SWATCHES,
  rgbToHsl, familyOf, familyLabel, isNeutral, hueOf, hueDist, detectPatterned,
};
