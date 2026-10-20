const express = require('express');
const { getProgress, getOffers, matchItemsToOffers, scrapeAndPersist } = require('../services/offersScraper.cjs');
const offersHistory = require('./offersHistory.cjs');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const data = getOffers();
    res.json(data);
  } catch (err) {
    console.error('GET /api/offers error:', err);
    res.status(500).json({ error: 'Failed to get offers' });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    // Reject if another scrape is already running
    const current = getProgress();
    if (current && current.status === 'running') {
      return res.status(409).json({ error: 'Scrape läuft bereits', progress: current });
    }
    console.log('📡 Scrape requested via API');
    // Run in background — response returns immediately.
    // Persistenz steckt in scrapeAndPersist() (gemeinsamer Pfad mit Auto-Scrape),
    // damit "Letzter Scrape" + Counts auch nach einem Neustart stimmen.
    // Phase A (2026-10-19): Quelle ist die Marktguru-JSON-API (± NORMA direkt).
    scrapeAndPersist('marktguru')
      .then(({ stores, offers, durationMs }) => {
        console.log(`✅ Scrape persisted: ${stores} Ketten, ${offers} offers, ${(durationMs / 1000).toFixed(1)} s`);
      })
      .catch(err => {
        console.error('Background scrape error:', err);
        try {
          offersHistory.saveScrapeRecord('marktguru', 0, false, String(err.message || err), 'marktguru');
        } catch {}
      });
    res.json({ success: true, started: true });
  } catch (err) {
    console.error('POST /api/offers/scrape error:', err);
    res.status(500).json({ error: 'Scrape failed: ' + err.message });
  }
});

// GET progress for any running/just-finished scrape (Direkt or Marktguru)
router.get('/scrape/progress', (req, res) => {
  res.json({ progress: getProgress() });
});

router.post('/scrape/marktguru', async (req, res) => {
  try {
    const current = getProgress();
    if (current && current.status === 'running') {
      return res.status(409).json({ error: 'Scrape läuft bereits', progress: current });
    }
    console.log('📡 Marktguru scrape requested via API');
    // Phase A: derselbe API-Pfad wie /scrape — hält die Route aus Kompatibilität am Leben.
    scrapeAndPersist('marktguru')
      .then(({ stores, offers, durationMs }) => {
        console.log(`✅ Marktguru-Scrape persisted: ${stores} Ketten, ${offers} offers, ${(durationMs / 1000).toFixed(1)} s`);
      })
      .catch(err => {
        console.error('Background marktguru scrape error:', err);
        try {
          offersHistory.saveScrapeRecord('marktguru', 0, false, String(err.message || err), 'marktguru');
        } catch {}
      });
    res.json({ success: true, started: true });
  } catch (err) {
    console.error('POST /api/offers/scrape/marktguru error:', err);
    res.status(500).json({ error: 'Marktguru scrape failed: ' + err.message });
  }
});

// GET /api/offers/match?listId=3 — Angebots-Treffer für eine Einkaufsliste
// (Direkt aus der DB; der frühere interne HTTP-Aufruf auf eine nicht
// existierende Route lieferte für jede Liste „List not found".)
router.get('/match', (req, res) => {
  try {
    const { listId } = req.query;
    if (!listId) return res.status(400).json({ error: 'listId required' });

    const items = offersHistory.getDb()
      .prepare('SELECT item, amount, unit, category, store, checked FROM shopping_items WHERE shopping_list_id = ? ORDER BY id')
      .all(listId);
    if (items.length === 0) return res.json({ matches: [], items: 0 });

    const matches = matchItemsToOffers(items);
    res.json({ matches, items: items.length });
  } catch (err) {
    console.error('GET /api/offers/match error:', err);
    res.status(500).json({ error: 'Failed to match items' });
  }
});

// POST /api/offers/match  { items: [{item, amount, unit, category}] }
// Für die Einkaufsliste im Browser: ein Aufruf statt 4.000 Vergleiche je Karte.
router.post('/match', (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 250) : [];
    if (items.length === 0) return res.json({ matches: [] });
    res.json({ matches: matchItemsToOffers(items) });
  } catch (err) {
    console.error('POST /api/offers/match error:', err);
    res.status(500).json({ error: 'Failed to match items' });
  }
});

// POST /api/offers/price-summary  { items: [{name, brand}], days? }
// Batch-Variante von /price-chart für ganze Kartenlisten. Schlüssel ist Name **+ Marke**,
// damit "Cola" nicht alle Sorten in einen Min/Max-Topf wirft.
router.post('/price-summary', (req, res) => {
  try {
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const days = Math.min(Math.max(Number(req.body?.days) || 365, 7), 1095);

    const items = rawItems
      .map((it) => ({ name: String(it?.name || '').trim(), brand: it?.brand ? String(it.brand).trim() : null }))
      .filter((it) => it.name)
      .slice(0, 250);

    if (items.length === 0) return res.json({ days, items: {} });

    const db = offersHistory.getDb();
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const names = [...new Set(items.map((i) => i.name))];
    const placeholders = names.map(() => '?').join(',');

    const rows = db.prepare(`
      SELECT product_name, brand, price, store, scraped_at
      FROM offer_history
      WHERE product_name IN (${placeholders}) AND price > 0 AND scraped_at >= ?
      ORDER BY scraped_at ASC
    `).all(...names, since);

    const byName = new Map();
    for (const r of rows) {
      if (!byName.has(r.product_name)) byName.set(r.product_name, []);
      byName.get(r.product_name).push(r);
    }

    const out = {};
    for (const it of items) {
      const key = `${it.name}||${it.brand || ''}`;
      const acc = { min: null, max: null, avg: null, count: 0, last: null, lastAt: null, firstAt: null, sum: 0, weekly: new Map() };
      const brandNorm = it.brand ? it.brand.toLowerCase() : null;

      for (const r of byName.get(it.name) || []) {
        // Marke muss passen, wenn beide Seiten eine haben
        const rowBrand = r.brand ? String(r.brand).toLowerCase() : null;
        if (brandNorm && rowBrand && !(rowBrand.includes(brandNorm) || brandNorm.includes(rowBrand))) continue;

        acc.count++;
        acc.sum += r.price;
        acc.min = acc.min === null ? r.price : Math.min(acc.min, r.price);
        acc.max = acc.max === null ? r.price : Math.max(acc.max, r.price);
        acc.last = r.price;
        acc.lastAt = r.scraped_at;
        if (acc.firstAt === null) acc.firstAt = r.scraped_at;

        const d = new Date(r.scraped_at);
        if (Number.isNaN(d.getTime())) continue;
        const monday = new Date(d);
        monday.setUTCHours(0, 0, 0, 0);
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        const wk = monday.toISOString().slice(0, 10);
        const prev = acc.weekly.get(wk);
        if (prev === undefined || r.price < prev) acc.weekly.set(wk, r.price);
      }

      const weekly = [...acc.weekly.entries()]
        .map(([week, price]) => ({ week, price }))
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-16);

      out[key] = {
        min: acc.min,
        max: acc.max,
        avg: acc.count > 0 ? Math.round((acc.sum / acc.count) * 100) / 100 : null,
        count: acc.count,
        last: acc.last,
        lastAt: acc.lastAt,
        firstAt: acc.firstAt,
        weekly,
      };
    }

    res.json({ days, items: out });
  } catch (e) {
    console.error('POST /api/offers/price-summary error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
