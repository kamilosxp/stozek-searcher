# Wyszukiwarka łożysk po wymiarach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Darmowa wyszukiwarka łożysk po wymiarach (d/D/B + tolerancja) na stozek.pl, zastępująca płatną wtyczkę.

**Architecture:** Skrypt Node.js (uruchamiany cyklicznie przez GitHub Actions) pobiera cały katalog produktów ze Shoper REST API, filtruje po kategoriach łożysk i mapuje wymiary z cech produktu, zapisuje `docs/data.json` publikowany przez GitHub Pages. Statyczny widget HTML/JS wklejony jako strona CMS w Shoperze pobiera ten JSON i wyszukuje lokalnie w przeglądarce.

**Tech Stack:** Node.js 20+ (wbudowany `fetch` i `node:test`, zero zależności npm), GitHub Actions, GitHub Pages, czysty HTML/CSS/JS (bez frameworka).

**Spec:** `docs/superpowers/specs/2026-08-19-wyszukiwarka-po-wymiarach-design.md`

## Global Constraints

- Repo musi być **publiczne** na GitHub — to warunek darmowego GitHub Pages.
- Zero zależności npm — brak `package.json`, brak `npm install` w workflow. Node 20+ ma wbudowany `fetch` i `node:test`.
- Token Shoper API tylko jako sekret GitHub Actions (`SHOPER_API_TOKEN`), nigdy w kodzie/repo.
- Auth do Shoper API: nagłówek `Authorization: Bearer <token>` bezpośrednio na zasobach (potwierdzone ręcznie — bez wymiany przez `/webapi/rest/auth`).
- Endpoint listy produktów: `GET https://www.stozek.pl/webapi/rest/products?page=N&limit=50`, odpowiedź `{count, pages, page, list}`. Filtrowanie po kategorii w query **nie działa** (potwierdzone) — filtr po `category_id` musi być po stronie skryptu.
- Kategorie łożysk (`category_id`, string na produkcie): `"138"` (Łożyska), `"139"` (Baryłkowe), `"140"` (Kulkowe), `"141"` (Samochodowe), `"142"` (Stożkowe), `"143"` (Ślizgowe), `"144"` (Walcowe i igiełkowe).
- Mapowanie wymiarów (potwierdzone etykietami w panelu Shoper): `attributes["3"]["20"]` = d, `attributes["3"]["21"]` = D, `attributes["3"]["16"]` = B.
- Bez zdjęć produktu w wynikach (`main_image` puste na sprawdzonych przykładach, poza zakresem MVP).

---

### Task 1: `mapProduct` — mapowanie surowego produktu Shoper na rekord wyszukiwarki

**Files:**
- Create: `sync/mapProduct.js`
- Test: `sync/mapProduct.test.js`

**Interfaces:**
- Produces: `mapProduct(rawProduct: object): {id: string, name: string, url: string, price: number, d: number, D: number, B: number} | null` — używane przez Task 3 (`generateData.js`).
- Produces: `BEARING_CATEGORY_IDS: Set<string>` (eksportowane z `mapProduct.js`) — zbiór `{"138","139","140","141","142","143","144"}`.

- [ ] **Step 1: Write the failing tests**

```js
// sync/mapProduct.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { mapProduct } = require('./mapProduct');

const realBearing = {
  product_id: '21365',
  category_id: '142',
  translations: {
    pl_PL: {
      name: 'Łożyska 32012 X FAG',
      permalink: 'https://www.stozek.pl/pl/p/Lozyska-32012-X-FAG/21365',
    },
  },
  stock: { price: '115.89' },
  attributes: { '3': { '16': '23', '17': '30039', '19': 'FAG', '20': '60', '21': '95', '22': '0', '23': '' } },
};

test('maps a valid bearing product with confirmed real dimensions', () => {
  assert.deepEqual(mapProduct(realBearing), {
    id: '21365',
    name: 'Łożyska 32012 X FAG',
    url: 'https://www.stozek.pl/pl/p/Lozyska-32012-X-FAG/21365',
    price: 115.89,
    d: 60,
    D: 95,
    B: 23,
  });
});

test('rejects product outside bearing categories even with attribute group 3 present', () => {
  const wpust = {
    product_id: '36092',
    category_id: '135',
    translations: { pl_PL: { name: 'Wpust pryzmatyczny 5x5x10', permalink: 'https://www.stozek.pl/pl/p/x/36092' } },
    stock: { price: '1.67' },
    attributes: { '3': { '16': '10', '17': '34709', '20': '5', '21': '5', '22': '0' } },
  };
  assert.equal(mapProduct(wpust), null);
});

test('rejects product with no attribute group 3 at all', () => {
  const rail = {
    product_id: '18062',
    category_id: '134',
    translations: { pl_PL: { name: 'Szyna HSR', permalink: 'https://www.stozek.pl/pl/p/x/18062' } },
    stock: { price: '596.14' },
    attributes: {},
  };
  assert.equal(mapProduct(rail), null);
});

test('rejects bearing-category product with an empty dimension value', () => {
  const incomplete = {
    product_id: '1',
    category_id: '140',
    translations: { pl_PL: { name: 'Łożysko X', permalink: 'https://www.stozek.pl/pl/p/x/1' } },
    stock: { price: '10.00' },
    attributes: { '3': { '16': '', '20': '10', '21': '20' } },
  };
  assert.equal(mapProduct(incomplete), null);
});

test('rejects bearing-category product missing attributes entirely', () => {
  const noAttrs = {
    product_id: '2',
    category_id: '140',
    translations: { pl_PL: { name: 'Łożysko Y', permalink: 'https://www.stozek.pl/pl/p/x/2' } },
    stock: { price: '10.00' },
    attributes: null,
  };
  assert.equal(mapProduct(noAttrs), null);
});

test('rejects bearing-category product missing stock/price', () => {
  const noStock = {
    product_id: '3',
    category_id: '140',
    translations: { pl_PL: { name: 'Łożysko Z', permalink: 'https://www.stozek.pl/pl/p/x/3' } },
    stock: null,
    attributes: { '3': { '16': '10', '20': '20', '21': '30' } },
  };
  assert.equal(mapProduct(noStock), null);
});

test('rejects bearing-category product missing translations', () => {
  const noTranslations = {
    product_id: '4',
    category_id: '140',
    translations: {},
    stock: { price: '10.00' },
    attributes: { '3': { '16': '10', '20': '20', '21': '30' } },
  };
  assert.equal(mapProduct(noTranslations), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test sync/mapProduct.test.js`
Expected: FAIL — `Cannot find module './mapProduct'`

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test sync/mapProduct.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/mapProduct.js sync/mapProduct.test.js
git commit -m "Add mapProduct: map raw Shoper product to bearing search record"
```

---

### Task 2: `fetchProducts` — pobranie całego katalogu ze Shoper API (paginacja + retry)

**Files:**
- Create: `sync/fetchProducts.js`
- Test: `sync/fetchProducts.test.js`

**Interfaces:**
- Consumes: nic z Task 1 (niezależny moduł).
- Produces: `fetchProducts(token: string, options?: {fetchFn?, baseUrl?, limit?, maxRetries?, delayMs?}): Promise<object[]>` — zwraca płaską listę surowych produktów (do `mapProduct` z Task 1 w Task 3). Rzuca błąd (`throw`) jeśli pobranie się nie powiedzie po wyczerpaniu retry.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test sync/fetchProducts.test.js`
Expected: FAIL — `Cannot find module './fetchProducts'`

- [ ] **Step 3: Write minimal implementation**

```js
// sync/fetchProducts.js
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(fetchFn, url, token, maxRetries, delayMs) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) await sleep(delayMs);
    }
  }
  throw new Error(`Request to ${url} failed after ${maxRetries} attempts: ${lastError.message}`);
}

async function fetchProducts(token, options = {}) {
  const {
    fetchFn = fetch,
    baseUrl = 'https://www.stozek.pl/webapi/rest/products',
    limit = 50,
    maxRetries = 3,
    delayMs = 200,
  } = options;

  const all = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `${baseUrl}?page=${page}&limit=${limit}`;
    const data = await fetchPage(fetchFn, url, token, maxRetries, delayMs);
    all.push(...(data.list || []));
    totalPages = data.pages || 1;
    page += 1;
    if (page <= totalPages) await sleep(delayMs);
  } while (page <= totalPages);

  return all;
}

module.exports = { fetchProducts };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test sync/fetchProducts.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/fetchProducts.js sync/fetchProducts.test.js
git commit -m "Add fetchProducts: paginated Shoper API client with retry"
```

---

### Task 3: `generateData` — orkiestracja: pobierz, zmapuj, zapisz `docs/data.json`

**Files:**
- Create: `sync/generateData.js`
- Test: `sync/generateData.test.js`

**Interfaces:**
- Consumes: `mapProduct` z `./mapProduct` (Task 1), `fetchProducts` z `./fetchProducts` (Task 2).
- Produces: `generateData(options: {fetchProductsFn, mapProductFn, token, outPath, writeFileFn, logFn}): Promise<{included: number, skipped: number}>`. Plik wynikowy nadpisywany **tylko** po udanym pobraniu i zmapowaniu całości — błąd w trakcie pobierania przerywa funkcję (`throw`) przed jakimkolwiek zapisem.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test sync/generateData.test.js`
Expected: FAIL — `Cannot find module './generateData'`

- [ ] **Step 3: Write minimal implementation**

```js
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

  await writeFileFn(outPath, JSON.stringify(mapped));
  logFn(`Zapisano ${mapped.length} łożysk, pominięto ${skipped} produktów.`);

  return { included: mapped.length, skipped };
}

module.exports = { generateData };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test sync/generateData.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add sync/generateData.js sync/generateData.test.js
git commit -m "Add generateData: orchestrate fetch, map, and write data.json"
```

---

### Task 4: skrypt uruchamialny (`sync/run.js`) łączący realne zależności

**Files:**
- Create: `sync/run.js`

**Interfaces:**
- Consumes: `fetchProducts` (Task 2), `mapProduct` (Task 1), `generateData` (Task 3), `node:fs/promises`.
- Produces: proces CLI — `node sync/run.js`, kod wyjścia 0 przy sukcesie, niezerowy przy błędzie (używane przez workflow w Task 5).

- [ ] **Step 1: Write the script**

```js
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
```

- [ ] **Step 2: Verify it fails cleanly without a token**

Run: `node sync/run.js`
Expected: prints the error `Missing Shoper API token`, exit code 1 (no `docs/data.json` written/changed).

- [ ] **Step 3: Verify it succeeds with a real token (manual, local)**

Run (PowerShell, real token from Shoper panel — do not commit it):
```powershell
$env:SHOPER_API_TOKEN = "TWOJ_TOKEN"
node sync/run.js
```
Expected: log line `Zapisano N łożysk, pominięto M produktów.` with N in the low thousands (matches the ~13k product count across bearing categories from the spec), and `docs/data.json` created/updated. Open the file and spot-check that product `21365` ("Łożyska 32012 X FAG") is present with `d: 60, D: 95, B: 23`.

- [ ] **Step 4: Commit**

```bash
git add sync/run.js docs/data.json
git commit -m "Add sync/run.js CLI entry point and first generated data.json"
```

---

### Task 5: GitHub Actions — synchronizacja codzienna + publikacja GitHub Pages

**Files:**
- Create: `.github/workflows/sync.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `sync/run.js` (Task 4), sekret repo `SHOPER_API_TOKEN`.
- Produces: publiczny URL `https://<user>.github.io/<repo>/data.json`, konsumowany przez widget w Task 6/7.

- [ ] **Step 1: Write the workflow**

```yaml
# .github/workflows/sync.yml
name: Sync bearing dimensions

on:
  schedule:
    - cron: '17 2 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run unit tests
        run: node --test sync/ widget/

      - name: Generate data.json
        env:
          SHOPER_API_TOKEN: ${{ secrets.SHOPER_API_TOKEN }}
        run: node sync/run.js

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if [ -n "$(git status --porcelain docs/data.json)" ]; then
            git add docs/data.json
            git commit -m "Sync bearing data.json"
            git push
          else
            echo "No changes to commit"
          fi
```

- [ ] **Step 2: Write the README with setup instructions**

```markdown
# Wyszukiwarka łożysk po wymiarach — stozek.pl

## Jednorazowa konfiguracja

1. **Sekret API** — Settings → Secrets and variables → Actions → New repository
   secret → nazwa `SHOPER_API_TOKEN`, wartość: token z panelu Shoper
   (Ustawienia → API).
2. **Repo musi być publiczne** (Settings → General → Danger Zone → Change
   visibility) — to warunek darmowego GitHub Pages.
3. **GitHub Pages** — Settings → Pages → Source: "Deploy from a branch" →
   Branch: `main`, folder `/docs` → Save.
4. Po pierwszym uruchomieniu workflow (patrz niżej), sprawdź że
   `https://<twoj-user>.github.io/<repo>/data.json` zwraca dane.

## Ręczne uruchomienie synchronizacji

Actions → "Sync bearing dimensions" → Run workflow.

## Wklejenie widgetu na stozek.pl

W panelu Shoper stwórz nową stronę CMS, wklej zawartość `widget/index.html`.
W pliku podmień `DATA_URL` na `https://<twoj-user>.github.io/<repo>/data.json`.
```

- [ ] **Step 3: Verify the workflow YAML is syntactically valid**

```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('.github/workflows/sync.yml', 'utf8');
if (content.includes('\t')) throw new Error('YAML contains tabs');
['name:', 'on:', 'jobs:', 'steps:'].forEach((k) => { if (!content.includes(k)) throw new Error('missing ' + k); });
console.log('basic structure OK');
"
```
Expected: prints `basic structure OK`, no error thrown. (Full validation happens for real when GitHub parses it on push — this is just a fast local sanity check.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/sync.yml README.md
git commit -m "Add GitHub Actions sync workflow and setup README"
```

- [ ] **Step 5: Push, enable Pages, trigger workflow (manual, one-time)**

Push the repo to GitHub (create it as **public**), follow the README setup
steps, then trigger the workflow manually via Actions → Run workflow.
Confirm `docs/data.json` gets committed by the bot and the GitHub Pages URL
serves it.

---

### Task 6: `matchProducts` — logika dopasowania w widgecie (czysta funkcja)

**Files:**
- Create: `widget/search.js`
- Test: `widget/search.test.js`

**Interfaces:**
- Produces: `matchProducts(products: Array<{id,name,url,price,d,D,B}>, criteria: {d?, D?, B?, tolerance?}): {error: string|null, results: Array<record & {deviation:number}>}`. `error` is `'NO_CRITERIA'` gdy żadne z d/D/B nie podane, inaczej `null` (pusty `results` = brak trafień). Używane przez `widget/index.html` (Task 7).

- [ ] **Step 1: Write the failing tests**

```js
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
  const result = matchProducts(products, { d: 61, tolerance: 2 });
  assert.deepEqual(result.results.map((r) => r.id), ['1', '2']);
  assert.ok(result.results[0].deviation <= result.results[1].deviation);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test widget/search.test.js`
Expected: FAIL — `Cannot find module './search'`

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test widget/search.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add widget/search.js widget/search.test.js
git commit -m "Add matchProducts: dimension + tolerance matching logic"
```

---

### Task 7: `widget/index.html` — formularz, pobranie danych, renderowanie wyników

**Files:**
- Create: `widget/index.html`

**Interfaces:**
- Consumes: `matchProducts` z `widget/search.js` (Task 6, wklejone inline — Shoper CMS przyjmuje jeden blok HTML, więc kod JS z `search.js` jest powielony inline w `<script>`, nie importowany jako osobny plik).
- Produces: gotowa strona do wklejenia w Shoper CMS; placeholder `DATA_URL` do podmiany na realny adres GitHub Pages.

- [ ] **Step 1: Write the widget page**

```html
<!-- widget/index.html -->
<div id="lozyska-wyszukiwarka">
  <form id="lw-form">
    <label>Średnica wewnętrzna d (mm) <input type="number" step="0.01" id="lw-d"></label>
    <label>Średnica zewnętrzna D (mm) <input type="number" step="0.01" id="lw-D"></label>
    <label>Szerokość B (mm) <input type="number" step="0.01" id="lw-B"></label>
    <label>Tolerancja (mm) <input type="number" step="0.01" id="lw-tolerance" value="0.5"></label>
    <button type="submit">Szukaj</button>
  </form>
  <div id="lw-message"></div>
  <ul id="lw-results"></ul>
</div>

<script>
(function () {
  var DATA_URL = 'https://TWOJ-USER.github.io/TWOJE-REPO/data.json';

  function matchProducts(products, criteria) {
    var tolerance = criteria.tolerance == null ? 0 : criteria.tolerance;
    var dims = ['d', 'D', 'B'].filter(function (key) {
      return criteria[key] !== undefined && criteria[key] !== null && criteria[key] !== '';
    });
    if (dims.length === 0) return { error: 'NO_CRITERIA', results: [] };

    var results = [];
    products.forEach(function (product) {
      var matches = true;
      var deviation = 0;
      for (var i = 0; i < dims.length; i += 1) {
        var key = dims[i];
        var diff = Math.abs(product[key] - criteria[key]);
        if (diff > tolerance) { matches = false; break; }
        deviation += diff;
      }
      if (matches) results.push(Object.assign({}, product, { deviation: deviation }));
    });
    results.sort(function (a, b) { return a.deviation - b.deviation; });
    return { error: null, results: results };
  }

  var products = null;
  var messageEl = document.getElementById('lw-message');
  var resultsEl = document.getElementById('lw-results');
  var formEl = document.getElementById('lw-form');

  fetch(DATA_URL)
    .then(function (res) { if (!res.ok) throw new Error('bad status'); return res.json(); })
    .then(function (data) { products = data; })
    .catch(function () { messageEl.textContent = 'Wyszukiwarka chwilowo niedostępna.'; });

  function numOrUndefined(value) {
    return value === '' ? undefined : Number(value);
  }

  formEl.addEventListener('submit', function (event) {
    event.preventDefault();
    resultsEl.innerHTML = '';
    messageEl.textContent = '';

    if (!products) {
      messageEl.textContent = 'Wyszukiwarka chwilowo niedostępna.';
      return;
    }

    var criteria = {
      d: numOrUndefined(document.getElementById('lw-d').value),
      D: numOrUndefined(document.getElementById('lw-D').value),
      B: numOrUndefined(document.getElementById('lw-B').value),
      tolerance: numOrUndefined(document.getElementById('lw-tolerance').value),
    };

    var outcome = matchProducts(products, criteria);

    if (outcome.error === 'NO_CRITERIA') {
      messageEl.textContent = 'Wpisz przynajmniej jeden wymiar.';
      return;
    }

    if (outcome.results.length === 0) {
      messageEl.textContent = 'Brak łożysk w tym zakresie.';
      return;
    }

    outcome.results.forEach(function (r) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = r.url;
      a.textContent = r.name + ' — d:' + r.d + ' D:' + r.D + ' B:' + r.B + ' — ' + r.price + ' zł';
      li.appendChild(a);
      resultsEl.appendChild(li);
    });
  });
})();
</script>
```

- [ ] **Step 2: Manual local test**

1. Copy `docs/data.json` (generated in Task 4) to `widget/data.json` for local testing.
2. Edit `widget/index.html` temporarily: set `DATA_URL = './data.json'`.
3. Serve the folder with a dependency-free Node one-liner (per the zero-npm-dependencies constraint):
   ```bash
   node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{const p=path.join('widget',req.url==='/'?'/index.html':req.url);fs.readFile(p,(e,d)=>{if(e){res.statusCode=404;res.end('not found');return;}res.end(d);});}).listen(8080,()=>console.log('http://localhost:8080'));"
   ```
4. Open `http://localhost:8080` in a browser. Enter `d=60, D=95, B=23, tolerance=0.5` (values confirmed for product 21365 in Task 4) and click Szukaj. Expected: "Łożyska 32012 X FAG" appears in the results list, linking to its real product page.
5. Test edge cases in the browser: submit with all fields empty → "Wpisz przynajmniej jeden wymiar." Submit with `d=1` (no real product this small) → "Brak łożysk w tym zakresie."
6. Revert the temporary `DATA_URL` edit back to the GitHub Pages placeholder before committing.

- [ ] **Step 3: Commit**

```bash
git add widget/index.html
git commit -m "Add widget/index.html: dimension search form for Shoper CMS page"
```

---

### Task 8: Wdrożenie na żywo i test end-to-end na stozek.pl

**Files:** brak nowych plików — czynności w panelu Shoper i GitHub.

- [ ] **Step 1: Podmień `DATA_URL`** w `widget/index.html` na realny adres `https://<twoj-user>.github.io/<repo>/data.json` (z Task 5), commit.

```bash
git add widget/index.html
git commit -m "Point widget at the live GitHub Pages data.json URL"
```

- [ ] **Step 2: Wklej `widget/index.html`** jako nową stronę CMS w panelu Shoper (np. adres `/wyszukiwarka-po-wymiarach`).

- [ ] **Step 3: Test porównawczy z obecną płatną wyszukiwarką** — wybierz 3-5 realnych łożysk widocznych w sklepie (różne kategorie: kulkowe, stożkowe, baryłkowe), wpisz ich rzeczywiste d/D/B do nowego widgetu, porównaj wyniki z tym co zwraca obecna płatna wyszukiwarka dla tych samych wymiarów. Oczekiwane: te same (lub bardzo zbliżone) produkty na liście.

- [ ] **Step 4: Potwierdź automatyczną synchronizację** — poczekaj do następnego uruchomienia harmonogramu (albo odpal ręcznie Actions → Run workflow), sprawdź w zakładce Actions że job przeszedł na zielono i `docs/data.json` ma nowy commit.
