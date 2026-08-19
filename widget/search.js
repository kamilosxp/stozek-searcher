// widget/search.js
function matchProducts(products, criteria) {
  const tolerance = criteria.tolerance ?? 0;
  const dims = ['d', 'D', 'B'].filter((key) => criteria[key] !== undefined && criteria[key] !== null && criteria[key] !== '');

  if (dims.length === 0) {
    return { error: 'NO_CRITERIA', results: [] };
  }

  const results = [];
  for (const product of products) {
    let matches = true;
    let deviation = 0;
    for (const key of dims) {
      const diff = Math.abs(product[key] - criteria[key]);
      if (diff > tolerance) {
        matches = false;
        break;
      }
      deviation += diff;
    }
    if (matches) results.push({ ...product, deviation });
  }

  results.sort((a, b) => a.deviation - b.deviation);
  return { error: null, results };
}

if (typeof module !== 'undefined') module.exports = { matchProducts };
