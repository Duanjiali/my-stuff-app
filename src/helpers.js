// 行解析：把数据库行转成业务对象（JSON 列解析 + 命名统一）

function parseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function parseCategory(row) {
  if (!row) return null;
  return {
    ...row,
    behaviors: parseJson(row.behaviors, []),
    fieldSchema: parseJson(row.field_schema, []),
  };
}

function parseItem(row) {
  if (!row) return null;
  return {
    ...row,
    images: parseJson(row.images, []),
    colors: parseJson(row.colors, []),
    seasons: parseJson(row.seasons, []),
    occasions: parseJson(row.occasions, []),
    ext: parseJson(row.ext, {}),
    isPatterned: !!row.is_patterned,
  };
}

function parseOutfit(row) {
  if (!row) return null;
  return {
    ...row,
    itemIds: parseJson(row.item_ids, []),
    seasons: parseJson(row.seasons, []),
    reasons: parseJson(row.reasons, []),
    isFavorite: !!row.is_favorite,
  };
}

/** 按品类 field_schema 把表单字段转成 ext 对象（类型归一，数据永不丢） */
function collectExt(schema, body) {
  const ext = {};
  for (const f of schema || []) {
    const raw = body[`ext_${f.key}`];
    if (f.type === 'bool') { ext[f.key] = raw ? 1 : 0; continue; }
    if (raw === undefined || raw === '') continue;
    if (f.type === 'number') {
      const n = parseFloat(raw);
      if (!Number.isNaN(n)) ext[f.key] = n;
    } else {
      ext[f.key] = String(raw);
    }
  }
  return ext;
}

/** 业务错误：携带 HTTP 状态码，由全局错误处理返回 */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = { parseJson, parseCategory, parseItem, parseOutfit, collectExt, httpError };
