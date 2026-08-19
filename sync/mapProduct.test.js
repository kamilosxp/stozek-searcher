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

test('maps a dimension value using a Polish decimal comma', () => {
  const commaDecimal = {
    product_id: '21366',
    category_id: '142',
    translations: {
      pl_PL: {
        name: 'Łożyska 32013 X FAG',
        permalink: 'https://www.stozek.pl/pl/p/Lozyska-32013-X-FAG/21366',
      },
    },
    stock: { price: '120.00' },
    attributes: { '3': { '16': '23', '20': '60,5', '21': '95' } },
  };
  assert.deepEqual(mapProduct(commaDecimal), {
    id: '21366',
    name: 'Łożyska 32013 X FAG',
    url: 'https://www.stozek.pl/pl/p/Lozyska-32013-X-FAG/21366',
    price: 120,
    d: 60.5,
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
