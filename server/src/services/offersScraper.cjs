const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const marktguruApi = require('./marktguruApi.cjs');
const kaufdaApi = require('./kaufdaApi.cjs');
const { classifyOffer } = require('./offerClassifier.cjs');
const offLookup = require('./offLookup.cjs');

// Load PLZ and EDEKA market ID from offers-config.json at runtime
function getConfig() {
  try {
    const configPath = path.join(__dirname, '../data/offers-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return { plz: '56377', edekaMarketId: '' };
}
const config = getConfig();
const PLZ = config.plz || '56377';
// NORMA bleibt als einzige Direktquelle (Marktguru/Kaufda führen NORMA nicht strukturiert)
const NORMA_URL = 'https://www.norma-online.de/de/angebote/';

//===============================================================
// Progress tracking (in-memory; client polls /api/offers/scrape/progress)
//===============================================================
const PROGRESS_TTL_MS = 5 * 60 * 1000;  // Auto-clear after 5 min

let currentProgress = null;

function setProgress(p) {
  currentProgress = { timestamp: Date.now(), ...p };
}

function getProgress() {
  if (!currentProgress) return null;
  if (['done', 'error'].includes(currentProgress.status) &&
      Date.now() - currentProgress.timestamp > PROGRESS_TTL_MS) {
    currentProgress = null;
    return null;
  }
  return currentProgress;
}

function clearProgress() { currentProgress = null; }
function getExcludedStores() {
  try {
    const liveConfig = getConfig();
    return liveConfig.excludedStores || [];
  } catch {
    return [];
  }
}
const STORE_EXCLUDED = (storeKey) => getExcludedStores().includes(storeKey);

// Anzeigename je Kette (Marktguru-URLs + API-Namen)
const MARKTGURU_STORE_URLS = {
  'lidl': { name: 'Lidl', url: 'https://www.marktguru.de/r/lidl' },
  'penny': { name: 'PENNY', url: 'https://www.marktguru.de/r/penny' },
  'rewe': { name: 'REWE', url: 'https://www.marktguru.de/r/rewe' },
  'kaufland': { name: 'Kaufland', url: 'https://www.marktguru.de/r/kaufland' },
  'netto-marken-discount': { name: 'Netto Marken-Discount', url: 'https://www.marktguru.de/r/netto-marken-discount' },
  'nahkauf': { name: 'Nahkauf', url: 'https://www.marktguru.de/r/nahkauf' },
  'toom': { name: 'Toom Baumarkt', url: 'https://www.marktguru.de/r/toom-baumarkt' },
  'hornbach': { name: 'Hornbach', url: 'https://www.marktguru.de/r/hornbach' },
  'obi': { name: 'OBI', url: 'https://www.marktguru.de/r/obi' },
  'hellweg': { name: 'Hellweg', url: 'https://www.marktguru.de/r/hellweg' },
  'kabs': { name: 'KABS Polsterwelt', url: 'https://www.marktguru.de/r/kabs-polsterwelt' },
  'xxx Lutz': { name: 'XXXLUTZ', url: 'https://www.marktguru.de/r/xxxl' },
  'sb-moebel-boss': { name: 'SB-Möbel Boss', url: 'https://www.marktguru.de/r/sb-moebel-boss' },
  'opti-wohnwelt': { name: 'Opti Wohnwelt', url: 'https://www.marktguru.de/r/opti-wohnwelt' },
  'opti-megastore': { name: 'Opti Megastore', url: 'https://www.marktguru.de/r/opti-megastore' },
  'moebel-inhofer': { name: 'Möbel Inhofer', url: 'https://www.marktguru.de/r/moebel-inhofer' },
};

// ============================================================
// API-PIPELINE (Phase A, 2026-10-19): Marktguru-JSON statt Browser
// ============================================================
// Anzeigenamen für Ketten, die nur als Marktguru-`uniqueName` existieren
const API_STORE_NAMES = {
  'aldi-sued': 'ALDI SÜD',
  'aldi-nord': 'ALDI NORD',
  'edeka': 'EDEKA',
  'netto-marken-discount': 'Netto Marken-Discount',
  'netto-supermarkt': 'Netto (rot)',
  'marktkauf': 'Marktkauf',
  'famila': 'famila',
  'combi': 'Combi',
  'v-markt': 'V-Markt',
  'globus': 'Globus',
  'tegut': 'tegut',
  'e-center': 'E-Center',
  'metro': 'METRO',
  'denns-biomarkt': 'denns BioMarkt',
  'rossmann': 'Rossmann',
  'dm': 'dm-drogerie markt',
  'mueller': 'Müller',
};

// Ketten für den API-Sweep, falls offers-config.json nichts vorgibt (Lebensmittel-Fokus)
const DEFAULT_API_STORES = [
  'lidl', 'penny', 'rewe', 'kaufland', 'netto-marken-discount', 'aldi-sued', 'edeka',
];

// Phase B: Kaufda deckt zusätzlich Ketten ab, die Marktguru nicht (oder nur mit Alt-Treffern) führt
// und liefert flächendeckend echte Streichpreise (Kaufland 278/484, Lidl 207/439).
const DEFAULT_KAUFDA_STORES = [
  'lidl', 'kaufland', 'rewe', 'edeka', 'penny', 'aldi-sued', 'aldi-nord',
  'netto-marken-discount', 'netto-supermarkt', 'norma', 'nahkauf', 'marktkauf',
  'famila', 'combi', 'v-markt', 'globus', 'tegut', 'e-center', 'metro', 'denns-biomarkt',
];

function storeDisplayName(key) {
  return (MARKTGURU_STORE_URLS[key] && MARKTGURU_STORE_URLS[key].name)
    || API_STORE_NAMES[key]
    || key;
}
let cachedOffers = {};
let lastUpdated = null;
// ============================================================
// MUTUAL SCRAPER LOCK — prevents /scrape and /scrape/marktguru
// from running simultaneously (otherwise they clobber each
// other's cachedOffers + lastUpdated).
// ============================================================
let currentScrapePromise = null;
let currentScrapeError = null;
// ============================================================
// NORMA HTML SCRAPER — replaces flipbook+OCR for NORMA.
// NORMA's /de/angebote/ landing page lists current-week category URLs
// (ab-montag-DD.MM.YY/, ab-mittwoch-DD.MM.YY/, ab-freitag-DD.MM.YY/,
// obst-und-gemuese/). Each one is server-rendered HTML with
// <article class="produktBoxContainer"> entries that contain:
//   - <h3 class="produktBox-txt-headline">product name</h3>
//   - <strong class="supplier">brand</strong>
//   - <li class="produktBox-cont-wrapper-price"><span aria-label="1,19 Euro">1,19</span></li>
//   - <li class="produktBox-txt-price">1 kg = 11,90</li>  (optional reference price)
// No JS rendering, no Akamai block, no OCR — ~200+ offers across ~5 pages.
// ============================================================
async function scrapeNormaHtml(storeKey, landingUrl) {
  try {
    // 1) Fetch landing page to discover weekly offer URLs.
    const landingHtml = await fetchWithRetry(landingUrl, 2);
    if (!landingHtml) {
      console.warn(`  ⚠️ NORMA landing page fetch failed`);
      return [];
    }
    const $landing = cheerio.load(landingHtml);
    const weeklyUrls = new Set();
    $landing('a[href*="/de/angebote/"]').each((_, el) => {
      const href = $landing(el).attr('href') || '';
      // Match: ab-montag, ab-mittwoch, ab-freitag, obst-und-gemuese
      if (/\/de\/angebote\/(ab-(montag|mittwoch|freitag|donnerstag|dienstag|samstag|sonntag)|obst-und-gemuese)\b/i.test(href)) {
        const cleaned = href.split('?')[0].split('#')[0];
        // Make absolute
        weeklyUrls.add(cleaned.startsWith('http') ? cleaned : `https://www.norma-online.de${cleaned}`);
      }
    });
    const urls = [...weeklyUrls];
    console.log(`  📋 ${storeKey}: discovered ${urls.length} weekly pages`);

    if (urls.length === 0) {
      console.warn(`  ⚠️ NORMA: no weekly URLs found on landing page`);
      return [];
    }

    // 2) Fetch each weekly page in parallel and extract offers.
    const allOffers = [];
    const fetchResults = await Promise.allSettled(
      urls.map(u => fetchWithRetry(u, 2))
    );

    for (let i = 0; i < urls.length; i++) {
      const pageUrl = urls[i];
      const result = fetchResults[i];
      if (result.status !== 'fulfilled' || !result.value) {
        console.warn(`  ⚠️ NORMA ${pageUrl.split('/').slice(-2, -1)[0]}: fetch failed`);
        continue;
      }
      const offers = parseNormaPage(result.value, storeKey);
      // Gültigkeitsbeginn steckt in der URL: .../ab-montag,-26.10.26/...
      const weekStart = parseNormaWeekStart(pageUrl);
      if (weekStart) {
        for (const o of offers) {
          o.valid_from = weekStart;      // ISO-UTC (lokale Mitternacht, DST-korrekt)
          o.valid_to = null;             // NORMA nennt kein Ende → ehrlich leer
          o.upcoming = Date.parse(o.valid_from) > Date.now();
        }
      }
      console.log(`  📋 ${pageUrl.split('/').slice(-2, -1)[0]}: ${offers.length} offers`);
      allOffers.push(...offers);
    }

    // 3) Dedupe by name + price.
    const seen = new Set();
    const unique = [];
    for (const o of allOffers) {
      const key = `${o.name.toLowerCase().replace(/\s+/g, ' ').trim()}|${o.price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(o);
    }
    console.log(`  ✅ ${storeKey}: ${unique.length} unique offers (${allOffers.length} raw)`);
    return unique;
  } catch (e) {
    console.warn(`  ⚠️ NORMA scraper: ${e.message}`);
    return [];
  }
}

/**
 * Liest den Gültigkeitsbeginn aus einer NORMA-Wochen-URL.
 * Beispiel: ".../ab-montag,-26.10.26/..." → ISO-Zeitstempel (lokale Mitternacht).
 */
function parseNormaWeekStart(url) {
  const m = String(url || '').match(/ab-[a-z]+,-(\d{2})\.(\d{2})\.(\d{2})/i);
  if (!m) return null;
  const [, dd, mm, yy] = m;
  const d = new Date(Number(`20${yy}`), Number(mm) - 1, Number(dd), 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Parse a single NORMA weekly page HTML into offers.
function parseNormaPage(html, storeKey) {
  if (!html) return [];
  const $ = cheerio.load(html);
  const offers = [];

  $('article.produktBoxContainer').each((_, el) => {
    const $el = $(el);
    // Name from <h3 class="produktBox-txt-headline">
    const name = $el.find('h3.produktBox-txt-headline').first().text().trim();
    if (!name || name.length < 2 || name.length > 120) return;

    // Price: prefer aria-label on the price span (most reliable),
    // fallback to first price-shaped number in the article text.
    let price = null;
    const priceSpan = $el.find('li.produktBox-cont-wrapper-price span').first();
    if (priceSpan.length) {
      const ariaLabel = priceSpan.attr('aria-label') || '';
      // aria-label looks like "1,19 Euro" or "3,79 Euro"
      const ariaMatch = ariaLabel.match(/(\d+[.,]\d{2})/);
      if (ariaMatch) {
        price = parseFloat(ariaMatch[1].replace(',', '.'));
      }
      if (!price) {
        const textMatch = (priceSpan.text() || '').match(/(\d+[.,]\d{2})/);
        if (textMatch) price = parseFloat(textMatch[1].replace(',', '.'));
      }
    }
    if (!price) {
      const text = $el.text();
      const m = text.match(/(\d+[.,]\d{2})\s*€/);
      if (m) price = parseFloat(m[1].replace(',', '.'));
    }

    if (!price || price <= 0 || price >= 200) return;

    // Optional reference price (e.g. "1 kg = 3,79") — not the sale price, skip.
    // Sale price is what produktBox-cont-wrapper-price shows.

    offers.push({
      name: name.replace(/\*/g, '').trim().substring(0, 80),
      price,
      original_price: null,
      store: storeKey
    });
  });

  return offers;
}
async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) return await res.text();
      if (i < retries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return null;
}
// ============================================================
// FUZZY MATCHING
// ============================================================
const STOPWORDS = new Set(['der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'mit', 'von', 'für', 'zu', 'am', 'im', 'an', 'auf', 'bis', 'nach', 'über', 'aus', 'bei', 'ist', 'sind', 'war', 'waren']);

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\bkg\b/g, 'kilogramm').replace(/\bl\b/g, 'liter').replace(/\bstück\b/g, 'stueck')
    .replace(/\bpkg\b/g, 'packung').replace(/\bg\b/g, 'gramm')
    .replace(/\d+/g, '#')
    .split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w)).join(' ');
}

function levenshteinSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lenA = a.length, lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;
  const matrix = Array(lenA + 1).fill(null).map(() => Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
    }
  }
  return 1 - matrix[lenA][lenB] / Math.max(lenA, lenB);
}

function fuzzyMatch(itemName, offerName) {
  const normItem = normalizeText(itemName);
  const normOffer = normalizeText(offerName);
  if (!normItem || !normOffer) return 0;
  
  const itemWords = normItem.split(/\s+/).filter(w => w.length > 2);
  const offerWords = normOffer.split(/\s+/).filter(w => w.length > 2);
  if (itemWords.length === 0 || offerWords.length === 0) return 0;
  
  let score = 0;
  for (const iw of itemWords) {
    let best = 0;
    for (const ow of offerWords) {
      if (ow.includes(iw) || iw.includes(ow)) {
        best = Math.max(best, 2);
      } else {
        best = Math.max(best, levenshteinSimilarity(iw, ow));
      }
    }
    score += best;
  }
  return score / itemWords.length;
}

function matchItemsToOffers(shoppingItems) {
  if (!shoppingItems || shoppingItems.length === 0) return [];
  
  const results = [];
  for (const item of shoppingItems) {
    if (item.checked) continue;
    const matchedOffers = [];
    for (const [store, offers] of Object.entries(cachedOffers)) {
      for (const offer of offers) {
        const score = fuzzyMatch(item.item, offer.name);
        if (score > 0.3) {
          matchedOffers.push({ store, name: offer.name, price: offer.price, matchScore: score });
        }
      }
    }
    matchedOffers.sort((a, b) => b.matchScore - a.matchScore || a.price - b.price);
    if (matchedOffers.length > 0) {
      results.push({
        item: item.item, amount: item.amount, unit: item.unit,
        category: item.category, store: item.store,
        bestOffers: matchedOffers.slice(0, 3)
      });
    }
  }
  return results;
}

function getOffers() {
  return { offers: cachedOffers, lastUpdated };
}

// ============================================================
// PERSISTENZ: letzten Scrape-Stand aus der DB zurückholen
// ============================================================
/**
 * Füllt den In-Memory-Cache aus dem letzten persistierten Scrape je Store.
 * Damit überlebt der Angebote-Stand einen Neustart, bis ein neuer Scrape läuft.
 * Quelle: rezeptbuch.db (offer_scrape_records + offer_history).
 * @returns {{stores:number, offers:number, lastUpdated:string|null}}
 */
function hydrateOffersFromHistory({ waveWindowMs = 15 * 60 * 1000 } = {}) {
  const dbPath = path.join(__dirname, '..', 'data', 'rezeptbuch.db');
  if (!fs.existsSync(dbPath)) return { stores: 0, offers: 0, lastUpdated: null };

  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    // Nur der jüngste Scrape-DURCHLAUF wird wiederhergestellt — nicht der
    // jüngste Scrape pro Store. Sonst mischen sich z. B. die Mai-Marktguru-Daten
    // (hellweg, obi, toom …) unter die aktuellen Direkt-Angebote und alte
    // Preise sähen aus wie heute gültige.
    const recent = db.prepare(`
      SELECT id, store, scraped_at
      FROM offer_scrape_records
      WHERE success = 1 AND offer_count > 0
      ORDER BY scraped_at DESC, id DESC
      LIMIT 500
    `).all();

    if (recent.length === 0) return { stores: 0, offers: 0, lastUpdated: null };

    const anchor = Date.parse(recent[0].scraped_at);
    const newestPerStore = new Map();   // store -> scrape_id (recent ist DESC)
    for (const rec of recent) {
      const t = Date.parse(rec.scraped_at);
      if (!Number.isFinite(t) || anchor - t > waveWindowMs) continue;
      if (!newestPerStore.has(rec.store)) newestPerStore.set(rec.store, rec.id);
    }

    const ids = [...newestPerStore.values()];
    const rows = db.prepare(`
      SELECT h.store, h.product_name, h.price, h.url, h.original_price,
             h.offer_id, h.source_url, h.scraped_at,
             h.brand, h.valid_from, h.valid_to, h.discount_percent, h.old_price_source,
             h.unit_price, h.unit, h.category, h.description, h.category_label, h.diet_tag, h.off_code
      FROM offer_history h
      WHERE h.scrape_id IN (${ids.map(() => '?').join(',')})
      ORDER BY h.store, h.product_name
    `).all(...ids);

    if (rows.length === 0) return { stores: 0, offers: 0, lastUpdated: null };

    const restored = {};
    let newest = null;
    for (const row of rows) {
      if (!restored[row.store]) restored[row.store] = [];
      restored[row.store].push({
        name: row.product_name,
        price: row.price,
        original_price: row.original_price ?? null,
        url: row.url || undefined,
        offer_id: row.offer_id || null,
        source_url: row.source_url || null,
        store: row.store,
        brand: row.brand || null,
        valid_from: row.valid_from || null,
        valid_to: row.valid_to || null,
        discount_percent: row.discount_percent ?? null,
        old_price_source: row.old_price_source || null,
        unit_price: row.unit_price ?? null,
        unit: row.unit || null,
        category: row.category || null,
        description: row.description || null,
        category_label: row.category_label || null,
        diet_tag: row.diet_tag || null,
        is_food: row.category ? !['nonfood', 'drogerie-haushalt'].includes(row.category) : true,
        off_code: row.off_code || null,
        upcoming: row.valid_from ? Date.parse(row.valid_from) > Date.now() : false,
      });
      if (!newest || row.scraped_at > newest) newest = row.scraped_at;
    }

    cachedOffers = restored;
    lastUpdated = newest;
    return { stores: Object.keys(restored).length, offers: rows.length, lastUpdated: newest };
  } finally {
    db.close();
  }
}

/**
 * Scrape + Persistenz in EINEM Schritt — der gemeinsame Pfad für die API-Route,
 * den Auto-Scrape beim Start und alles, was später dazukommt. Verhindert, dass
 * Scrape-Ergebnisse je nach Aufrufer mal in der DB landen und mal nicht.
 *
 * Phase A (2026-10-19): Quelle ist die Marktguru-JSON-API (± NORMA direkt).
 * `source` dient nur noch als Label in der Historie.
 * @returns {Promise<{stores:number, offers:number, durationMs:number}>}
 */
async function scrapeAndPersist(source = 'marktguru') {
  const { byStore, stats, durationMs } = await scrapeAllSources(source);
  const { saveScrapeRecord, saveOffers } = require('../routes/offersHistory.cjs');
  const dbSource = source === 'direct' ? 'marktguru' : source;

  let total = 0;
  let stores = 0;
  for (const [store, offers] of Object.entries(byStore)) {
    const per = stats.perStore[store] || {};
    // Quelle je Store bestimmen: reine Kaufda-Ketten sollen auch als solche in der Historie stehen
    const allKaufda = offers.length > 0 && offers.every((o) => o.source === 'kaufda');
    const recordSource = allKaufda ? 'kaufda' : dbSource;
    const record = saveScrapeRecord(store, offers.length, !per.error, per.error || null, recordSource, per.ms ?? null);
    stores++;
    if (offers.length > 0) {
      saveOffers(record.lastInsertRowid, store, offers, recordSource);
      total += offers.length;
    }
  }

  console.log(`💾 Persistiert: ${total} Angebote aus ${stores} Ketten (${(durationMs / 1000).toFixed(1)} s)`);
  return { stores, offers: total, durationMs };
}

// ============================================================
// PHASE A: Sweep über die Marktguru-API + NORMA direkt
// ============================================================
/** Ketten für den API-Sweep (Config → Default), ohne ausgeschlossene. */
function getApiRetailers() {
  const live = getConfig();
  const configured = Array.isArray(live.marktguruStores) && live.marktguruStores.length
    ? live.marktguruStores
    : DEFAULT_API_STORES;
  return configured.filter((k) => !STORE_EXCLUDED(k));
}

function historyLookupFor(storeKey) {
  try {
    const { getLatestPrices } = require('../routes/offersHistory.cjs');
    const map = getLatestPrices(storeKey);
    return map instanceof Map ? map : null;
  } catch (e) {
    return null;
  }
}

/** Wendet die Historien-Regel auch auf Nicht-API-Quellen (NORMA) an. */
function applyHistoryFallback(offer, history) {
  if (!history || history.size === 0) return false;
  if (offer.original_price) return false;
  const key = String(offer.name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const prev = history.get(key);
  if (!prev || !prev.price || !offer.price || prev.price <= offer.price) return false;
  // Nur frische Historien-Preise (Default 35 Tage) — sonst würden Monatspreise als "alt" gelten.
  const maxAgeDays = Number(process.env.MOCA_HISTORY_MAX_AGE_DAYS || 35);
  const seenAt = Date.parse(prev.scrapedAt);
  if (!Number.isFinite(seenAt) || seenAt < Date.now() - maxAgeDays * 24 * 60 * 60 * 1000) return false;
  const pct = marktguruApi.discountPercent(offer.price, prev.price);
  if (pct === null) return false;   // > 80 % → Datenfehler, nicht verwenden
  offer.original_price = Math.round(prev.price * 100) / 100;
  offer.old_price_source = 'history';
  offer.discount_percent = pct;
  return true;
}

/** Ketten für den Kaufda-Sweep (Config → Default), ohne ausgeschlossene bzw. deaktivierte. */
function getKaufdaStores() {
  const live = getConfig();
  if (live.kaufdaEnabled === false) return [];
  const configured = Array.isArray(live.kaufdaStores) && live.kaufdaStores.length
    ? live.kaufdaStores
    : DEFAULT_KAUFDA_STORES;
  return configured.filter((k) => !STORE_EXCLUDED(k));
}

/** Vergleichsschlüssel für Produktnamen (Buchstaben/Ziffern, Whitespace normalisiert). */
function offerNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Führt Kaufda-Ergebnisse mit dem Marktguru/NORMA-Bestand zusammen.
 *  - Kette existiert schon → nur fehlende Streichpreise ergänzen (keine Dubletten)
 *  - Kette ist neu          → komplett übernehmen (Kaufda deckt Ketten ab, die Marktguru nicht führt)
 *
 * Sicherheitsregeln gegen falsche Streichpreise:
 *  - Der Kaufda-Streichpreis muss echt über dem Zielpreis liegen (min. 2 % Abstand) —
 *    sonst würde der Preis einer anderen Packungsgröße übernommen.
 *  - Fuzzy-Match nur ab 0.92 Ähnlichkeit; exakte Namensgleichheit hat Vorrang.
 *  - `discount_percent` wird aus Zielpreis und altem Preis NEU berechnet, nie kopiert.
 * @returns {{enriched:number, added:number, addedStores:string[], exact:number, fuzzy:number, rejected:number}}
 */
function mergeKaufdaOffers(byStore, kaufdaByStore, stats) {
  let enriched = 0;
  let added = 0;
  let exact = 0;
  let fuzzy = 0;
  let rejected = 0;
  const addedStores = [];

  for (const [storeKey, kdOffers] of Object.entries(kaufdaByStore || {})) {
    if (!Array.isArray(kdOffers) || kdOffers.length === 0) continue;
    const existing = byStore[storeKey];
    const per = stats.perStore[storeKey] || (stats.perStore[storeKey] = {});

    if (Array.isArray(existing) && existing.length > 0) {
      const index = new Map();
      for (const o of existing) {
        const key = offerNameKey(o.name);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(o);
      }
      let storeEnriched = 0;
      let storeExact = 0;
      let storeFuzzy = 0;
      let storeRejected = 0;

      for (const k of kdOffers) {
        if (!k.original_price) continue;
        const key = offerNameKey(k.name);
        let target = null;
        let isExact = false;

        // 1) exakter Name, aber nur wenn der Preis plausibel ist (gleiche Packungsgröße)
        for (const cand of index.get(key) || []) {
          if (k.original_price > (cand.price * 1.02) && !cand.original_price) { target = cand; isExact = true; break; }
        }
        // 2) Fuzzy nur mit sehr hoher Ähnlichkeit
        if (!target) {
          let best = null;
          let bestScore = 0;
          for (const o of existing) {
            if (o.original_price) continue;
            const s = fuzzyMatch(k.name, o.name);
            if (s > bestScore) { bestScore = s; best = o; }
          }
          if (best && bestScore >= 0.92 && k.original_price > best.price * 1.02) target = best;
        }

        if (!target) { storeRejected++; continue; }

        const pct = marktguruApi.discountPercent(target.price, k.original_price);
        if (pct === null) { storeRejected++; continue; }

        target.original_price = k.original_price;
        target.discount_percent = pct;
        target.old_price_source = k.old_price_source || 'kaufda';
        // Kategorie/Beschreibung nur ergänzen, nie überschreiben (Marktguru liefert keine)
        if (!target.category && k.category) target.category = k.category;
        storeEnriched++;
        if (isExact) storeExact++; else storeFuzzy++;
      }

      per.kaufdaEnriched = storeEnriched;
      per.kaufdaExact = storeExact;
      per.kaufdaFuzzy = storeFuzzy;
      per.kaufdaRejected = storeRejected;
      per.kaufdaOffers = kdOffers.length;
      per.strikePrice = existing.filter((o) => o.original_price).length;
      enriched += storeEnriched;
      exact += storeExact;
      fuzzy += storeFuzzy;
      rejected += storeRejected;
    } else {
      byStore[storeKey] = kdOffers;
      addedStores.push(storeKey);
      added += kdOffers.length;
      stats.stores++;
      stats.total += kdOffers.length;
      per.total = kdOffers.length;
      per.live = kdOffers.length;
      per.strikePrice = kdOffers.filter((o) => o.original_price).length;
      per.source = 'kaufda';
      per.ms = per.ms || 0;
    }
  }

  return { enriched, added, addedStores, exact, fuzzy, rejected };
}

/**
 * Holt alle Angebote über die API-Pipeline (Marktguru) plus NORMA direkt.
 * Aktualisiert cachedOffers/lastUpdated und den Progress-Status.
 * @returns {Promise<{byStore:Object, stats:Object, durationMs:number}>}
 */
async function scrapeAllSources(source = 'marktguru') {
  if (currentScrapePromise) throw new Error('Ein Scrape läuft bereits');

  currentScrapePromise = (async () => {
    const startTime = Date.now();
    const retailers = getApiRetailers();
    const includeNorma = !STORE_EXCLUDED('norma');
    const totalSteps = retailers.length + (includeNorma ? 1 : 0);
    let step = 0;

    setProgress({
      stage: 'fetching', status: 'running',
      message: `Lade ${totalSteps} Ketten über die Marktguru-API…`,
      progress: 0, currentStore: 0, totalStores: totalSteps, source,
    });

    const { byStore, stats } = await marktguruApi.sweep(retailers, PLZ, {
      historyLookup: historyLookupFor,
      onStore: (storeKey, s) => {
        step++;
        setProgress({
          stage: 'fetching', status: 'running',
          message: `${storeDisplayName(storeKey)} — ${s.live} Angebote`,
          progress: Math.round((step / totalSteps) * 100),
          currentStore: step, totalStores: totalSteps,
          currentStoreName: storeDisplayName(storeKey), source,
        });
      },
    });

    // NORMA: Marktguru führt dort nur Non-Food-Altreffer → eigener HTML-Scraper bleibt
    if (includeNorma) {
      const t0 = Date.now();
      setProgress({
        stage: 'fetching', status: 'running',
        message: 'NORMA — wöchentliche Angebotsseiten…',
        progress: Math.round((step / totalSteps) * 100),
        currentStore: step, totalStores: totalSteps,
        currentStoreName: 'NORMA', source,
      });
      try {
        const history = historyLookupFor('norma');
        const offers = await scrapeNormaHtml('norma', NORMA_URL);
        let fromHistory = 0;
        for (const o of offers) {
          if (applyHistoryFallback(o, history)) fromHistory++;
        }
        byStore['norma'] = offers;
        stats.perStore['norma'] = {
          total: offers.length, got: offers.length, live: offers.length, expired: 0,
          strikePrice: offers.filter((o) => o.original_price).length,
          fromHistory, ms: Date.now() - t0, source: 'direct',
        };
        stats.stores++;
        stats.total += offers.length;
        step++;
        console.log(`  📡 norma (direkt): ${offers.length} Angebote in ${Date.now() - t0} ms`);
      } catch (e) {
        stats.perStore['norma'] = { total: 0, got: 0, live: 0, expired: 0, strikePrice: 0, fromHistory: 0, error: e.message, ms: Date.now() - t0 };
        byStore['norma'] = [];
        console.error(`  ❌ norma: ${e.message}`);
      }
    }

    // Phase B: Kaufda — echte Streichpreise + Ketten, die Marktguru nicht führt
    const kaufdaStores = getKaufdaStores();
    let kaufdaSummary = { enriched: 0, added: 0, addedStores: [] };
    if (kaufdaStores.length > 0) {
      const t0 = Date.now();
      setProgress({
        stage: 'enriching', status: 'running',
        message: `Kaufda: Streichpreise für ${kaufdaStores.length} Ketten…`,
        progress: 90, currentStore: step, totalStores: totalSteps,
        currentStoreName: 'Kaufda', source,
      });
      try {
        const kd = await kaufdaApi.sweep(kaufdaStores, {
          plz: PLZ,
          historyLookup: historyLookupFor,
          onStore: (storeKey, s) => {
            setProgress({
              stage: 'enriching', status: 'running',
              message: `Kaufda ${storeDisplayName(storeKey)} — ${s.live} Angebote`,
              progress: 90, currentStore: step, totalStores: totalSteps,
              currentStoreName: storeDisplayName(storeKey), source,
            });
          },
        });
        kaufdaSummary = { ...mergeKaufdaOffers(byStore, kd.byStore, stats), ms: Date.now() - t0 };
        console.log(`  🟠 Kaufda: ${kaufdaSummary.enriched} Streichpreise ergänzt, `
          + `${kaufdaSummary.added} Angebote aus ${kaufdaSummary.addedStores.length} neuen Ketten`
          + ` (${(kaufdaSummary.ms / 1000).toFixed(1)} s)`);
      } catch (e) {
        kaufdaSummary = { enriched: 0, added: 0, addedStores: [], error: e.message };
        console.warn(`  ⚠️ Kaufda übersprungen: ${e.message}`);
      }
    }

    // Warengruppen + Ernährungs-Tags (Heuristik, offline) für alle Quellen
    let dietCounts = { vegan: 0, vegetarisch: 0, fleisch: 0 };
    let categoryCounts = {};
    let offMatches = 0;
    let offCached = 0;
    for (const offers of Object.values(byStore)) {
      for (const o of offers) {
        const c = classifyOffer(o);
        o.category = c.category;
        o.category_label = c.categoryLabel;
        o.diet_tag = c.diet;
        o.is_food = c.isFood;

        // Open-Food-Facts: Produkt matchen (offline, FTS) und Kategorien/Tags nutzen, wo sie helfen
        const match = offLookup.findMatch(o.name, o.brand, { minScore: 0.6 });
        if (match) {
          o.off_code = match.code;
          o.off_score = match.score;
          offMatches++;
          const offCat = offLookup.categoryFromOffCategories(match.categoriesEn);
          if (offCat && (o.category === 'sonstiges' || (offCat === 'nonfood' && o.category !== 'nonfood' && match.score >= 0.8))) {
            o.category = offCat;
            o.category_label = (require('./offerClassifier.cjs').CATEGORIES[offCat]) || o.category_label;
            o.is_food = !['nonfood', 'drogerie-haushalt'].includes(offCat);
            o.category_source = 'off';
          }
          // Gecachte OFF-Tags schlagen die Heuristik (nur bei sicherem Match mit ≥2 Wortüberschneidungen)
          if (match.score >= 0.8 && (match.overlap >= 2 || match.score >= 0.99)) {
            const offDiet = offLookup.dietFromCachedAnalysis(match.code);
            if (offDiet === 'vegan') { o.diet_tag = 'vegan'; o.diet_source = 'off'; offCached++; }
            else if (offDiet === 'vegetarisch' && o.diet_tag !== 'vegan') { o.diet_tag = 'vegetarisch'; o.diet_source = 'off'; offCached++; }
          }
        }

        categoryCounts[o.category] = (categoryCounts[o.category] || 0) + 1;
        if (o.diet_tag && dietCounts[o.diet_tag] !== undefined) dietCounts[o.diet_tag]++;
      }
    }
    stats.categories = categoryCounts;
    stats.diet = dietCounts;
    console.log(`  🏷️  Warengruppen: ${Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(', ')}`
      + ` | vegan ${dietCounts.vegan}, vegetarisch ${dietCounts.vegetarisch}, Fleisch/Fisch ${dietCounts.fleisch}`);
    console.log(`  🧾 OFF-Matching: ${offMatches} Produkte erkannt, davon ${offCached} mit gecachten Vegan-/Vegetarisch-Tags`);

    cachedOffers = byStore;
    lastUpdated = new Date().toISOString();
    const durationMs = Date.now() - startTime;
    const active = Object.values(byStore).filter((a) => a.length > 0).length;
    const total = Object.values(byStore).reduce((s, a) => s + a.length, 0);

    setProgress({
      stage: 'done', status: 'done',
      message: `${total} Angebote aus ${active}/${Object.keys(byStore).length} Ketten in ${(durationMs / 1000).toFixed(1)} s`,
      progress: 100,
      currentStore: Object.keys(byStore).length, totalStores: Object.keys(byStore).length,
      stats: { ...stats, kaufda: kaufdaSummary, totalOffers: total, activeStores: active, durationS: (durationMs / 1000).toFixed(1) },
      source,
    });

    console.log(`✅ API-Sweep: ${total} Angebote aus ${active} Ketten in ${(durationMs / 1000).toFixed(1)} s`
      + ` (${stats.withStrikePrice} mit altem Preis, ${stats.droppedExpired} abgelaufene verworfen)`);

    stats.kaufda = kaufdaSummary;
    return { byStore, stats, durationMs };
  })();

  try {
    return await currentScrapePromise;
  } catch (err) {
    currentScrapeError = err;
    setProgress({ stage: 'error', status: 'error', message: String(err.message || err), progress: 0, source });
    throw err;
  } finally {
    currentScrapePromise = null;
  }
}

module.exports = {
  getProgress,
  hydrateOffersFromHistory, scrapeAndPersist,
  scrapeAllSources, getApiRetailers, getKaufdaStores, storeDisplayName,
  DEFAULT_API_STORES, DEFAULT_KAUFDA_STORES, mergeKaufdaOffers,
  getOffers, matchItemsToOffers,
};
