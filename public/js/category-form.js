// 品类表单：动态字段编辑器（label/key/type/unit/options）→ 序列化进 hidden input
(function () {
  var TYPES = window.FIELD_TYPES || ['text', 'number', 'date', 'select', 'bool'];
  var TYPE_LABELS = { text: '短文本', number: '数字', date: '日期', select: '单选', bool: '是/否' };
  var editor = document.getElementById('fields-editor');
  var jsonInput = document.getElementById('fields-json');
  var addBtn = document.getElementById('add-field');
  var form = document.getElementById('category-form');
  if (!editor || !jsonInput || !addBtn) return;

  var rows = [];
  try { rows = JSON.parse(jsonInput.value || '[]') || []; } catch (e) { rows = []; }

  function serialize() {
    var out = rows.filter(function (r) { return r.label && r.key; });
    jsonInput.value = JSON.stringify(out);
  }

  function render() {
    editor.innerHTML = '';
    rows.forEach(function (r, idx) {
      var div = document.createElement('div');
      div.className = 'card field-editor-row';

      var l1 = document.createElement('div');
      l1.className = 'field-row';
      var fLabel = document.createElement('label');
      fLabel.className = 'field';
      fLabel.innerHTML = '<span class="field-label">显示名 *</span>';
      var labelInput = document.createElement('input');
      labelInput.className = 'input';
      labelInput.maxLength = 20;
      labelInput.placeholder = '如：开封日期';
      labelInput.value = r.label || '';
      labelInput.addEventListener('input', function () { r.label = labelInput.value; serialize(); });
      fLabel.appendChild(labelInput);

      var fKey = document.createElement('label');
      fKey.className = 'field';
      fKey.innerHTML = '<span class="field-label">字段名 key</span>';
      var keyInput = document.createElement('input');
      keyInput.className = 'input';
      keyInput.maxLength = 30;
      keyInput.placeholder = 'opened_at（存数据用）';
      keyInput.value = r.key || '';
      keyInput.addEventListener('input', function () {
        r.key = keyInput.value.replace(/[^a-zA-Z0-9_]/g, '');
        keyInput.value = r.key;
        serialize();
      });
      fKey.appendChild(keyInput);
      l1.appendChild(fLabel);
      l1.appendChild(fKey);

      var l2 = document.createElement('div');
      l2.className = 'field-row';
      var fType = document.createElement('label');
      fType.className = 'field';
      fType.innerHTML = '<span class="field-label">类型</span>';
      var typeSel = document.createElement('select');
      typeSel.className = 'input';
      TYPES.forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = TYPE_LABELS[t] || t;
        if (t === (r.type || 'text')) o.selected = true;
        typeSel.appendChild(o);
      });
      typeSel.addEventListener('change', function () {
        r.type = typeSel.value;
        optionsWrap.classList.toggle('hidden', r.type !== 'select');
        serialize();
      });
      fType.appendChild(typeSel);

      var fUnit = document.createElement('label');
      fUnit.className = 'field';
      fUnit.innerHTML = '<span class="field-label">单位</span>';
      var unitInput = document.createElement('input');
      unitInput.className = 'input';
      unitInput.maxLength = 8;
      unitInput.placeholder = '月 / % / ml';
      unitInput.value = r.unit || '';
      unitInput.addEventListener('input', function () { r.unit = unitInput.value; serialize(); });
      fUnit.appendChild(unitInput);
      l2.appendChild(fType);
      l2.appendChild(fUnit);

      var optionsWrap = document.createElement('label');
      optionsWrap.className = 'field' + (r.type === 'select' ? '' : ' hidden');
      optionsWrap.innerHTML = '<span class="field-label">选项（逗号分隔）</span>';
      var optionsInput = document.createElement('input');
      optionsInput.className = 'input';
      optionsInput.placeholder = '口红, 粉底, 眼影';
      optionsInput.value = (r.options || []).join(', ');
      optionsInput.addEventListener('input', function () {
        r.options = optionsInput.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
        serialize();
      });
      optionsWrap.appendChild(optionsInput);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'link link-danger';
      del.textContent = '移除该字段';
      del.addEventListener('click', function () {
        rows.splice(idx, 1);
        serialize();
        render();
      });

      div.appendChild(l1);
      div.appendChild(l2);
      div.appendChild(optionsWrap);
      div.appendChild(del);
      editor.appendChild(div);
    });
    serialize();
  }

  addBtn.addEventListener('click', function () {
    if (rows.length >= 12) return;
    rows.push({ key: '', label: '', type: 'text', unit: '', options: [] });
    render();
  });

  // 防呆：提交前检查字段 key 冲突
  form && form.addEventListener('submit', function (e) {
    var keys = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.label || !r.key) continue;
      if (keys[r.key]) {
        e.preventDefault();
        alert('字段名 key 重复：' + r.key);
        return;
      }
      keys[r.key] = true;
    }
  });

  render();
})();
