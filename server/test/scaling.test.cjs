// Unit tests for client/src/utils/scaling.js
// Run with: node --test test/scaling.test.cjs
//
// Note: This file is in server/test/ for convenience but tests a CLIENT util.
// We import it via a relative path from the workspace root.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// Use dynamic import since the file is ESM (.js with export)
async function loadUtil() {
  const utilPath = path.join(__dirname, '..', '..', 'client', 'src', 'utils', 'scaling.js');
  return await import(utilPath);
}

test('parseGermanNumber handles "1,5" (German decimal)', async () => {
  const { parseGermanNumber } = await loadUtil();
  assert.equal(parseGermanNumber('1,5'), 1.5);
});

test('parseGermanNumber handles "200"', async () => {
  const { parseGermanNumber } = await loadUtil();
  assert.equal(parseGermanNumber('200'), 200);
});

test('parseGermanNumber handles "0.5"', async () => {
  const { parseGermanNumber } = await loadUtil();
  assert.equal(parseGermanNumber('0.5'), 0.5);
});

test('parseGermanNumber handles "ca. 200"', async () => {
  const { parseGermanNumber } = await loadUtil();
  assert.equal(parseGermanNumber('ca. 200'), 200);
});

test('parseGermanNumber returns null for non-numeric', async () => {
  const { parseGermanNumber } = await loadUtil();
  assert.equal(parseGermanNumber('etwas'), null);
  assert.equal(parseGermanNumber(''), null);
  assert.equal(parseGermanNumber(null), null);
});

test('formatGermanNumber: integers stay integers', async () => {
  const { formatGermanNumber } = await loadUtil();
  assert.equal(formatGermanNumber(3), '3');
  assert.equal(formatGermanNumber(200), '200');
});

test('formatGermanNumber: decimals use comma', async () => {
  const { formatGermanNumber } = await loadUtil();
  assert.equal(formatGermanNumber(1.5), '1,5');
  assert.equal(formatGermanNumber(2.25), '2,25');
});

test('formatGermanNumber: rounds to 2 decimals max', async () => {
  const { formatGermanNumber } = await loadUtil();
  assert.equal(formatGermanNumber(0.333333), '0,33');
  assert.equal(formatGermanNumber(1.666666), '1,67');
});

test('isScalable: numeric amounts are scalable', async () => {
  const { isScalable } = await loadUtil();
  assert.equal(isScalable('200', 'g'), true);
  assert.equal(isScalable('1,5', 'L'), true);
});

test('isScalable: "etwas" / "nach Geschmack" are not scalable', async () => {
  const { isScalable } = await loadUtil();
  assert.equal(isScalable('etwas', ''), false);
  assert.equal(isScalable('nach Geschmack', ''), false);
  assert.equal(isScalable('Einige', 'Stk'), false);
});

test('isScalable: "Prise" is not scalable', async () => {
  const { isScalable } = await loadUtil();
  assert.equal(isScalable('1', 'Prise'), false);
});

test('isScalable: empty values are not scalable', async () => {
  const { isScalable } = await loadUtil();
  assert.equal(isScalable('', 'g'), false);
  assert.equal(isScalable(null, 'g'), false);
});

test('scaleAmount: 200g × 1.5 → 300g', async () => {
  const { scaleAmount } = await loadUtil();
  const r = scaleAmount('200', 'g', 1.5);
  assert.deepEqual(r, { amount: '300', unit: 'g' });
});

test('scaleAmount: 1,5L × 2 → 3L', async () => {
  const { scaleAmount } = await loadUtil();
  const r = scaleAmount('1,5', 'L', 2);
  assert.deepEqual(r, { amount: '3', unit: 'L' });
});

test('scaleAmount: 1 × 0.5 → 0,5', async () => {
  const { scaleAmount } = await loadUtil();
  const r = scaleAmount('1', '', 0.5);
  assert.deepEqual(r, { amount: '0,5', unit: '' });
});

test('scaleAmount: 4 Eier × 1.5 → 6 Eier', async () => {
  const { scaleAmount } = await loadUtil();
  const r = scaleAmount('4', 'Stk', 1.5);
  assert.deepEqual(r, { amount: '6', unit: 'Stk' });
});

test('scaleAmount: 0.33 Tassen × 3 → 1 (rounded)', async () => {
  const { scaleAmount } = await loadUtil();
  const r = scaleAmount('0,33', 'Tasse', 3);
  assert.deepEqual(r, { amount: '0,99', unit: 'Tasse' });
});

test('scaleAmount: multiplier 1 returns original', async () => {
  const { scaleAmount } = await loadUtil();
  const r = scaleAmount('200', 'g', 1);
  assert.deepEqual(r, { amount: '200', unit: 'g' });
});

test('scaleAmount: "etwas Salz" returns null (not scaled)', async () => {
  const { scaleAmount } = await loadUtil();
  assert.equal(scaleAmount('etwas', '', 2), null);
});

test('scaleAmount: "1 Prise Salz" returns null (Prise is non-scalable)', async () => {
  const { scaleAmount } = await loadUtil();
  assert.equal(scaleAmount('1', 'Prise', 2), null);
});

test('scalingBadge: returns empty for multiplier 1', async () => {
  const { scalingBadge } = await loadUtil();
  assert.equal(scalingBadge(1), '');
});

test('scalingBadge: "½× Portionen" for 0.5', async () => {
  const { scalingBadge } = await loadUtil();
  assert.equal(scalingBadge(0.5), '½× Portionen');
});

test('scalingBadge: "2× Portionen" for 2', async () => {
  const { scalingBadge } = await loadUtil();
  assert.equal(scalingBadge(2), '2× Portionen');
});

test('scalingBadge: "1,5× Portionen" for 1.5', async () => {
  const { scalingBadge } = await loadUtil();
  assert.equal(scalingBadge(1.5), '1,5× Portionen');
});
