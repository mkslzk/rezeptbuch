const test = require('node:test');
const assert = require('node:assert');
const { ingredientScore, tokens, stem } = require('../src/services/productMatch.cjs');

test('exakte Treffer', () => {
  assert.strictEqual(ingredientScore('Zwiebeln', 'Zwiebeln'), 1);
  assert.strictEqual(ingredientScore('Butter', 'Butter'), 1);
});

test('Klammern und Zusätze werden ignoriert', () => {
  assert.ok(ingredientScore('Kartoffeln (mehlig)', 'Kartoffeln') >= 0.95);
  assert.ok(ingredientScore('Quark (20%)', 'Quark') >= 0.95);
});

test('deutsche Komposita: Kopfwort hinten zählt', () => {
  assert.ok(ingredientScore('Quark', 'Magerquark') >= 0.8);
  assert.ok(ingredientScore('Mehl', 'Weizenmehl Type 405') >= 0.8);
  assert.ok(ingredientScore('Milch', 'Vollmilch 3,5%') >= 0.8);
});

test('Kompositum in falscher Richtung zählt nicht', () => {
  // "Quarkbällchen" ist ein Gebäck, "Kalbsschnitzel" ≠ "XXL Schnitzel"
  assert.strictEqual(ingredientScore('Quark', 'Quarkbällchen'), 0);
  assert.strictEqual(ingredientScore('Kalbsschnitzel', 'XXL Schnitzel'), 0);
});

test('Fertiggerichte und Sorten werden ausgeschlossen', () => {
  assert.strictEqual(ingredientScore('Rosinen', 'Rosinen-Brötchen'), 0);
  assert.strictEqual(ingredientScore('Kartoffeln', 'Kartoffel-Spezialität'), 0);
  assert.strictEqual(ingredientScore('Quark', 'Früchte-Quark'), 0);
  assert.strictEqual(ingredientScore('Quark', 'Gewürzquark XXL'), 0);
});

test('Unsinn wird nicht gematcht', () => {
  assert.strictEqual(ingredientScore('Kartoffeln (mehlig)', 'Duschgel Kick Off'), 0);
});

test('kurze Wörter: Ei', () => {
  assert.ok(ingredientScore('Ei', 'Eier') >= 0.85);
  assert.ok(ingredientScore('Ei', '10 frische Eier') >= 0.8);
});

test('Stammbildung', () => {
  assert.strictEqual(stem('Kartoffeln'), 'Kartoffel');
  assert.strictEqual(stem('Eier'), 'Eier');
  assert.deepStrictEqual(tokens('500 g Kartoffeln (mehlig)'), ['kartoffeln']);
});
