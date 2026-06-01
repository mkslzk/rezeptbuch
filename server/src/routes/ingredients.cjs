const express = require('express');
const router = express.Router();
const { searchWithLearning } = require('../services/offProducts.cjs');

/**
 * Match ingredients to OFF products
 * POST /api/ingredients/match
 * Body: { ingredients: [{item: "Milch", amount: "200", unit: "ml"}] }
 * Returns: [{ item: "Milch", amount: "200", unit: "ml", matches: [{code, name, brand, store, category}] }]
 */
router.post('/match', (req, res) => {
  const { ingredients } = req.body;
  
  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'ingredients must be an array' });
  }
  
  const results = ingredients.map(ing => {
    if (!ing.item || ing.item.trim().length < 2) {
      return { ...ing, matches: [], item_clean: ing.item };
    }
    
    try {
      // Search with the full ingredient string, take top 3
      const matches = searchWithLearning(ing.item.trim(), 3).map(p => ({
        code: p.code,
        name: p.name,
        brand: p.brand,
        store: p.store,
        category: p.category,
        isEigenmarke: p.isEigenmarke,
        isGerman: p.isGerman,
        quantity: p.quantity,
        imageUrl: p.imageUrl
      }));
      
      return {
        ...ing,
        matches,
        item_clean: ing.item
      };
    } catch (e) {
      return { ...ing, matches: [], error: e.message };
    }
  });
  
  res.json({ results });
});

module.exports = router;