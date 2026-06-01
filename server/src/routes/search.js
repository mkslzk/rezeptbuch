import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/search?q=query - Search recipes
router.get('/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const category = req.query.category || null;

    if (!query && !category) {
      return res.status(400).json({ error: 'Query or category required' });
    }

    let sql = 'SELECT * FROM recipes WHERE 1=1';
    const params = [];

    if (query) {
      sql += ` AND (title LIKE ? OR description LIKE ? OR ingredients LIKE ? OR tags LIKE ?)`;
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ' ORDER BY created_at DESC';

    const recipes = db.prepare(sql).all(...params);
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/categories - Get all categories
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT DISTINCT category FROM recipes WHERE category IS NOT NULL ORDER BY category').all();
    res.json(categories.map(c => c.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;