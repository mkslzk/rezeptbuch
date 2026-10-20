/**
 * Wochenkosten eines Rezepts auf Basis der aktuellen Angebote.
 *
 * Wichtig für die Ehrlichkeit der Zahl: Angebote sind **Packungspreise**
 * („500 g Butter 1,99 €"), nicht Rezeptmengen. Deshalb summieren wir die
 * Packungspreise der Zutaten, die diese Woche im Angebot sind — das ist der
 * Betrag, den man beim Einkauf tatsächlich dafür hinlegt. Keine Hochrechnung
 * auf Gramm.
 *
 * Das Matching selbst steckt in `productMatch.cjs` (gemeinsam mit der
 * Einkaufsliste); hier wird nur gerechnet.
 */

const { getOffers, storeDisplayName } = require('./offersScraper.cjs');
const { matchItems, isPriceable } = require('./productMatch.cjs');

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

  const usable = ingredients.filter((ing) => ing && String(ing.item || '').trim());
  // Bis zu drei Treffer holen und den **günstigsten** nehmen — der beste
  // Namensscore ist nicht automatisch das beste Angebot.
  const matched = matchItems(usable, flat, { minScore, limit: 3 });

  const items = [];
  let sum = 0;
  let matchedCount = 0;
  let priceableCount = 0;

  for (const m of matched) {
    const offer = m.offers.length
      ? m.offers.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a))
      : null;
    const priceable = isPriceable(m.item, m.unit);
    if (priceable) priceableCount++;
    if (offer && priceable) {
      matchedCount++;
      sum += Number(offer.price) || 0;
    }
    items.push({
      item: m.item,
      amount: m.amount,
      unit: m.unit,
      category: m.category,
      priceable,
      score: offer ? offer.matchScore : 0,
      offer: offer ? { ...offer, store_label: storeDisplayName(offer.store) } : null,
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

module.exports = { weekCostForIngredients };
