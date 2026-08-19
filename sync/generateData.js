// sync/generateData.js
async function generateData(options) {
  const { token, outPath, fetchProductsFn, mapProductFn, writeFileFn, logFn } = options;

  if (!token) throw new Error('Missing Shoper API token');

  const rawProducts = await fetchProductsFn(token);

  const mapped = [];
  let skipped = 0;
  for (const raw of rawProducts) {
    const record = mapProductFn(raw);
    if (record) mapped.push(record);
    else skipped += 1;
  }

  if (mapped.length === 0) {
    throw new Error(`Refusing to write: 0 bearings mapped from ${rawProducts.length} raw products`);
  }

  await writeFileFn(outPath, JSON.stringify(mapped));
  logFn(`Zapisano ${mapped.length} łożysk, pominięto ${skipped} produktów.`);

  return { included: mapped.length, skipped };
}

module.exports = { generateData };
