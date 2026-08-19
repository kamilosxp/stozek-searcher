// sync/run.js
const fs = require('node:fs/promises');
const path = require('node:path');
const { fetchProducts } = require('./fetchProducts');
const { mapProduct } = require('./mapProduct');
const { generateData } = require('./generateData');

async function main() {
  const token = process.env.SHOPER_API_TOKEN;
  const outPath = path.join(__dirname, '..', 'docs', 'data.json');

  await generateData({
    token,
    outPath,
    fetchProductsFn: fetchProducts,
    mapProductFn: mapProduct,
    writeFileFn: (p, content) => fs.writeFile(p, content, 'utf8'),
    logFn: (msg) => console.log(msg),
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
