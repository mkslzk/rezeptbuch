const express = require('express');
const { scrapeAllStores, getOffers, matchItemsToOffers } = require('../services/offersScraper.cjs');

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
    console.log('📡 Scrape requested via API');
    const results = await scrapeAllStores();
    res.json({ 
      success: true, 
      storesScraped: Object.keys(results).length,
      totalOffers: Object.values(results).reduce((s, a) => s + a.length, 0),
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    console.error('POST /api/offers/scrape error:', err);
    res.status(500).json({ error: 'Scrape failed: ' + err.message });
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
