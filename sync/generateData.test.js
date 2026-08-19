// sync/generateData.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateData } = require('./generateData');

test('writes only the successfully mapped bearing products', async () => {
  const writes = [];
  const logs = [];
  const result = await generateData({
    token: 'fake',
    outPath: '/fake/data.json',
    fetchProductsFn: async () => [{ id: 'raw-1' }, { id: 'raw-2' }, { id: 'raw-3' }],
    mapProductFn: (raw) => (raw.id === 'raw-2' ? null : { id: raw.id, name: 'x', url: 'x', price: 1, d: 1, D: 2, B: 3 }),
    writeFileFn: async (path, content) => writes.push({ path, content }),
    logFn: (msg) => logs.push(msg),
  });

  assert.equal(result.included, 2);
  assert.equal(result.skipped, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, '/fake/data.json');
  const parsed = JSON.parse(writes[0].content);
  assert.deepEqual(parsed.map((p) => p.id), ['raw-1', 'raw-3']);
});

test('does not write anything if fetchProducts fails', async () => {
  const writes = [];
  await assert.rejects(() =>
    generateData({
      token: 'fake',
      outPath: '/fake/data.json',
      fetchProductsFn: async () => {
        throw new Error('API down');
      },
      mapProductFn: () => null,
      writeFileFn: async (path, content) => writes.push({ path, content }),
      logFn: () => {},
    }),
  );

  assert.equal(writes.length, 0);
});

test('throws if token is missing', async () => {
  await assert.rejects(
    () =>
      generateData({
        token: '',
        outPath: '/fake/data.json',
        fetchProductsFn: async () => [],
        mapProductFn: () => null,
        writeFileFn: async () => {},
        logFn: () => {},
      }),
    /token/i,
  );
});
