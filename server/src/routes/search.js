import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/search?q=query - Search recipes
// Params:
//   q        - search query (searches title, description, ingredients, tags)
//   category - filter by category
//   maxTime  - filter by max total time (prep_time + cook_time in minutes)
//   sort     - sort: 'newest' (default), 'oldest', 'alpha', 'rating'
//   limit    - max results (default 50, max 200)
router.get('/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const category = req.query.category || null;
    const maxTime = parseInt(req.query.maxTime) || null;
    const sort = req.query.sort || 'newest';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    if (!query && !category && !maxTime) {
      return res.status(400).json({ error: 'At least one filter required: q, category, or maxTime' });
    }

    const params = [];
    let sql = 'SELECT * FROM recipes WHERE 1=1';

    if (query) {
      // Case-insensitive search across text fields
      // Title matches weighted higher (via UNION for title matches first)
      const searchTerm = `%${query}%`;
      const orClause = `(title COLLATE NOCASE LIKE ? OR description COLLATE NOCASE LIKE ? OR ingredients COLLATE NOCASE LIKE ? OR tags COLLATE NOCASE LIKE ?)`;
      sql += ` AND ${orClause}`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    if (maxTime) {
      sql += ` AND (COALESCE(prep_time, 0) + COALESCE(cook_time, 0)) <= ?`;
      params.push(maxTime);
    }

    // Sort order
    switch (sort) {
      case 'oldest':
        sql += ' ORDER BY created_at ASC';
        break;
      case 'alpha':
        sql += ' ORDER BY title COLLATE NOCASE ASC';
        break;
      case 'rating':
        sql += ' ORDER BY COALESCE(rating_average, 0) DESC, created_at DESC';
        break;
      case 'newest':
      default:
        sql += ' ORDER BY created_at DESC';
    }

    sql += ` LIMIT ?`;
    params.push(limit);

    const recipes = db.prepare(sql).all(...params);
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search/suggestions?q=partial - Quick title suggestions for autocomplete
router.get('/suggestions', (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (query.length < 2) return res.json([]);

    const searchTerm = `${query}%`;
    const suggestions = db.prepare(
      `SELECT id, title FROM recipes WHERE title COLLATE NOCASE LIKE ? ORDER BY rating_average DESC NULLS LAST LIMIT 8`
    ).all(searchTerm);
    res.json(suggestions);
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