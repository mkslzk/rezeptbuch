const express = require('express');
const { enrichProduct, guessCategory, detectStore, parseQuantity } = require('../services/categorization.cjs');

const router = express.Router();

// POST /api/categorize - Enrich a single OFF product into our shopping-item format
// Body: { name, brand, code, quantity, category, categories }
router.post('/', (req, res) => {
  try {
    const enriched = enrichProduct(req.body);
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/categorize/batch - Enrich multiple products
// Body: { products: [...] }
router.post('/batch', (req, res) => {
  try {
    const { products = [] } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ error: 'products must be an array' });
    }
    const enriched = products.map(enrichProduct);
    res.json({ products: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/categorize/categories - Return the list of valid internal categories
router.get('/categories', (req, res) => {
  const { VALID_CATEGORIES } = require('../services/categorization.cjs');
  res.json({ categories: VALID_CATEGORIES });
});

module.exports = router;
