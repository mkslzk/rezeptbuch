/**
 * Wochenkosten eines Rezepts auf Basis der aktuellen Angebote.
 *
 * Wichtig für die Ehrlichkeit der Zahl: Angebote sind **Packungspreise**
 * („500 g Butter 1,99 €"), nicht Rezeptmengen. Deshalb summieren wir die
 * Packungspreise der Zutaten, die diese Woche im Angebot sind — das ist der
 * Betrag, den man beim Einkauf tatsächlich dafür hinlegt. Keine Hochrechnung
 * auf Gramm.
 *
 * Matching: eigener Vergleich statt `fuzzyMatch` aus dem Scraper — der liefert
 * bei Rezeptzutaten Unsinn („Kartoffeln" → „Duschgel Kick Off"). Hier gilt:
 * Wortstämme vergleichen, deutsche Komposita nur am **Kopfwort** (hinten)
 * akzeptieren, also „Magerquark" ↔ „Quark", aber nicht „Quarkbällchen".
 */

const { getOffers, storeDisplayName } = require('./offersScraper.cjs');

const SKIP_UNITS = new Set(['prise', 'prisen', 'etwas', 'nach geschmack', 'n.b.', 'nb', 'bund']);
const SKIP_TERMS = /^(salz|pfeffer|wasser)\b/i;

// Fertige Gerichte/Zubereitungen: ein Angebot damit ist keine Zutat.
// Ausnahme: wenn die Zutat selbst danach heißt ("Tomatensuppe").
const PRODUCT_TYPE_BLOCK = [
  'brötchen', 'broetchen', 'brot', 'kuchen', 'keks', 'spezialität', 'spezialitaet',
  'genuss', 'salat', 'suppe', 'auflauf', 'pizza', 'sauce', 'soße', 'sosse',
  'fertiggericht', 'menü', 'menue', 'gericht', 'chips', 'riegel', 'pudding',
  'müsli', 'muesli', 'eis', 'getränk', 'getraenk', 'saft', 'wein', 'bier',
  'snack', 'waffel', 'creme', 'dessert', 'aufschnitt', 'wurst', 'käse', 'kaese',
];

// Geschmacksrichtungen/Sorten: "Früchte-Quark" ist nicht "Quark"
const FLAVOR_BLOCK = [
  'frucht', 'früchte', 'fruechte', 'vanille', 'schoko', 'erdbeer', 'himbeer',
  'zitrone', 'banane', 'karamell', 'karamel', 'honig', 'nuss', 'mandel',
  'kokos', 'mango', 'apfel', 'kirsche', 'pfirsich', 'beere',
  'gewürz', 'gewuerz', 'kräuter', 'kraeuter', 'scharf', 'mild', 'rauch',
];

// Füllwörter, die nichts über das Produkt aussagen
const STOPWORDS = new Set([
  'frisch', 'frische', 'frischer', 'frisches', 'gehackt', 'gehackte', 'gehackter',
  'gekocht', 'gekochte', 'gekochter', 'gemahlen', 'gemahlene', 'gemahlener',
  'getrocknet', 'getrocknete', 'tiefgekühlt', 'tk', 'bio', 'gross', 'grosse',
  'klein', 'kleine', 'mittelgross', 'mittelgrosse', 'reife', 'reifer',
  'natur', 'pur', 'original', 'klassisch', 'klassische', 'fein', 'feine',
  'grob', 'grobes', 'dose', 'dosen', 'glas', 'packung', 'pkg', 'stk', 'stueck',
  'stück', 'nach', 'wahl', 'belieben', 'optional', 'ca', 'etwa', 'und', 'oder',
  'mit', 'ohne', 'im', 'in', 'der', 'die', 'das', 'zum', 'zur', 'von', 'aus',
  'je', 'pro', 'halb', 'halbe', 'ganze', 'ganzer', 'paar',
]);

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\([^)]*\)/g, ' ')      // "(mehlig)", "(20%)"
    .replace(/[^a-zäöü0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Grober deutscher Stamm: Plural-/Endungsvarianten zusammenführen. */
function stem(word) {
  let w = word;
  if (w.length > 5 && (w.endsWith('en') || w.endsWith('er'))) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  else if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1);
  else if (w.length > 5 && w.endsWith('n')) w = w.slice(0, -1);
  return w;
}

function tokens(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Vergleich zweier Produktnamen (0…1).
 * Kopfwort-Regel: ein kürzeres Wort zählt nur, wenn es am **Ende** des
 * längeren steht — „Magerquark" enthält „Quark", „Quarkbällchen" aber nicht
 * im Sinne des Produkts (deutsche Komposita tragen das Kopfwort hinten).
 */
function ingredientScore(ingredientName, offerName) {
  const ing = tokens(ingredientName);
  const off = tokens(offerName);
  if (ing.length === 0 || off.length === 0) return 0;

  // Fertiggericht statt Zutat? ("Rosinen-Brötchen" für "Rosinen")
  const ingNorm = normalize(ingredientName);
  const offNorm = normalize(offerName);
  for (const type of PRODUCT_TYPE_BLOCK) {
    if (offNorm.includes(type) && !ingNorm.includes(type)) return 0;
  }
  for (const flavor of FLAVOR_BLOCK) {
    if (offNorm.includes(flavor) && !ingNorm.includes(flavor)) return 0;
  }

  const offStems = off.map(stem);
  const head = ing.reduce((a, b) => (b.length > a.length ? b : a), ing[0]);

  // 1.0 = exakt/gleicher Stamm, 0.85 = Kompositum mit der Zutat am Ende
  function tokenScore(word) {
    const st = stem(word);
    let best = 0;
    for (let i = 0; i < off.length; i++) {
      const ow = off[i];
      const os = offStems[i];
      if (ow === word || os === st) return 1;
      const compound = (ow.length >= 4 && word.length >= 4 && (ow.endsWith(word) || os.endsWith(st)));
      // Kurze Wörter: "Ei" → "Eier", "Ei" → "Freilandeier"
      if (!compound && word.length <= 3) {
        if (ow.length <= word.length + 2 && ow.startsWith(word)) { best = Math.max(best, 0.9); continue; }
        if (os.length >= 5 && os.endsWith(st)) { best = Math.max(best, 0.85); continue; }
      }
      if (compound) best = Math.max(best, 0.85);
    }
    return best;
  }

  let total = 0;
  let headScore = 0;
  for (const word of ing) {
    const sc = tokenScore(word);
    total += sc;
    if (word === head) headScore = sc;
  }

  if (headScore === 0 || total === 0) return 0;

  const coverage = total / ing.length;
  const noise = Math.max(0, off.length - ing.length);
  return Math.max(0, Math.min(1, coverage - noise * 0.03));
}

/**
 * @param {Array<{item:string, amount?:string, unit?:string, category?:string}>} ingredients
 * @param {{minScore?:number}} [opts]
 */
function weekCostForIngredients(ingredients = [], { minScore = 0.6 } = {}) {
  const { offers, lastUpdated } = getOffers();
  const flat = [];
  for (const [store, list] of Object.entries(offers || {})) {
    for (const o of list || []) flat.push({ ...o, store });
  }

  const items = [];
  let sum = 0;
  let matchedCount = 0;
  let priceableCount = 0;

  for (const ing of ingredients) {
    const name = String(ing?.item || '').trim();
    if (!name) continue;

    const unit = String(ing?.unit || '').trim().toLowerCase();
    const priceable = !SKIP_UNITS.has(unit) && !SKIP_TERMS.test(name);
    if (priceable) priceableCount++;

    let best = null;
    for (const offer of flat) {
      const score = ingredientScore(name, offer.name);
      if (score < minScore) continue;
      if (!best) { best = { score, offer }; continue; }
      if (score > best.score + 0.05) { best = { score, offer }; continue; }
      if (Math.abs(score - best.score) <= 0.05) {
        const cheaper = typeof offer.price === 'number' && offer.price < (best.offer.price ?? Infinity);
        const shorterName = String(offer.name).length < String(best.offer.name).length - 4;
        if (cheaper || shorterName) best = { score, offer };
      }
    }

    if (best) {
      matchedCount++;
      if (priceable) sum += Number(best.offer.price) || 0;
    }

    items.push({
      item: name,
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      category: ing.category ?? null,
      priceable,
      score: best ? Math.round(best.score * 100) / 100 : 0,
      offer: best ? {
        name: best.offer.name,
        store: best.offer.store,
        store_label: storeDisplayName(best.offer.store),
        price: best.offer.price,
        original_price: best.offer.original_price ?? null,
        discount_percent: best.offer.discount_percent ?? null,
        unit_price: best.offer.unit_price ?? null,
        unit: best.offer.unit ?? null,
        valid_to: best.offer.valid_to ?? null,
        diet_tag: best.offer.diet_tag ?? null,
      } : null,
    });
  }

  return {
    lastUpdated: lastUpdated || null,
    totalOffers: flat.length,
    totalCount: items.length,
    priceableCount,
    matchedCount,
    sum: Math.round(sum * 100) / 100,
    items,
  };
}

module.exports = { weekCostForIngredients, ingredientScore, tokens, stem };
