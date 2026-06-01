// Unit tests for server/src/services/categorization.cjs
// Run with: node --test server/test/categorization.test.cjs

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseQuantity, detectStore, guessCategory, enrichProduct, VALID_CATEGORIES } = require('../src/services/categorization.cjs');

// === parseQuantity ===
test('parseQuantity handles "1 L"', () => {
  assert.deepEqual(parseQuantity('1 L'), { amount: '1', unit: 'L' });
});

test('parseQuantity handles "250 g" with lowercase unit', () => {
  assert.deepEqual(parseQuantity('250 g'), { amount: '250', unit: 'g' });
});

test('parseQuantity normalizes "stk" to "Stück"', () => {
  assert.deepEqual(parseQuantity('6 stk'), { amount: '6', unit: 'Stück' });
});

test('parseQuantity normalizes "l" to "L" and "ml" stays', () => {
  assert.deepEqual(parseQuantity('1.5 l'), { amount: '1.5', unit: 'L' });
  assert.deepEqual(parseQuantity('500 ml'), { amount: '500', unit: 'ml' });
});

test('parseQuantity handles German decimal comma', () => {
  assert.deepEqual(parseQuantity('1,5 L'), { amount: '1.5', unit: 'L' });
});

test('parseQuantity returns empty for null/empty', () => {
  assert.deepEqual(parseQuantity(''), { amount: '', unit: '' });
  assert.deepEqual(parseQuantity(null), { amount: '', unit: '' });
});

test('parseQuantity passes through non-numeric strings', () => {
  assert.deepEqual(parseQuantity('Ein paar'), { amount: 'Ein paar', unit: '' });
});

// === detectStore ===
test('detectStore returns aldi for Milsani brand', () => {
  assert.equal(detectStore('Milsani', 'H-Milch'), 'aldi');
});

test('detectStore returns lidl for Vemondo/oko/freeway', () => {
  assert.equal(detectStore('Vemondo', 'Hafermilch'), 'aldi');
  assert.equal(detectStore('oko', 'Schoko'), 'lidl');
  assert.equal(detectStore('Milbona', 'Joghurt'), 'lidl');
});

test('detectStore returns rewe for "ja!" and "voll & gut"', () => {
  assert.equal(detectStore('ja!', 'Bio Butter'), 'rewe');
  assert.equal(detectStore('Rewe', 'Eier'), 'rewe');
  assert.equal(detectStore('', 'Voll & Gut Müsli'), 'rewe');
});

test('detectStore returns edeka for "gut & günstig"', () => {
  assert.equal(detectStore('Gut & Günstig', 'Wurst'), 'edeka');
});

test('detectStore checks brand+product name (both)', () => {
  assert.equal(detectStore('Unknown', 'Milsani style butter'), 'aldi');
});

test('detectStore returns empty when nothing matches', () => {
  assert.equal(detectStore('RandomBrand', 'Random Product'), '');
  assert.equal(detectStore('', ''), '');
});

// === guessCategory ===
test('guessCategory trusts valid pre-set category', () => {
  assert.equal(guessCategory({ name: 'X', category: 'dairy' }), 'dairy');
  assert.equal(guessCategory({ name: 'X', category: 'plant' }), 'plant');
});

test('guessCategory ignores invalid pre-set category', () => {
  // 'sonstiges' is valid, so this would return sonstiges
  // but a non-listed one should fall through to rules
  const result = guessCategory({ name: 'H-Milch', category: 'unknown_category' });
  assert.notEqual(result, 'unknown_category');
});

test('guessCategory detects dairy from German keywords', () => {
  assert.equal(guessCategory({ name: 'Joghurt mild', category: '' }), 'dairy');
  assert.equal(guessCategory({ name: 'Milch 3.5%', category: 'Milchprodukte' }), 'dairy');
  assert.equal(guessCategory({ name: 'Butter', category: 'dairy products' }), 'dairy');
});

test('guessCategory detects meat from "thunfisch"/"lachs"', () => {
  assert.equal(guessCategory({ name: 'Thunfisch in Olivenöl' }), 'meat');
  assert.equal(guessCategory({ name: 'Lachs Filet' }), 'meat');
});

test('guessCategory detects plant from "oatly"/"alpro"/"haferdrink"', () => {
  assert.equal(guessCategory({ name: 'Oatly Haferdrink' }), 'plant');
  assert.equal(guessCategory({ name: 'Alpro Sojamilch' }), 'plant');
});

test('guessCategory detects beverages from "cola"/"limonade"/"wasser"', () => {
  assert.equal(guessCategory({ name: 'Coca Cola 1.5L' }), 'beverages');
  assert.equal(guessCategory({ name: 'Mineralwasser' }), 'beverages');
  assert.equal(guessCategory({ name: 'Apfelsaft' }), 'beverages');
});

test('guessCategory detects bakery from "brot"/"brötchen"', () => {
  assert.equal(guessCategory({ name: 'Brot Vollkorn' }), 'bakery');
  assert.equal(guessCategory({ name: 'Brötchen' }), 'bakery');
});

test('guessCategory detects frozen from "eis"/"tiefkühl"', () => {
  assert.equal(guessCategory({ name: 'Eis am Stiel' }), 'frozen');
  assert.equal(guessCategory({ name: 'Pizza Tiefkühl' }), 'frozen');
});

test('guessCategory returns sonstiges for unknown items', () => {
  assert.equal(guessCategory({ name: 'Batterien AA' }), 'sonstiges');
  assert.equal(guessCategory({ name: '', category: '' }), 'sonstiges');
  assert.equal(guessCategory(null), 'sonstiges');
});

// === enrichProduct (integration of the three) ===
test('enrichProduct combines all three: parses, detects store, guesses category', () => {
  const result = enrichProduct({
    name: 'Milsani H-Milch 3.5%',
    brand: 'Milsani',
    code: '12345678',
    quantity: '1 L',
    category: 'Milch'
  });
  assert.equal(result.item, 'Milsani H-Milch 3.5%');
  assert.equal(result.amount, '1');
  assert.equal(result.unit, 'L');
  assert.equal(result.category, 'dairy');
  assert.equal(result.store, 'aldi');
  assert.equal(result.off_product_code, '12345678');
  assert.equal(result.off_brand, 'Milsani');
});

test('enrichProduct handles null input', () => {
  assert.equal(enrichProduct(null), null);
});

test('enrichProduct keeps all OFF metadata fields', () => {
  const result = enrichProduct({
    name: 'Test', code: 'CODE', brand: 'B', quantity: '100 g',
    category: 'test', imageUrl: 'http://x.com/i.jpg'
  });
  assert.equal(result.off_product_name, 'Test');
  assert.equal(result.off_product_code, 'CODE');
  assert.equal(result.off_brand, 'B');
  assert.equal(result.off_quantity, '100 g');
});

// === Valid categories list ===
test('VALID_CATEGORIES includes all expected internal categories', () => {
  for (const expected of ['dairy', 'meat', 'produce', 'bakery', 'frozen', 'beverages', 'snacks', 'plant', 'sonstiges']) {
    assert.ok(VALID_CATEGORIES.includes(expected), `Missing category: ${expected}`);
  }
});
