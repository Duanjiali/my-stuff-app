// 物品表单：图片压缩（800px/0.7）→ 塞回 file input → 主色提取 → 色卡人工修正
// 机器给初值，人拥有终值：所有识别结果都可手动修改
(function () {
  var F = window.COLOR_FAMILIES || { keys: [], labels: {}, swatches: {} };
  var input = document.getElementById('image-input');
  if (!input) return;
  var preview = document.getElementById('img-preview');
  var hint = document.getElementById('upload-hint');
  var status = document.getElementById('upload-status');
  var chipsEl = document.getElementById('color-chips');
  var colorsInput = document.getElementById('colors-input');
  var patternedCheck = document.getElementById('patterned-check');
  var catSelect = document.getElementById('cat-select');

  var currentColors = [];
  try { currentColors = JSON.parse(colorsInput.value || '[]') || []; } catch (e) { currentColors = []; }

  // ---- 色彩算法（与 src/scoring/color.js 同规则） ----
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: h, s: s, l: l };
  }

  function familyOf(h, s, l) {
    if (s < 0.12) return l < 0.18 ? 'black' : (l > 0.82 ? 'white' : 'gray');
    if (s < 0.30 && h >= 20 && h <= 55) return 'beige';
    if ((h >= 330 || h < 15) && l > 0.65 && s < 0.60) return 'pink';
    if (h >= 330 || h < 15) return 'red';
    if (h < 45) return 'orange';
    if (h < 70) return 'yellow';
    if (h < 160) return 'green';
    if (h < 200) return 'cyan';
    if (h < 250) {
      if (h >= 210 && h <= 230 && s >= 0.35 && s <= 0.65 && l >= 0.22 && l <= 0.50) return 'indigo';
      return 'blue';
    }
    if (h < 290) return 'purple';
    return 'magenta';
  }

  var CHROMA = { red: 0, orange: 30, yellow: 55, green: 115, cyan: 180, blue: 225, purple: 272, magenta: 317, pink: 350 };
  function hueOf(f) { return (f in CHROMA) ? CHROMA[f] : null; }
  function hueDist(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  function detectPatterned(colors) {
    if (!colors || colors.length < 2) return false;
    var a = colors[0], b = colors[1];
    if ((a.ratio || 0) <= 0.25 || (b.ratio || 0) <= 0.25) return false;
    var ha = hueOf(a.family), hb = hueOf(b.family);
    if (ha !== null && hb !== null) return hueDist(ha, hb) > 60;
    if ((ha === null) !== (hb === null)) return Math.abs(a.l - b.l) > 0.45;
    return false;
  }

  // ---- 色卡渲染与修正 ----
  function sync() { colorsInput.value = JSON.stringify(currentColors); }

  function renderChips() {
    chipsEl.innerHTML = '';
    currentColors.forEach(function (c) {
      var chip = document.createElement('span');
      chip.className = 'color-chip';
      var dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = F.swatches[c.family] || '#cbd5e1';
      var sel = document.createElement('select');
      sel.className = 'chip-select';
      F.keys.forEach(function (k) {
        var o = document.createElement('option');
        o.value = k;
        o.textContent = F.labels[k] || k;
        if (k === c.family) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        c.family = sel.value;
        dot.style.background = F.swatches[sel.value] || '#cbd5e1';
        sync();
        patternedCheck.checked = detectPatterned(currentColors);
      });
      chip.appendChild(dot);
      chip.appendChild(sel);
      chipsEl.appendChild(chip);
    });
    sync();
  }

  // ---- 压缩 + 主色提取 ----
  function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = url;
    });
  }

  // 中心 60% 区域采样，剔除过曝白与死黑背景噪点，量化到桶取 top3
  function extractColors(source) {
    var s = 64;
    var c = document.createElement('canvas');
    c.width = s; c.height = s;
    var ctx = c.getContext('2d');
    ctx.drawImage(source, 0, 0, s, s);
    var data;
    try { data = ctx.getImageData(0, 0, s, s).data; } catch (e) { return []; }
    var x0 = Math.floor(s * 0.2), x1 = Math.ceil(s * 0.8);
    var y0 = Math.floor(s * 0.2), y1 = Math.ceil(s * 0.8);
    var buckets = {};
    var total = 0;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var i = (y * s + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        var hsl = rgbToHsl(r, g, b);
        if (hsl.l > 0.97 && hsl.s < 0.05) continue;
        if (hsl.l < 0.03) continue;
        var key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
        if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0 };
        buckets[key].r += r; buckets[key].g += g; buckets[key].b += b; buckets[key].n++;
        total++;
      }
    }
    if (!total) return [];
    var tops = Object.keys(buckets)
      .map(function (k) { return buckets[k]; })
      .sort(function (a, b2) { return b2.n - a.n; })
      .slice(0, 3);
    return tops.map(function (bk) {
      var r = Math.round(bk.r / bk.n), g = Math.round(bk.g / bk.n), b2 = Math.round(bk.b / bk.n);
      var hsl = rgbToHsl(r, g, b2);
      return {
        family: familyOf(hsl.h, hsl.s, hsl.l),
        ratio: Math.round((bk.n / total) * 100) / 100,
        l: Math.round(hsl.l * 100) / 100,
        s: Math.round(hsl.s * 100) / 100,
      };
    });
  }

  input.addEventListener('change', function () {
    var file = input.files && input.files[0];
    if (!file) return;
    status.textContent = '处理中…';
    Promise.resolve()
      .then(function () {
        if (window.createImageBitmap) return createImageBitmap(file);
        return decodeViaImg(file);
      })
      .then(function (source) {
        var iw = source.width || source.naturalWidth;
        var ih = source.height || source.naturalHeight;
        var scale = Math.min(1, 800 / Math.max(iw, ih));
        var w = Math.max(1, Math.round(iw * scale));
        var h = Math.max(1, Math.round(ih * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(source, 0, 0, w, h);

        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) { resolve({ canvas: canvas, blob: blob }); }, 'image/jpeg', 0.7);
        });
      })
      .then(function (out) {
        if (!out.blob) throw new Error('compress failed');
        if (window.DataTransfer && typeof File === 'function') {
          var dt = new DataTransfer();
          dt.items.add(new File([out.blob], 'photo.jpg', { type: 'image/jpeg' }));
          input.files = dt.files; // 提交的是压缩后的图
        }
        preview.src = URL.createObjectURL(out.blob);
        preview.classList.remove('hidden');
        hint.classList.add('hidden');
        status.textContent = '已压缩到约 ' + Math.round(out.blob.size / 1024) + ' KB';

        currentColors = extractColors(out.canvas);
        renderChips();
        patternedCheck.checked = detectPatterned(currentColors);
      })
      .catch(function () {
        status.textContent = '图片处理失败，可先保存稍后补图';
      });
  });

  // 编辑模式：渲染已有色卡
  if (currentColors.length) renderChips();

  // 切换品类 → 重载表单字段（服务端渲染）
  if (catSelect) {
    catSelect.addEventListener('change', function () {
      location.href = (window.CAT_SELECT_BASE || '/items/new') + '?category=' + catSelect.value;
    });
  }
})();
