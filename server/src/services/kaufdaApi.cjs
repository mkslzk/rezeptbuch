/**
 * Kaufda/Bonial-Client (reines HTTP/JSON, kein Login).
 *
 * Zwei Wege, an Prospekte zu kommen:
 *  A) Regionaler Kiosk:  GET /api/shelf?lat=<lat>&lng=<lng>&size=24&page=N
 *     → alle Prospekte der Region (publisher{id,name}, contentId, pageCount, validFrom/Until,
 *       closestStore{zip,city}). Braucht keine buildId → bevorzugter Einstieg.
 *  B) Pro Kette:         GET /_next/data/<buildId>/de-DE/Geschaefte/<Slug>.json
 *     → pageInformation.brochures.{viewer,intendedSearchArea}; buildId steht im HTML jeder
 *       kaufda.de-Seite und ändert sich bei jedem Deployment.
 *
 * Angebote je Prospekt:
 *   GET /api/personalisedOffers?brochureId=<contentId>&size=500
 *       &bonialAccountId=<beliebige UUID>&userPlatformCategory=desktop.web.browser
 *   → contents[] mit title, brand, description, prices{mainPrice, secondaryPrice,
 *     secondaryPriceIsUVP, priceByBaseUnit, conditions}, validFrom/validUntil, categories,
 *     parentContent.page.number.
 *
 * Verifiziert 2026-10-19: Kaufland 484 Angebote / 278 Streichpreise; Lidl 437/437;
 * kein Rate-Limit beobachtet, robots.txt bittet um crawl-delay 2 (wir bleiben bei ~1,2 s).
 */

const fs = require('fs');
const path = require('path');

const BASE = 'https://www.kaufda.de';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const AID = '11111111-2222-3333-4444-555555555555';   // beliebige UUID, wird nicht geprüft
const GEO_PATH = path.join(__dirname, '..', 'data', 'kaufda-geo.json');
const REQUEST_TIMEOUT_MS = 30000;
const DELAY_MS = 1200;            // robots.txt: crawl-delay 2 → wir bleiben etwas darunter
const HISTORY_MAX_AGE_DAYS = Number(process.env.MOCA_HISTORY_MAX_AGE_DAYS || 35);

// Kaufda-Publisher-Name (normalisiert) → interner Store-Key
const PUBLISHER_MAP = {
  'lidl': 'lidl',
  'kaufland': 'kaufland',
  'rewe': 'rewe',
  'edeka': 'edeka',
  'penny': 'penny',
  'aldi sued': 'aldi-sued',
  'aldi sud': 'aldi-sued',
  'aldi nord': 'aldi-nord',
  'netto marken-discount': 'netto-marken-discount',
  'netto marken discount': 'netto-marken-discount',
  'netto': 'netto-supermarkt',
  'norma': 'norma',
  'nahkauf': 'nahkauf',
  'marktkauf': 'marktkauf',
  'famila': 'famila',
  'combi': 'combi',
  'v-markt': 'v-markt',
  'globus': 'globus',
  'tegut': 'tegut',
  'e-center': 'e-center',
  'e center': 'e-center',
  'metro': 'metro',
  'denns biomarkt': 'denns-biomarkt',
  'denns': 'denns-biomarkt',
  'dm-drogerie markt': 'dm',
  'rossmann': 'rossmann',
  'muller': 'mueller',
  'müller': 'mueller',
};

function log(...args) { console.log('  🟠 kaufda:', ...args); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'de-DE,de;q=0.9', ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, { retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}

// ------------------------------------------------------------ Geocoding (PLZ → lat/lng, gecacht)

function readGeoCache() {
  try { return JSON.parse(fs.readFileSync(GEO_PATH, 'utf8')); } catch { return {}; }
}

function writeGeoCache(cache) {
  try {
    fs.mkdirSync(path.dirname(GEO_PATH), { recursive: true });
    fs.writeFileSync(GEO_PATH, JSON.stringify(cache, null, 2));
  } catch {}
}

/**
 * Koordinaten für eine PLZ. Nominatim (OSM) ist kostenlos, braucht aber einen User-Agent
 * und max. 1 Request/s → Ergebnis wird in data/kaufda-geo.json gecacht.
 */
async function geocodePlz(plz) {
  const cache = readGeoCache();
  if (cache[plz]) return cache[plz];
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(plz)}`
    + '&country=Germany&format=json&limit=1';
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'MOCA-Homelab/1.0 (private recipe app)' } });
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const arr = await res.json();
  if (!Array.isArray(arr) || arr.length === 0) throw new Error(`PLZ ${plz} nicht gefunden`);
  const geo = { lat: Number(arr[0].lat), lng: Number(arr[0].lon), display: arr[0].display_name };
  cache[plz] = geo;
  writeGeoCache(cache);
  return geo;
}

// ------------------------------------------------------------ Prospekte

/** Alle Prospekte der Region über den Kiosk (paginiert). */
async function fetchShelf(lat, lng, { maxPages = 6, size = 24, onPage = null } = {}) {
  const brochures = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await getJson(`${BASE}/api/shelf?lat=${lat}&lng=${lng}&size=${size}&page=${page}`);
    const items = (d.contents || []).map((x) => x.content).filter(Boolean);
    brochures.push(...items.map((b) => ({
      contentId: b.contentId,
      title: b.title,
      pageCount: b.pageCount,
      validFrom: b.validFrom,
      validUntil: b.validUntil,
      publisherId: b.publisher?.id || null,
      publisherName: b.publisher?.name || null,
      storeKey: PUBLISHER_MAP[normName(b.publisher?.name)] || null,
      closestStore: b.closestStore ? { zip: b.closestStore.zip, city: b.closestStore.city } : null,
    })));
    if (onPage) onPage({ page: page + 1, got: items.length, total: d.page?.totalElements });
    if (!d.page || page + 1 >= (d.page.totalPages || 1) || items.length === 0) break;
    await sleep(DELAY_MS);
  }
  return brochures;
}

/** buildId der aktuellen kaufda.de-Ausgabe (nötig für den Weg pro Kette). */
async function getBuildId() {
  const res = await fetchWithTimeout(`${BASE}/Geschaefte/Lidl`);
  const html = await res.text();
  const id = (html.match(/"buildId"\s*:\s*"([^"]+)"/) || [])[1];
  if (!id) throw new Error('Kaufda: buildId nicht im HTML gefunden');
  return id;
}

/** Prospekte einer Kette über den Next.js-Datenendpunkt (Fallback zu fetchShelf). */
async function fetchChainBrochures(slug, buildId = null) {
  const id = buildId || await getBuildId();
  const d = await getJson(`${BASE}/_next/data/${id}/de-DE/Geschaefte/${encodeURIComponent(slug)}.json`);
  const pi = d.pageProps?.pageInformation;
  if (!pi) throw new Error(`Kaufda ${slug}: kein pageInformation`);
  const out = [];
  for (const bucket of ['viewer', 'intendedSearchArea', 'publisher']) {
    for (const b of (pi.brochures?.[bucket] || [])) {
      out.push({
        contentId: b.contentId,
        title: b.title,
        pageCount: b.pageCount,
        validFrom: b.validFrom,
        validUntil: b.validUntil,
        publisherId: b.publisher?.id || null,
        publisherName: b.publisher?.name || null,
        storeKey: PUBLISHER_MAP[normName(b.publisher?.name)] || null,
        bucket,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------ Angebote

function round2(n) { return typeof n === 'number' ? Math.round(n * 100) / 100 : null; }

function discountPercent(price, oldPrice) {
  if (!price || !oldPrice || oldPrice <= price) return null;
  const d = Math.round(((oldPrice - price) / oldPrice) * 1000) / 10;
  return d > 80 ? null : d;
}

/**
 * Alle Angebote eines Prospekts. `size=500` liefert die komplette Broschüre
 * (der Parameter `page` wird ignoriert).
 */
async function fetchBrochureOffers(contentId, { size = 500 } = {}) {
  const url = `${BASE}/api/personalisedOffers?brochureId=${encodeURIComponent(contentId)}`
    + `&size=${size}&bonialAccountId=${AID}&userPlatformCategory=desktop.web.browser`;
  const d = await getJson(url);
  return Array.isArray(d.contents) ? d.contents : [];
}

/** Normalisiert ein Kaufda-Angebot auf das App-Schema. */
function normalizeOffer(raw, { storeKey, brochure = null } = {}) {
  const p = raw.prices || {};
  const price = round2(typeof p.mainPrice === 'number' ? p.mainPrice : null);
  const secondary = round2(typeof p.secondaryPrice === 'number' ? p.secondaryPrice : null);
  // secondaryPrice ist der Streichpreis (alter Preis bzw. UVP) — nur verwenden, wenn höher.
  const oldPrice = secondary && price && secondary > price ? secondary : null;
  // secondaryPriceIsUVP=true bedeutet: das ist eine unverbindliche Preisempfehlung des Herstellers,
  // kein früherer Ladenpreis. Wird getrennt ausgewiesen, damit das UI ehrlich labeln kann.
  const oldPriceSource = oldPrice ? (p.secondaryPriceIsUVP ? 'kaufda-uvp' : 'kaufda') : null;
  const validFrom = raw.validFrom || brochure?.validFrom || null;
  const validTo = raw.validUntil || brochure?.validUntil || null;
  const cats = Array.isArray(raw.categoryPaths) ? raw.categoryPaths : [];

  return {
    store: storeKey,
    name: (raw.title || raw.description || 'Unbekannt').trim().slice(0, 120),
    brand: raw.brand || null,
    price,
    original_price: oldPrice,
    old_price_source: oldPriceSource,
    discount_percent: oldPrice ? discountPercent(price, oldPrice) : null,
    unit: null,
    volume: null,
    quantity: null,
    unit_price: null,
    valid_from: validFrom,
    valid_to: validTo,
    upcoming: validFrom ? Date.parse(validFrom) > Date.now() : false,
    category: cats.length ? (cats[0]?.name || String(cats[0])) : null,
    description: raw.description || null,
    offer_id: raw.id != null ? `kaufda:${raw.id}` : null,
    url: brochure?.contentId ? `${BASE}/prospekt/${brochure.contentId}` : `${BASE}/`,
    source_url: brochure?.contentId ? `${BASE}/prospekt/${brochure.contentId}` : null,
    source: 'kaufda',
  };
}

function isNotExpired(offer, now = Date.now()) {
  if (!offer.valid_to) return true;
  const t = Date.parse(offer.valid_to);
  // Prospekte laufen um 21:00/22:00 UTC des Vortags ab → 1 Tag Kulanz
  return !Number.isFinite(t) || t >= now - 24 * 60 * 60 * 1000;
}

/** Ist der Prospekt noch relevant? (abgelaufene überspringen) */
function brochureIsCurrent(b, now = Date.now()) {
  const t = Date.parse(b.validUntil);
  return !Number.isFinite(t) || t >= now - 24 * 60 * 60 * 1000;
}

/**
 * Sweep über Kaufda: Kiosk der Region → Prospekte der gewünschten Ketten → Angebote.
 *
 * @param {string[]} storeKeys gewünschte interne Store-Keys (z.B. ['lidl','marktkauf'])
 * @param {{plz:string, lat?:number, lng?:number, maxBrochuresPerStore?:number,
 *          onStore?:Function, historyLookup?:Function}} opts
 * @returns {Promise<{byStore:Object, stats:Object}>}
 */
async function sweep(storeKeys, { plz, lat, lng, maxBrochuresPerStore = 2, onStore = null, historyLookup = null } = {}) {
  const t0 = Date.now();
  const wanted = new Set(storeKeys);
  const byStore = {};
  const stats = { stores: 0, total: 0, strikePrice: 0, perStore: {}, brochures: 0, skippedExpiredBrochures: 0 };

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    const geo = await geocodePlz(plz);
    lat = geo.lat;
    lng = geo.lng;
    log(`Region für ${plz}: ${geo.display?.split(',').slice(0, 2).join(',') || `${lat},${lng}`}`);
  }

  const all = await fetchShelf(lat, lng, { maxPages: 6 });
  log(`${all.length} Prospekte in der Region gefunden`);

  // Pro Kette: nur aktuelle Prospekte, die größten zuerst (Hauptprospekt vor Beilagen)
  const perStore = new Map();
  for (const b of all) {
    if (!b.storeKey || !wanted.has(b.storeKey)) continue;
    if (!brochureIsCurrent(b)) { stats.skippedExpiredBrochures++; continue; }
    if (!b.contentId) continue;
    if (!perStore.has(b.storeKey)) perStore.set(b.storeKey, []);
    perStore.get(b.storeKey).push(b);
  }
  for (const [key, list] of perStore) {
    perStore.set(key, list
      .sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0))
      .slice(0, maxBrochuresPerStore));
  }

  const missing = storeKeys.filter((k) => !perStore.has(k));
  if (missing.length) log(`keine aktuellen Prospekte für: ${missing.join(', ')}`);

  for (const [storeKey, brochures] of perStore) {
    const s0 = Date.now();
    const offers = [];
    let brochureCount = 0;
    try {
      for (const b of brochures) {
        const raw = await fetchBrochureOffers(b.contentId);
        stats.brochures++;
        brochureCount++;
        for (const r of raw) {
          const o = normalizeOffer(r, { storeKey, brochure: b });
          if (o.price == null) continue;
          if (!isNotExpired(o)) continue;
          offers.push(o);
        }
        await sleep(DELAY_MS);
      }

      // Dubletten (gleiche Angebots-ID in mehreren Prospekten) entfernen
      const seen = new Set();
      const unique = offers.filter((o) => {
        const key = o.offer_id || `${o.name}|${o.price}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Historien-Fallback für Angebote ohne echten Streichpreis
      const history = typeof historyLookup === 'function' ? historyLookup(storeKey) : null;
      const cutoff = Date.now() - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
      let fromHistory = 0;
      if (history && history.size > 0) {
        for (const o of unique) {
          if (o.original_price) continue;
          const prev = history.get(o.name.toLowerCase().replace(/\s+/g, ' ').trim());
          if (!prev || !prev.price || prev.price <= o.price) continue;
          const seenAt = Date.parse(prev.scrapedAt);
          if (!Number.isFinite(seenAt) || seenAt < cutoff) continue;
          const pct = discountPercent(o.price, prev.price);
          if (pct === null) continue;
          o.original_price = round2(prev.price);
          o.old_price_source = 'history';
          o.discount_percent = pct;
          fromHistory++;
        }
      }

      const withStrike = unique.filter((o) => o.original_price).length;
      stats.perStore[storeKey] = {
        total: offers.length, live: unique.length, brochures: brochureCount,
        strikePrice: withStrike, fromHistory, ms: Date.now() - s0,
      };
      byStore[storeKey] = unique;
      stats.stores++;
      stats.total += unique.length;
      stats.strikePrice += withStrike;
      if (onStore) onStore(storeKey, stats.perStore[storeKey]);
      log(`${storeKey}: ${unique.length} Angebote aus ${brochureCount} Prospekt(en), `
        + `${withStrike} mit Streichpreis${fromHistory ? ` (${fromHistory} aus Historie)` : ''} — ${Date.now() - s0} ms`);
    } catch (e) {
      stats.perStore[storeKey] = { total: 0, live: 0, brochures: brochureCount, strikePrice: 0, fromHistory: 0, ms: Date.now() - s0, error: e.message };
      log(`❌ ${storeKey}: ${e.message}`);
    }
  }

  stats.durationMs = Date.now() - t0;
  return { byStore, stats };
}

module.exports = {
  BASE,
  PUBLISHER_MAP,
  fetchShelf,
  fetchChainBrochures,
  fetchBrochureOffers,
  getBuildId,
  geocodePlz,
  normalizeOffer,
  discountPercent,
  brochureIsCurrent,
  isNotExpired,
  sweep,
  _normName: normName,
};
