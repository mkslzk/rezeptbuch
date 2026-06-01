/**
 * Learning Router
 * Server-side learned products endpoint
 */

const express = require('express');
const router = express.Router();
const { learnProduct, findLearned, getAllLearned, clearLearned } = require('../services/learningService.cjs');

// POST /api/learning - Learn a product selection
router.post('/', async (req, res) => {
  try {
    const product = req.body;
    if (!product || !product.off_product_code) {
      return res.status(400).json({ error: 'Missing off_product_code' });
    }
    
    // Optional: fetch product image from OFF if not provided
    if (!product.off_image_url && product.off_product_code) {
      try {
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${product.off_product_code}.json`, {
          signal: AbortSignal.timeout(5000)
        });
        if (offRes.ok) {
          const offData = await offRes.json();
          if (offData.product?.image_url) {
            product.off_image_url = offData.product.image_url;
          }
        }
      } catch (e) {
        console.log('Could not fetch product image:', e.message);
      }
    }
    
    const learned = learnProduct(product);
    res.json({ success: true, learned });
  } catch (err) {
    console.error('Learn error:', err);
    res.status(500).json({ error: 'Failed to learn product' });
  }
});

// GET /api/learning?q=query - Find learned products
router.get('/', (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ products: [] });
    }
    const products = findLearned(q, parseInt(limit) || 7);
    res.json({ products });
  } catch (err) {
    console.error('Find learned error:', err);
    res.status(500).json({ error: 'Failed to find learned products' });
  }
});

// GET /api/learning/all - Get all learned products
router.get('/all', (req, res) => {
  try {
    const products = getAllLearned();
    res.json({ products });
  } catch (err) {
    console.error('Get all learned error:', err);
    res.status(500).json({ error: 'Failed to get learned products' });
  }
});

// DELETE /api/learning - Clear all learned products
router.delete('/', (req, res) => {
  try {
    clearLearned();
    res.json({ success: true });
  } catch (err) {
    console.error('Clear learned error:', err);
    res.status(500).json({ error: 'Failed to clear learned products' });
  }
});

module.exports = router;