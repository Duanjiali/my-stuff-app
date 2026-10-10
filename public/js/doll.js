// 人形穿搭预览：把带"穿着部位"(slot) 的衣物按叠放规则渲染到人体轮廓上
// 规则：每部位保留最后一件（数组序）；连衣裙存在时不显示上衣/下装
(function () {
  function place(items) {
    var bySlot = {};
    var skipped = 0;
    (items || []).forEach(function (it) {
      if (!it) return;
      if (it.slot) bySlot[it.slot] = it; // 后者覆盖前者
      else skipped++;
    });
    var placed = [];
    if (bySlot.dress) {
      placed.push(bySlot.dress);
    } else {
      if (bySlot.top) placed.push(bySlot.top);
      if (bySlot.bottom) placed.push(bySlot.bottom);
    }
    if (bySlot.outer) placed.push(bySlot.outer);
    if (bySlot.shoes) placed.push(bySlot.shoes);
    var notes = [];
    if (bySlot.dress && (bySlot.top || bySlot.bottom)) notes.push('连衣裙已遮盖上衣/下装');
    if (skipped) notes.push(skipped + ' 件未设部位，不显示在预览中');
    return { placed: placed, notes: notes };
  }

  function imageOf(it) {
    if (it.image) return it.image;
    if (it.images && it.images.length) return it.images[0];
    return '';
  }

  function iconOf(it) {
    if (it.icon) return it.icon;
    if (it.category_icon) return it.category_icon;
    return '?';
  }

  function render(items) {
    var mount = document.getElementById('doll-items');
    var hint = document.getElementById('doll-hint');
    if (!mount) return;
    var r = place(items);
    mount.innerHTML = '';
    r.placed.forEach(function (it) {
      var box = document.createElement('div');
      box.className = 'doll-item doll-item--' + it.slot;
      var url = imageOf(it);
      if (url) {
        var img = document.createElement('img');
        img.src = url;
        img.alt = it.name || '';
        box.appendChild(img);
      } else {
        var ph = document.createElement('span');
        ph.className = 'doll-ph';
        ph.textContent = iconOf(it);
        box.appendChild(ph);
      }
      mount.appendChild(box);
    });
    if (hint) hint.textContent = r.notes.join(' · ');
  }

  window.Doll = { render: render };
  if (window.__DOLL_INITIAL) render(window.__DOLL_INITIAL);
})();
