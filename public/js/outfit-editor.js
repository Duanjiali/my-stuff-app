// 搭配编辑器：勾选衣物 → fetch /api/score 局部刷新分数与理由
(function () {
  var checks = Array.prototype.slice.call(document.querySelectorAll('.pick-check'));
  if (!checks.length) return;
  // 勾选顺序（同部位后勾的覆盖显示）；初始为已勾选项（编辑模式）
  var pickedOrder = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  var scoreNum = document.getElementById('score-num');
  var note = document.getElementById('score-note');
  var reasonsEl = document.getElementById('reasons');
  var strip = document.getElementById('picked-strip');
  var countEl = document.getElementById('picked-count');
  var occasionSel = document.getElementById('occasion-select');
  var seasonChecks = Array.prototype.slice.call(document.querySelectorAll('.season-check'));
  var timer = null;

  var SWATCHES = {
    black: '#1c1c1e', white: '#f4f4f5', gray: '#9ca3af', beige: '#d6c4a8', indigo: '#3f5277',
    red: '#d94f4f', orange: '#e88c3a', yellow: '#e6c74a', green: '#5c9e5c', cyan: '#4aa8a8',
    blue: '#4a72b8', purple: '#8a6bb8', magenta: '#c04a86', pink: '#e8a0b4',
  };

  // 列表里的静态色点上色
  Array.prototype.forEach.call(document.querySelectorAll('.dot-static'), function (d) {
    d.style.background = SWATCHES[d.getAttribute('data-family')] || '#cbd5e1';
  });

  function pickedIds() {
    return checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  }

  function updateStrip() {
    strip.innerHTML = '';
    var n = 0;
    checks.forEach(function (c) {
      if (!c.checked) return;
      n++;
      var item = c.closest('.pick-item');
      var img = item ? item.querySelector('.pick-img') : null;
      var node;
      if (img && img.tagName === 'IMG') {
        node = document.createElement('img');
        node.src = img.src;
        node.className = 'strip-img';
        node.alt = '';
      } else {
        node = document.createElement('span');
        node.className = 'strip-img strip-placeholder';
        node.textContent = img ? img.textContent : '';
      }
      strip.appendChild(node);
    });
    countEl.textContent = n;
  }

  function findCheck(id) {
    for (var i = 0; i < checks.length; i++) if (checks[i].value === id) return checks[i];
    return null;
  }

  // 人形预览：按勾选顺序取出物品的部位/图片信息交给 doll.js 渲染
  function updateDoll() {
    if (!window.Doll) return;
    var items = [];
    pickedOrder.forEach(function (id) {
      var c = findCheck(id);
      if (!c) return;
      var el = c.closest('.pick-item');
      if (!el) return;
      items.push({
        id: Number(id),
        name: el.getAttribute('data-name') || '',
        slot: el.getAttribute('data-slot') || '',
        image: el.getAttribute('data-image') || '',
        icon: el.getAttribute('data-icon') || '',
      });
    });
    window.Doll.render(items);
  }

  function requestScore() {
    var ids = pickedIds();
    if (!ids.length) {
      scoreNum.textContent = '--';
      scoreNum.className = 'score-big';
      note.textContent = '勾选衣物后实时打分';
      reasonsEl.innerHTML = '';
      return;
    }
    var season = null;
    seasonChecks.forEach(function (sc) {
      if (sc.checked && !season) season = sc.name.replace('season_', '');
    });
    note.textContent = '打分中…';
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: ids, season: season, occasion: occasionSel ? occasionSel.value : null }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        scoreNum.textContent = d.score;
        scoreNum.className = 'score-big ' + (d.score >= 80 ? 'score-good' : d.score >= 60 ? 'score-mid' : 'score-bad');
        note.textContent = d.hardFail ? '可能不适合该季节/场合' : '综合评分';
        reasonsEl.innerHTML = '';
        (d.reasons || []).forEach(function (r) {
          var li = document.createElement('li');
          li.className = 'reason reason-' + r.level;
          li.textContent = r.text;
          reasonsEl.appendChild(li);
        });
      })
      .catch(function () { note.textContent = '打分失败，稍后再试'; });
  }

  checks.forEach(function (c) {
    c.addEventListener('change', function () {
      if (c.checked) {
        if (pickedOrder.indexOf(c.value) < 0) pickedOrder.push(c.value);
      } else {
        pickedOrder = pickedOrder.filter(function (v) { return v !== c.value; });
      }
      updateStrip();
      updateDoll();
      clearTimeout(timer);
      timer = setTimeout(requestScore, 150);
    });
  });
  if (occasionSel) occasionSel.addEventListener('change', requestScore);
  seasonChecks.forEach(function (sc) { sc.addEventListener('change', requestScore); });

  updateStrip();
  updateDoll();
  requestScore(); // 编辑模式进入时按已选成员初始打分
})();
