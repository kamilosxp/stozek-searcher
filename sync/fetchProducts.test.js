// sync/fetchProducts.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchProducts } = require('./fetchProducts');

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('fetches all pages and flattens the product list', async () => {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('page=1')) return jsonResponse({ count: '3', pages: 2, page: 1, list: [{ product_id: '1' }, { product_id: '2' }] });
    if (url.includes('page=2')) return jsonResponse({ count: '3', pages: 2, page: 2, list: [{ product_id: '3' }] });
    throw new Error(`unexpected url: ${url}`);
  };

  const result = await fetchProducts('fake-token', { fetchFn, delayMs: 0 });

  assert.deepEqual(result.map((p) => p.product_id), ['1', '2', '3']);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('limit=50'));
});

test('sends the bearer token on every request', async () => {
  const headersSeen = [];
  const fetchFn = async (url, opts) => {
    headersSeen.push(opts.headers.Authorization);
    return jsonResponse({ count: '0', pages: 1, page: 1, list: [] });
  };

  await fetchProducts('my-secret-token', { fetchFn, delayMs: 0 });

  assert.equal(headersSeen[0], 'Bearer my-secret-token');
});

test('retries a failed page and succeeds on a later attempt', async () => {
  let attempts = 0;
  const fetchFn = async () => {
    attempts += 1;
    if (attempts < 3) return jsonResponse({}, false, 500);
    return jsonResponse({ count: '0', pages: 1, page: 1, list: [] });
  };

  const result = await fetchProducts('token', { fetchFn, delayMs: 0, maxRetries: 3 });

  assert.deepEqual(result, []);
  assert.equal(attempts, 3);
});

test('throws after exhausting retries on a page', async () => {
  const fetchFn = async () => jsonResponse({}, false, 500);

  await assert.rejects(
    () => fetchProducts('token', { fetchFn, delayMs: 0, maxRetries: 2 }),
    /failed after 2 attempts/,
  );
});
