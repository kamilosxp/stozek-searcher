// widget/inline-search-sync.test.js
//
// widget/index.html inlines its own copy of matchProducts because Shoper's
// CMS only accepts a single HTML file (approved duplication, see
// widget/search.js). This test extracts that inline copy at runtime and
// runs it through a subset of search.test.js's assertions, so it fails loudly
// if someone edits one copy and forgets the other.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function extractInlineMatchProducts(html) {
  const marker = 'function matchProducts';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('matchProducts function not found in index.html');

  const braceStart = html.indexOf('{', start);
  if (braceStart === -1) throw new Error('Could not find opening brace of matchProducts in index.html');

  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < html.length; i += 1) {
    if (html[i] === '{') depth += 1;
    else if (html[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('Could not find matching closing brace of matchProducts in index.html');

  return html.slice(start, end + 1);
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const source = extractInlineMatchProducts(html);
// eslint-disable-next-line no-new-func
const matchProducts = new Function(`${source}\nreturn matchProducts;`)();

const products = [
  { id: '1', name: 'A', url: 'u1', price: 10, d: 60, D: 95, B: 23 },
  { id: '2', name: 'B', url: 'u2', price: 20, d: 62, D: 95, B: 23 },
  { id: '3', name: 'C', url: 'u3', price: 30, d: 25, D: 52, B: 15 },
];

test('inline matchProducts (index.html): matches within tolerance on a single dimension', () => {
  const result = matchProducts(products, { d: 61, tolerance: 1 });
  assert.equal(result.error, null);
  assert.deepEqual(result.results.map((r) => r.id), ['1', '2']);
});

test('inline matchProducts (index.html): returns NO_CRITERIA error when no dimension is provided', () => {
  const result = matchProducts(products, { tolerance: 0.5 });
  assert.equal(result.error, 'NO_CRITERIA');
  assert.deepEqual(result.results, []);
});

test('inline matchProducts (index.html): sorts results by ascending total deviation', () => {
  // d=61.8 puts product 2 (d=62) closer than product 1 (d=60), so the
  // correct order ['2', '1'] is the reverse of the fixture's input order
  // -- proving the sort actually runs, not just that input order survived.
  // See widget/search.test.js for the matching case against the tested
  // (non-inline) copy of matchProducts.
  const result = matchProducts(products, { d: 61.8, tolerance: 2 });
  assert.deepEqual(result.results.map((r) => r.id), ['2', '1']);
  assert.ok(result.results[0].deviation < result.results[1].deviation);
});
