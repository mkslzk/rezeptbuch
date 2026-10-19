const express = require('express');
const { scrapeAllStores, scrapeAllMarktguruStores, getProgress, getOffers, matchItemsToOffers, scrapeAndPersist } = require('../services/offersScraper.cjs');
const offersHistoryRouter = require('./offersHistory.cjs');

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
          offersHistoryRouter.saveScrapeRecord('marktguru', 0, false, String(err.message || err), 'marktguru');
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
          offersHistoryRouter.saveScrapeRecord('marktguru', 0, false, String(err.message || err), 'marktguru');
        } catch {}
      });
    res.json({ success: true, started: true });
  } catch (err) {
    console.error('POST /api/offers/scrape/marktguru error:', err);
    res.status(500).json({ error: 'Marktguru scrape failed: ' + err.message });
  }
});

router.get('/match', async (req, res) => {
  try {
    const { listId } = req.query;
    if (!listId) {
      return res.status(400).json({ error: 'listId required' });
    }
    
    const listRes = await fetch(`${req.protocol}://${req.get('host')}/api/shopping-lists/${listId}`);
    if (!listRes.ok) {
      return res.status(404).json({ error: 'List not found' });
    }
    const list = await listRes.json();
    
    const matches = matchItemsToOffers(list.items || []);
    res.json({ matches });
  } catch (err) {
    console.error('GET /api/offers/match error:', err);
    res.status(500).json({ error: 'Failed to match items' });
  }
});

module.exports = router;
