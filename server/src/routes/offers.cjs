const express = require('express');
const { scrapeAllStores, getProgress, getOffers, matchItemsToOffers } = require('../services/offersScraper.cjs');
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
    // Run in background — response returns immediately
    scrapeAllStores()
      .then(results => {
        // Persist to history DB so "Letzter Scrape" + counts update
        let total = 0;
        for (const [store, offers] of Object.entries(results)) {
          const { lastInsertRowid } = offersHistoryRouter.saveScrapeRecord(store, offers.length, true, null, 'direct');
          if (offers.length > 0) {
            offersHistoryRouter.saveOffers(lastInsertRowid, store, offers, 'direct');
            total += offers.length;
          }
        }
        console.log(`✅ Direkt-Scrape persisted: ${Object.keys(results).length} stores, ${total} offers`);
      })
      .catch(err => {
        console.error('Background scrape error:', err);
        try {
          offersHistoryRouter.saveScrapeRecord('direkt', 0, false, String(err.message || err), 'direct');
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
