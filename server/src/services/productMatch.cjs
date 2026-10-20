/**
 * Produktnamen-Matching (Zutaten, Einkaufslisten, Angebote).
 *
 * Ein gemeinsamer Matcher für Server und Scraper — die alte Logik
 * (`score > 0.3`, Substring-Suche) traf alles Mögliche: „Milch" → „Milchreis",
 * „Kartoffeln" → „Kartoffel-Spezialität". Regeln hier:
 *
 *  - Stammvergleich statt Substring (Kartoffeln = Kartoffel)
 *  - Kopfwort-Regel für deutsche Komposita: ein kürzeres Wort zählt nur am
 *    **Ende** des längeren — „Magerquark" ↔ „Quark", „Quarkbällchen" ✗
 *  - Fertiggerichte und Sorten ausschließen (Brötchen, Spezialität, Früchte-)
 *  - Die Zutat darf nicht spezifischer sein als das Angebot
 *    („Kalbsschnitzel" ≠ „XXL Schnitzel")
 */

const PRODUCT_TYPE_BLOCK = [
  'brötchen', 'broetchen', 'brot', 'kuchen', 'keks', 'spezialität', 'spezialitaet',
  'genuss', 'salat', 'suppe', 'auflauf', 'pizza', 'sauce', 'soße', 'sosse',
  'fertiggericht', 'menü', 'menue', 'gericht', 'chips', 'riegel', 'pudding',
  'müsli', 'muesli', 'eis', 'getränk', 'getraenk', 'saft', 'wein', 'bier',
  'snack', 'waffel', 'creme', 'dessert', 'aufschnitt', 'wurst', 'käse', 'kaese',
];

const FLAVOR_BLOCK = [
  'frucht', 'früchte', 'fruechte', 'vanille', 'schoko', 'erdbeer', 'himbeer',
  'zitrone', 'banane', 'karamell', 'karamel', 'honig', 'nuss', 'mandel',
  'kokos', 'mango', 'apfel', 'kirsche', 'pfirsich', 'beere',
  'gewürz', 'gewuerz', 'kräuter', 'kraeuter', 'scharf', 'mild', 'rauch',
];

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
 * Vergleich Zutat ↔ Angebotsname. 1.0 exakt/gleicher Stamm,
 * 0.85 Kompositum mit der Zutat am Ende, 0 kein Treffer.
 */
function ingredientScore(ingredientName, offerName) {
  const ing = tokens(ingredientName);
  const off = tokens(offerName);
  if (ing.length === 0 || off.length === 0) return 0;

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

  function tokenScore(word) {
    const st = stem(word);
    let best = 0;
    for (let i = 0; i < off.length; i++) {
      const ow = off[i];
      const os = offStems[i];
      if (ow === word || os === st) return 1;
      const compound = (ow.length >= 4 && word.length >= 4 && (ow.endsWith(word) || os.endsWith(st)));
      if (compound) { best = Math.max(best, 0.85); continue; }
      // Kurze Wörter: "Ei" → "Eier", "Ei" → "Freilandeier"
      if (word.length <= 3) {
        if (ow.length <= word.length + 2 && ow.startsWith(word)) { best = Math.max(best, 0.9); continue; }
      }
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

const SKIP_UNITS = new Set(['prise', 'prisen', 'etwas', 'nach geschmack', 'n.b.', 'nb', 'bund']);

/** Zutaten, die man nicht sinnvoll bepreisen kann (Gewürze/Prise). */
function isPriceable(item, unit) {
  const u = String(unit || '').trim().toLowerCase();
  return !SKIP_UNITS.has(u) && !/^(salz|pfeffer|wasser)\b/i.test(String(item || ''));
}

/**
 * Beste Angebote je Zutat.
 * @param {Array<{item:string, amount?:string, unit?:string}>} items
 * @param {Array<object>} flatOffers  Angebote inkl. `store`
 * @param {{minScore?:number, limit?:number}} [opts]
 */
function matchItems(items, flatOffers, { minScore = 0.6, limit = 3 } = {}) {
  return items.map((it) => {
    const best = [];
    for (const offer of flatOffers) {
      const score = ingredientScore(it.item, offer.name);
      if (score < minScore) continue;
      best.push({ score, offer });
    }
    best.sort((a, b) => b.score - a.score
      || (String(a.offer.name).length - String(b.offer.name).length)
      || ((a.offer.price ?? Infinity) - (b.offer.price ?? Infinity)));

    // Nur Treffer in der Nähe des besten Scores zeigen — sonst rutschen
    // Zufallstreffer ("Eier" → "Laktosefreier Joghurt") in die Liste.
    const topScore = best.length ? best[0].score : 0;
    const seen = new Set();
    const kept = best.filter(({ score, offer }) => {
      if (score < topScore - 0.15) return false;
      const key = `${offer.store}|${offer.name}|${offer.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      item: it.item,
      amount: it.amount ?? null,
      unit: it.unit ?? null,
      category: it.category ?? null,
      priceable: isPriceable(it.item, it.unit),
      offers: kept.slice(0, limit).map(({ score, offer }) => ({
        store: offer.store,
        name: offer.name,
        price: offer.price,
        original_price: offer.original_price ?? null,
        discount_percent: offer.discount_percent ?? null,
        unit_price: offer.unit_price ?? null,
        unit: offer.unit ?? null,
        valid_to: offer.valid_to ?? null,
        matchScore: Math.round(score * 100) / 100,
      })),
    };
  });
}

module.exports = { normalize, stem, tokens, ingredientScore, isPriceable, matchItems, PRODUCT_TYPE_BLOCK, FLAVOR_BLOCK };
