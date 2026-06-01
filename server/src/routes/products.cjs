const express = require('express');
const { searchOpenFoodFacts, getProductByBarcode, createSearchKey } = require('../services/openFoodFacts.cjs');
const { searchWithLearning, searchProducts } = require('../services/offProducts.cjs');

const router = express.Router();

// GET /api/products/search?q=Milch&limit=5
// Uses LOCAL OFF database with Eigenmarken prioritization
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }

    // Use local OFF DB with learning overlay
    const products = searchWithLearning(q.trim(), parseInt(limit));
    res.json({ products, query: q, source: 'local' });
  } catch (err) {
    console.error('Product search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/products/search/online?q=Milch&limit=5
// Fallback to live OFF API search
router.get('/search/online', async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query too short' });
    }

    const products = await searchOpenFoodFacts(q.trim(), parseInt(limit));
    res.json({ products, query: q, source: 'online' });
  } catch (err) {
    console.error('Product search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/products/barcode/:barcode
router.get('/barcode/:barcode', async (req, res) => {
  try {
    const product = await getProductByBarcode(req.params.barcode);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error('Barcode lookup error:', err);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// GET /api/products/match?item=Milch&store=rewe
// Combines OFF search with store offers for hybrid matching
router.get('/match', async (req, res) => {
  try {
    const { item, store } = req.query;
    if (!item) {
      return res.status(400).json({ error: 'item required' });
    }

    // Use local OFF DB
    const offProducts = searchWithLearning(item, 3);
    
    // Get store offers
    const { matchItemsToOffers } = require('../services/offersScraper.cjs');
    const offers = matchItemsToOffers([{ item, amount: '', unit: '', category: 'sonstiges', store: store || '' }]);

    res.json({
      item,
      store: store || 'all',
      offProducts,
      matchedOffers: offers[0]?.bestOffers || [],
      searchKey: offProducts.length > 0 ? createSearchKey(offProducts[0]) : null
    });
  } catch (err) {
    console.error('Product match error:', err);
    res.status(500).json({ error: 'Match failed' });
  }
});

module.exports = router;