/**
 * Open-Food-Facts-Anreicherung für Angebote.
 *
 * Zwei Stufen:
 *  1) **Offline-Matching** gegen die lokale `off.db` (298.912 Produkte, FTS5).
 *     Liefert zu einem Angebotsnamen die wahrscheinlichste Produktkennung + Kategorien.
 *     Läuft bei jedem Scrape mit (schnell, keine Netzwerkzugriffe).
 *  2) **Tag-Abruf** (`ingredients_analysis_tags`) über die OFF-API, gecacht in
 *     `rezeptbuch.db → off_analysis`. Das ist ein separater Batch-Lauf
 *     (`scripts/off-enrich.cjs`), damit der Scrape nicht auf Netzwerk wartet.
 *
 * Warum getrennt: `off.db` hat keine `ingredients_analysis_tags` (nur Kategorien/Nährwerte),
 * und die API erlaubt ~100 Anfragen/Minute. Einmal geholt, bleiben die Tags in der Cache-Tabelle.
 */

const path = require('path');
const Database = require('better-sqlite3');

const OFF_DB = path.join(__dirname, '..', 'data', 'off.db');
const DB_PATH = path.join(__dirname, '..', 'data', 'rezeptbuch.db');
const API_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const UA = 'MOCA-Homelab/1.0 (private recipe app)';

const STOPWORDS = new Set([
  'versch', 'sorten', 'packung', 'packungen', 'gebinde', 'glas', 'dose', 'flasche', 'beutel',
  'stueck', 'stück', 'stk', 'bio', 'neu', 'aktion', 'angebot', 'je', 'inkl', 'mit', 'und', 'oder',
  'der', 'die', 'das', 'im', 'an', 'aus', 'fur', 'für', 'von', 'zum', 'zur', 'als', 'auch',
]);
const UNIT_RE = /\b\d+([.,]\d+)?\s*(g|kg|ml|l|cl|stk|stück|stueck|x|%)\b/gi;

// OFF-Kategorie (englisch) → unsere Warengruppe
const CATEGORY_MAP = [
  ['tiefkuehl', ['frozen', 'ice-cream', 'ice cream', 'frozen-desserts', 'pizzas',
    'tiefkühl', 'tiefkuehl', 'eiscreme', 'speiseeis', 'pizza', 'pommes']],
  ['getraenke', ['beverages', 'drinks', 'waters', 'sodas', 'beers', 'wines', 'spirits', 'juices',
    'coffees', 'teas', 'plant-based-milk-alternatives', 'milks',
    'getränk', 'getraenk', 'wasser', 'saft', 'limonade', 'bier', 'wein', 'kaffee', 'tee', 'sprudel']],
  ['pflanzlich', ['vegan-foods', 'plant-based-foods', 'meat-analogues', 'tofu', 'tempeh', 'seitan',
    'plant-based-beverages', 'vegetarian-foods',
    'fleischersatz', 'vegane lebensmittel', 'vegetarische lebensmittel', 'pflanzliche']],
  ['fleisch-fisch', ['meats', 'fish', 'seafood', 'poultry', 'sausages', 'charcuterie', 'ham',
    'prepared-meats', 'fishes', 'smoked-fishes',
    'fleisch', 'wurst', 'fisch', 'geflügel', 'gefluegel', 'schinken']],
  ['milch-eier', ['dairies', 'cheeses', 'yogurts', 'milks', 'butters', 'creams', 'eggs',
    'fermented-milk-products', 'fresh-cheeses', 'ripened-cheeses',
    'milchprodukt', 'käse', 'kaese', 'joghurt', 'eier', 'quark', 'sahne', 'molkerei']],
  ['brot-backwaren', ['breads', 'bakery', 'pastries', 'cakes', 'viennoiseries', 'biscuits?',
    'brot', 'backwaren', 'brötchen', 'broetchen', 'kuchen', 'gebäck', 'gebaeck']],
  ['suesses-snacks', ['snacks', 'sweet-snacks', 'chocolates', 'candies', 'confectioneries', 'biscuits',
    'crisps', 'salty-snacks', 'nuts', 'dried-fruits',
    'süßwaren', 'suesswaren', 'schokolade', 'keks', 'bonbon', 'salziges']],
  ['vorrat', ['cereals', 'pastas', 'rices', 'oils', 'vinegars', 'sauces', 'condiments', 'canned',
    'legumes', 'flours', 'sugars', 'honeys', 'jams', 'spices', 'soups', 'prepared-meals',
    'konserven', 'nudeln', 'reis', 'öl', 'oel', 'gewürz', 'gewuerz', 'fertiggericht', 'suppe', 'sauce', 'müsli', 'muesli']],
  ['obst-gemuese', ['fruits', 'vegetables', 'fresh-fruits', 'fresh-vegetables', 'salads',
    'fruits-and-vegetables-based-foods',
    'obst', 'gemüse', 'gemuese']],
  ['drogerie-haushalt', ['hygiene', 'cleaning', 'cosmetics', 'body-care', 'hair-care', 'oral-care',
    'household-products', 'laundry', 'soaps',
    'drogerie', 'haushalt', 'körperpflege', 'koerperpflege', 'waschmittel', 'nahrungsergänzung',
    'nahrungsergaenzung', 'kosmetik', 'putzmittel', 'hygieneartikel']],
  ['nonfood', ['pet-foods', 'non-food-products', 'kitchen-utensils', 'furniture', 'electronics',
    'clothing', 'toys', 'garden',
    'tiernahrung', 'tierfutter', 'möbel', 'moebel', 'elektronik', 'kleidung', 'spielwaren',
    'büro', 'buero', 'gartenartikel', 'haustier']],
];

let offDb = null;
let lookupCache = new Map();     // normalisierter Name → Match-Objekt (pro Prozess)

function getOffDb() {
  if (!offDb) {
    try {
      offDb = new Database(OFF_DB, { readonly: true, fileMustExist: true });
    } catch (e) {
      console.warn('  ⚠️ OFF-Datenbank nicht verfügbar:', e.message);
      offDb = null;
    }
  }
  return offDb;
}

/** Zerlegt einen Produktnamen in aussagekräftige Suchbegriffe. */
function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(UNIT_RE, ' ')
    .replace(/[^a-zäöü0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function escapeFts(word) {
  return '"' + String(word).replace(/"/g, '') + '"';
}

/**
 * Sucht das wahrscheinlichste OFF-Produkt zu einem Angebotsnamen.
 * @param {string} name
 * @param {string} [brand]
 * @param {{minScore?:number}} [opts]
 * @returns {{code:string, productName:string, brands:string, categoriesEn:string, score:number}|null}
 */
function findMatch(name, brand, { minScore = 0.5 } = {}) {
  const db = getOffDb();
  if (!db) return null;

  const key = `${String(name || '').toLowerCase()}|${String(brand || '').toLowerCase()}`;
  if (lookupCache.has(key)) return lookupCache.get(key);

  const tk = tokens(name);
  if (tk.length === 0) { lookupCache.set(key, null); return null; }

  const query = tk.slice(0, 5).map(escapeFts).join(' OR ');
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT p.code, p.product_name_de, p.product_name, p.brands, p.categories_en, p.categories
      FROM products_fts f JOIN products p ON p.rowid = f.rowid
      WHERE products_fts MATCH ?
      LIMIT 25
    `).all(query);
  } catch {
    rows = [];
  }

  const nameNorm = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const brandNorm = String(brand || '').toLowerCase().trim();
  let best = null;
  let bestScore = 0;

  for (const r of rows) {
    const pname = r.product_name_de || r.product_name || '';
    const pt = new Set(tokens(pname));
    if (pt.size === 0) continue;
    const st = new Set(tk);
    let inter = 0;
    for (const w of st) if (pt.has(w)) inter++;
    if (inter === 0) continue;

    let score = inter / (st.size + pt.size - inter);          // Jaccard
    // Teilmengen bonus: "Knoppers Minis" ↔ "Knoppers" soll nicht an der Jaccard-Formel scheitern
    const containment = inter / Math.min(st.size, pt.size);
    score = Math.max(score, containment * 0.95);
    if (pname.toLowerCase().replace(/\s+/g, ' ').trim() === nameNorm) score = 1;
    // Markenübereinstimmung ist ein starkes Signal
    if (brandNorm && String(r.brands || '').toLowerCase().includes(brandNorm)) score = Math.min(1, score + 0.15);

    if (score > bestScore) {
      bestScore = score;
      best = {
        code: r.code,
        productName: pname,
        brands: r.brands || null,
        categoriesEn: [r.categories_en, r.categories].filter(Boolean).join(', ') || null,
        score: Math.round(score * 100) / 100,
        overlap: inter,
      };
    }
  }

  const result = best && bestScore >= minScore ? best : null;
  lookupCache.set(key, result);
  return result;
}

/** Wortgrenzen-Test für kurze Hinweise — sonst trifft "wein" auch "Weintrauben". */
function hintMatches(text, hint) {
  if (hint.length > 4) return text.includes(hint);
  const re = new RegExp(`(^|[^a-zäöüß0-9])${hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zäöüß0-9]|$)`);
  return re.test(text);
}

/** Leitet aus OFF-Kategorien (englisch + deutsch) unsere Warengruppe ab. */
function categoryFromOffCategories(categoriesEn) {
  const text = String(categoriesEn || '').toLowerCase();
  if (!text) return null;
  for (const [category, hints] of CATEGORY_MAP) {
    for (const hint of hints) {
      if (hintMatches(text, hint)) return category;
    }
  }
  return null;
}

// ------------------------------------------------------------ Tag-Cache (rezeptbuch.db)

let cacheDb = null;
function getCacheDb() {
  if (!cacheDb) cacheDb = new Database(DB_PATH);
  return cacheDb;
}

function ensureAnalysisTable() {
  const db = getCacheDb();
  db.exec(`CREATE TABLE IF NOT EXISTS off_analysis (
    code TEXT PRIMARY KEY,
    product_name TEXT,
    vegan INTEGER,
    vegetarian INTEGER,
    non_vegan INTEGER,
    nova_group INTEGER,
    fetched_at TEXT NOT NULL
  )`);
  return db;
}

function getCachedAnalysis(code) {
  try {
    const db = ensureAnalysisTable();
    return db.prepare('SELECT * FROM off_analysis WHERE code = ?').get(code) || null;
  } catch {
    return null;
  }
}

/**
 * Holt `ingredients_analysis_tags` für einen Code (nur wenn nicht gecacht).
 * @returns {Promise<{code:string, vegan:boolean, vegetarian:boolean, nonVegan:boolean}|null>}
 */
async function fetchAnalysis(code, { retries = 2 } = {}) {
  const cached = getCachedAnalysis(code);
  if (cached) return cached;

  const url = `${API_BASE}/${encodeURIComponent(code)}.json?fields=code,product_name,ingredients_analysis_tags,nova_group`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      // OFF drosselt anonyme Bursts mit 429 — wir warten und versuchen es erneut
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 8;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          continue;
        }
        return { rateLimited: true };
      }
      if (!res.ok) return null;
      const data = await res.json();
      const p = data.product || {};
      const tags = Array.isArray(p.ingredients_analysis_tags) ? p.ingredients_analysis_tags : [];
      const row = {
        code,
        product_name: p.product_name || null,
        vegan: tags.includes('en:vegan') ? 1 : 0,
        vegetarian: tags.includes('en:vegetarian') ? 1 : 0,
        non_vegan: tags.includes('en:non-vegan') ? 1 : 0,
        nova_group: p.nova_group ?? null,
        fetched_at: new Date().toISOString(),
      };
      const db = ensureAnalysisTable();
      db.prepare(`INSERT OR REPLACE INTO off_analysis
        (code, product_name, vegan, vegetarian, non_vegan, nova_group, fetched_at)
        VALUES (@code, @product_name, @vegan, @vegetarian, @non_vegan, @nova_group, @fetched_at)`).run(row);
      return row;
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return null;
}

/** Ernährungseinstufung direkt aus off.db (Spalten vegan/vegetarian/non_vegan, seit Dump-Rebuild). */
let dietStmt = null;
function dietFromCode(code) {
  const db = getOffDb();
  if (!db) return null;
  try {
    if (!dietStmt) {
      dietStmt = db.prepare('SELECT vegan, vegetarian, non_vegan FROM products WHERE code = ?');
    }
    const row = dietStmt.get(code);
    if (!row) return null;
    if (row.vegan) return 'vegan';
    if (row.vegetarian && !row.non_vegan) return 'vegetarisch';
    if (row.non_vegan) return 'nicht-vegan';
    return null;
  } catch {
    // Alte off.db ohne diese Spalten → Fallback auf den API-Cache
    return null;
  }
}

/** Ernährungseinstufung aus gecachten OFF-Tags (ohne Netzwerk). */
function dietFromCachedAnalysis(code) {
  const a = getCachedAnalysis(code);
  if (!a) return null;
  if (a.vegan) return 'vegan';
  if (a.vegetarian && !a.non_vegan) return 'vegetarisch';
  if (a.non_vegan) return 'nicht-vegan';
  return null;
}

module.exports = {
  findMatch,
  categoryFromOffCategories,
  fetchAnalysis,
  getCachedAnalysis,
  dietFromCode,
  dietFromCachedAnalysis,
  ensureAnalysisTable,
  tokens,
  OFF_DB,
};
