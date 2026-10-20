const test = require('node:test');
const assert = require('node:assert');
const { setRegionPlz, getRegion } = require('../src/services/offersScraper.cjs');

// Bewusst nur der Fehlerpfad: gültige Werte würden offers-config.json schreiben.
test('PLZ-Validierung: nur fünf Ziffern', () => {
  assert.throws(() => setRegionPlz('abc'), /fünfstellig/);
  assert.throws(() => setRegionPlz('1234'), /fünfstellig/);
  assert.throws(() => setRegionPlz('123456'), /fünfstellig/);
  assert.throws(() => setRegionPlz(''), /fünfstellig/);
});

test('Region liefert die aktive PLZ', () => {
  const { plz } = getRegion();
  assert.match(plz, /^\d{5}$/);
});
