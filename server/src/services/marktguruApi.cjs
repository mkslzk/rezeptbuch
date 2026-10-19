/**
 * Marktguru-API-Client (reines HTTP/JSON, kein Browser).
 *
 * Endpunkt: GET https://api.marktguru.de/api/v1/publishers/retailer/<uniqueName>/offers
 *           ?as=mobile&limit=512&offset=N&zipCode=<PLZ>
 * Auth:     Header x-apikey — der Key steht öffentlich im SSR-HTML von marktguru.de
 *           ("apiKey":"…") und wird hier automatisch geholt/erneuert (siehe refreshKeys).
 *
 * Verifizierte Eigenschaften (2026-10-19):
 *  - limit ist bei 512 gekappt → Offset-Paginierung (nur Lidl braucht mehr als eine Seite)
 *  - x-clientkey ist nicht nötig; ohne gültigen x-apikey antwortet die API 401
 *  - oldPrice ist meist 0 oder kleiner als price → nur oldPrice > price ist ein echter
 *    Streichpreis (aldi-sued 89/500, rossmann 52, edeka 6, rewe 1, sonst 0)
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.marktguru.de';
const PAGE_LIMIT = 512;          // API-Maximum, größere Werte werden gekappt
const REQUEST_TIMEOUT_MS = 30000;
// Wie alt darf ein Preis aus der eigenen Historie höchstens sein, um als "alter Preis" zu gelten?
const HISTORY_MAX_AGE_DAYS = Number(process.env.MOCA_HISTORY_MAX_AGE_DAYS || 35);
const KEYS_PATH = path.join(__dirname, '..', 'data', 'mg-keys.json');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function log(...args) { console.log('  📡 marktguru:', ...args); }

// ------------------------------------------------------------ Keys

function readKeysFromDisk() {
  try {
    const j = JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8'));
    if (j && j.apiKey) return j;
  } catch {}
  return null;
}

/**
 * Holt apiKey (und clientKey) aus dem HTML der Website. Nötig, wenn die Datei fehlt
 * oder die API 401 liefert (Key-Rotation).
 * @returns {Promise<{apiKey:string, clientKey:string|null, fetchedAt:string}>}
 */
async function refreshKeys(retailer = 'rewe') {
  const url = `https://www.marktguru.de/r/${retailer}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9' } });
  const html = await res.text();
  const apiKey = (html.match(/"apiKey"\s*:\s*"([^"]+)"/) || [])[1];
  if (!apiKey) throw new Error('Marktguru: apiKey nicht im Seiten-HTML gefunden (Layout geändert?)');
  const clientKey = (html.match(/"clientKey"\s*:\s*"([^"]+)"/) || [])[1] || null;
  const keys = { apiKey, clientKey, fetchedAt: new Date().toISOString() };
  try {
    fs.mkdirSync(path.dirname(KEYS_PATH), { recursive: true });
    fs.writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
    log(`API-Key erneuert (${apiKey.length} Zeichen) → ${path.relative(process.cwd(), KEYS_PATH)}`);
  } catch (e) {
    log(`Warnung: Key konnte nicht gespeichert werden: ${e.message}`);
  }
  return keys;
}

let keysCache = null;

/** Liefert die Zugangsdaten (Cache → Datei → Website). */
async function getKeys({ force = false } = {}) {
  if (!force && keysCache) return keysCache;
  keysCache = force ? null : readKeysFromDisk();
  if (!keysCache) keysCache = await refreshKeys();
  return keysCache;
}

// ------------------------------------------------------------ HTTP

async function fetchWithTimeout(url, opts = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET auf die API mit automatischer Key-Erneuerung bei 401/403.
 * Wirft bei allen anderen Fehlern — Aufrufer entscheidet über Retry.
 */
async function apiGet(pathname, params = {}, { retryKey = true } = {}) {
  const keys = await getKeys();
  const url = new URL(API_BASE + pathname);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetchWithTimeout(url.toString(), {
    headers: { 'x-apikey': keys.apiKey, accept: 'application/json', 'User-Agent': UA },
  });

  if (res.status === 401 || res.status === 403) {
    if (retryKey) {
      log(`${res.status} — API-Key wird erneuert und einmal wiederholt`);
      keysCache = null;
      await getKeys({ force: true });
      return apiGet(pathname, params, { retryKey: false });
    }
    throw new Error(`Marktguru-API ${res.status}: API-Key abgelehnt (auch nach Erneuerung)`);
  }
  if (!res.ok) throw new Error(`Marktguru-API HTTP ${res.status} für ${pathname}`);

  const text = await res.text();
  // Fehlerfälle antworten als JSON-String, z. B. "Invalid or missing api key"
  if (text.trim().startsWith('"')) {
    throw new Error(`Marktguru-API-Fehler: ${JSON.parse(text)}`);
  }
  return JSON.parse(text);
}

/** Schlaf-Helfer für Retries / crawl-delay. */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ------------------------------------------------------------ Offers

function round2(n) { return typeof n === 'number' ? Math.round(n * 100) / 100 : null; }

/**
 * Prozentuale Ersparnis; null, wenn kein belastbarer alter Preis vorliegt.
 * Werte über 80 % werden verworfen (fast immer ein Datenfehler statt eines Angebots).
 */
function discountPercent(price, oldPrice) {
  if (!price || !oldPrice || oldPrice <= price) return null;
  const d = Math.round(((oldPrice - price) / oldPrice) * 1000) / 10;
  return d > 80 ? null : d;
}

/**
 * Zieht ALLE Angebote einer Kette (Offset-Paginierung, limit 512).
 * @returns {Promise<{total:number, pages:number, offers:object[]}>} offers = Rohdaten der API
 */
async function fetchRetailerOffers(retailer, plz, { maxPages = 10, onPage = null } = {}) {
  const offers = [];
  let total = null;
  let page = 0;

  for (; page < maxPages; page++) {
    const data = await apiGet(`/api/v1/publishers/retailer/${encodeURIComponent(retailer)}/offers`, {
      as: 'mobile',
      limit: PAGE_LIMIT,
      offset: page * PAGE_LIMIT,
      zipCode: plz || undefined,
    });
    const items = Array.isArray(data.results) ? data.results : [];
    if (total === null) total = typeof data.totalResults === 'number' ? data.totalResults : items.length;
    offers.push(...items);
    if (onPage) onPage({ page: page + 1, got: items.length, total });
    if (items.length < PAGE_LIMIT || offers.length >= total) break;
  }

  return { total: total ?? offers.length, pages: page + 1, offers };
}

/**
 * Normalisiert ein API-Angebot auf das App-Schema.
 * `original_price` bleibt null, wenn die Quelle keinen echten Streichpreis hat —
 * der Historien-Fallback passiert in offersScraper (dort liegt die Historie).
 */
function normalizeOffer(raw, { storeKey, plz } = {}) {
  const price = round2(raw.price);
  const apiOld = round2(raw.oldPrice);
  const oldPrice = apiOld && price && apiOld > price ? apiOld : null;
  const validFrom = raw.validFrom || null;
  const validTo = raw.validTo || null;
  const upcoming = validFrom ? Date.parse(validFrom) > Date.now() : false;

  return {
    store: storeKey,
    name: (raw.product && raw.product.name) || raw.description || 'Unbekannt',
    brand: (raw.brand && raw.brand.name) || null,
    price,
    original_price: oldPrice,
    old_price_source: oldPrice ? 'api' : null,
    discount_percent: oldPrice ? discountPercent(price, oldPrice) : null,
    unit: (raw.unit && (raw.unit.shortName || raw.unit.name)) || null,
    volume: typeof raw.volume === 'number' ? raw.volume : null,
    quantity: typeof raw.quantity === 'number' ? raw.quantity : null,
    unit_price: round2(raw.referencePrice),
    valid_from: validFrom,
    valid_to: validTo,
    upcoming,
    offer_id: raw.id != null ? String(raw.id) : null,
    url: `https://www.marktguru.de/r/${storeKey}${plz ? `?zipCode=${plz}` : ''}`,
    source_url: raw.id != null ? `https://www.marktguru.de/offer/${raw.id}` : null,
  };
}

/** Ist das Angebot noch nicht abgelaufen? (Leere Gültigkeit = gültig) */
function isNotExpired(offer, now = Date.now()) {
  if (!offer.valid_to) return true;
  const t = Date.parse(offer.valid_to);
  return !Number.isFinite(t) || t >= now;
}

/**
 * Kompletter Sweep über mehrere Ketten — rein sequenziell, damit die API nicht
 * unnötig belastet wird (ein Sweep dauert real unter 3 Sekunden).
 *
 * @param {string[]} retailers Marktguru `uniqueName`s
 * @param {string} plz         Postleitzahl (steuert die regionale Auswahl)
 * @param {{onStore?:Function, historyLookup?:Function}} opts
 *        historyLookup(storeKey) → Map(normalisierter Produktname → letzter Preis)
 * @returns {Promise<{byStore:Object, stats:Object}>}
 */
async function sweep(retailers, plz, { onStore = null, historyLookup = null } = {}) {
  const byStore = {};
  const stats = { stores: 0, total: 0, withStrikePrice: 0, droppedExpired: 0, perStore: {} };

  for (const storeKey of retailers) {
    const t0 = Date.now();
    try {
      const { total, offers: raw } = await fetchRetailerOffers(storeKey, plz);
      const normalized = raw.map((r) => normalizeOffer(r, { storeKey, plz }));

      const live = normalized.filter((o) => isNotExpired(o));
      const expiredCount = normalized.length - live.length;

      // Historien-Fallback: alter Preis = zuletzt gesehener Preis aus früheren Läufen,
      // aber nur wenn er höher ist (sonst gibt es nichts zu sparen) und nicht zu alt
      // (sonst werden Preise von vor Monaten als "alter Preis" verkauft).
      const history = typeof historyLookup === 'function' ? historyLookup(storeKey) : null;
      const historyCutoff = Date.now() - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      let fromHistory = 0;
      if (history && history.size > 0) {
        for (const o of live) {
          if (o.original_price) continue;
          const prev = history.get(o.name.toLowerCase().replace(/\s+/g, ' ').trim());
          if (!prev || !prev.price || !o.price || prev.price <= o.price) continue;
          const seenAt = Date.parse(prev.scrapedAt);
          if (!Number.isFinite(seenAt) || seenAt < historyCutoff) continue;
          const pct = discountPercent(o.price, prev.price);
          if (pct === null) continue;   // > 80 % → Datenfehler, nicht verwenden
          o.original_price = round2(prev.price);
          o.old_price_source = 'history';
          o.discount_percent = pct;
          fromHistory++;
        }
      }

      byStore[storeKey] = live;
      stats.perStore[storeKey] = {
        total: total,
        got: raw.length,
        live: live.length,
        expired: expiredCount,
        strikePrice: live.filter((o) => o.original_price).length,
        fromHistory,
        ms: Date.now() - t0,
      };
      stats.stores++;
      stats.total += live.length;
      stats.droppedExpired += expiredCount;
      stats.withStrikePrice += live.filter((o) => o.original_price).length;

      log(`${storeKey}: ${live.length} gültige Angebote (${stats.perStore[storeKey].strikePrice} mit altem Preis`
        + `${fromHistory ? `, davon ${fromHistory} aus Historie` : ''}) in ${stats.perStore[storeKey].ms} ms`);
      if (onStore) onStore(storeKey, stats.perStore[storeKey]);
    } catch (e) {
      stats.perStore[storeKey] = { total: 0, got: 0, live: 0, expired: 0, strikePrice: 0, fromHistory: 0, error: e.message, ms: Date.now() - t0 };
      byStore[storeKey] = [];
      log(`❌ ${storeKey}: ${e.message}`);
    }
    await sleep(200);   // höflich bleiben (robots/Kulanz), kostet bei 8 Ketten ~1,6 s
  }

  return { byStore, stats };
}

module.exports = {
  API_BASE,
  PAGE_LIMIT,
  KEYS_PATH,
  fetchRetailerOffers,
  normalizeOffer,
  discountPercent,
  isNotExpired,
  sweep,
  getKeys,
  refreshKeys,
  readKeysFromDisk,
  _resetKeyCache: () => { keysCache = null; },
};
