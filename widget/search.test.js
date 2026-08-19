// widget/search.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { matchProducts } = require('./search');

const products = [
  { id: '1', name: 'A', url: 'u1', price: 10, d: 60, D: 95, B: 23 },
  { id: '2', name: 'B', url: 'u2', price: 20, d: 62, D: 95, B: 23 },
  { id: '3', name: 'C', url: 'u3', price: 30, d: 25, D: 52, B: 15 },
];

test('returns NO_CRITERIA error when no dimension is provided', () => {
  const result = matchProducts(products, { tolerance: 0.5 });
  assert.equal(result.error, 'NO_CRITERIA');
  assert.deepEqual(result.results, []);
});

test('matches within tolerance on a single dimension', () => {
  const result = matchProducts(products, { d: 61, tolerance: 1 });
  assert.equal(result.error, null);
  assert.deepEqual(result.results.map((r) => r.id), ['1', '2']);
});

test('exact match at tolerance boundary is included', () => {
  const result = matchProducts(products, { d: 61, tolerance: 1 });
  assert.ok(result.results.some((r) => r.id === '1'));
});

test('value just outside tolerance is excluded', () => {
  const result = matchProducts(products, { d: 61, tolerance: 0.5 });
  assert.deepEqual(result.results.map((r) => r.id), []);
});

test('combines multiple dimensions, all must match', () => {
  const result = matchProducts(products, { d: 60, D: 95, tolerance: 0.5 });
  assert.deepEqual(result.results.map((r) => r.id), ['1']);
});

test('sorts results by ascending total deviation', () => {
  // d=60.5 gives product 1 (d=60) a deviation of 0.5 and product 2 (d=62) a
  // deviation of 1.5 -- genuinely different, so this actually exercises the
  // sort (unlike a tied-deviation case, which would pass even without it).
  const result = matchProducts(products, { d: 60.5, tolerance: 2 });
  assert.deepEqual(result.results.map((r) => r.id), ['1', '2']);
  assert.equal(result.results[0].deviation, 0.5);
  assert.equal(result.results[1].deviation, 1.5);
  assert.ok(result.results[0].deviation < result.results[1].deviation);
});

test('sums deviation across two filtered dimensions when sorting', () => {
  // product 1: |60.2-60| + |94-95| = 0.2 + 1 = 1.2
  // product 2: |60.2-62| + |94-95| = 1.8 + 1 = 2.8
  const result = matchProducts(products, { d: 60.2, D: 94, tolerance: 3 });
  assert.deepEqual(result.results.map((r) => r.id), ['1', '2']);
  assert.ok(Math.abs(result.results[0].deviation - 1.2) < 1e-9);
  assert.ok(Math.abs(result.results[1].deviation - 2.8) < 1e-9);
  assert.ok(result.results[0].deviation < result.results[1].deviation);
});

test('missing tolerance defaults to exact match (0)', () => {
  const result = matchProducts(products, { d: 60 });
  assert.deepEqual(result.results.map((r) => r.id), ['1']);
});

test('returns empty results with no error when nothing matches', () => {
  const result = matchProducts(products, { d: 999, tolerance: 1 });
  assert.equal(result.error, null);
  assert.deepEqual(result.results, []);
});
