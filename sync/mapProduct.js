// sync/mapProduct.js
const BEARING_CATEGORY_IDS = new Set(['138', '139', '140', '141', '142', '143', '144']);

function toPositiveNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function mapProduct(raw) {
  if (!raw || !BEARING_CATEGORY_IDS.has(String(raw.category_id))) return null;

  const group = raw.attributes && raw.attributes['3'];
  if (!group) return null;

  const d = toPositiveNumber(group['20']);
  const D = toPositiveNumber(group['21']);
  const B = toPositiveNumber(group['16']);
  if (d === null || D === null || B === null) return null;

  const translation = raw.translations && raw.translations.pl_PL;
  if (!translation || !translation.name || !translation.permalink) return null;

  const priceRaw = raw.stock && raw.stock.price;
  const price = toPositiveNumber(priceRaw);
  if (price === null) return null;

  return {
    id: String(raw.product_id),
    name: translation.name,
    url: translation.permalink,
    price,
    d,
    D,
    B,
  };
}

module.exports = { mapProduct, BEARING_CATEGORY_IDS };
