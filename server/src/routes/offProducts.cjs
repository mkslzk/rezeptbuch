const express = require('express');
const router = express.Router();
const { searchProducts, searchWithLearning } = require('../services/offProducts.cjs');

// GET /api/products/search?q=query&limit=15
router.get('/search', (req, res) => {
  const { q, limit = 15 } = req.query;
  
  if (!q || q.trim().length < 2) {
    return res.json({ products: [], error: null });
  }
  
  try {
    const products = searchWithLearning(q.trim(), parseInt(limit));
    res.json({ products, error: null });
  } catch (e) {
    console.error('OFF search error:', e);
    res.json({ products: [], error: 'Search failed' });
  }
});

// GET /api/products/:code
router.get('/:code', (req, res) => {
  const { code } = req.params;
  const db = require('../services/offProducts.cjs').getDb();
  
  try {
    const product = db.prepare(`
      SELECT * FROM products WHERE code = ?
    `).get(code);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json(product);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;