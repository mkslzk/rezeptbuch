import { Router } from 'express';
import { importRecipe } from '../services/recipeImporter.cjs';  // Real browser-based scraper
import { db } from '../db/index.js';

const router = Router();

// GET /api/recipes
router.get('/recipes', (req, res) => {
  try {
    const recipes = db.prepare('SELECT * FROM recipes ORDER BY created_at DESC').all();
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/:id
router.get('/recipes/:id', (req, res) => {
  try {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recipes/shared/:id - Public read-only access
router.get('/recipes/shared/:id', (req, res) => {
  try {
    const recipe = db.prepare('SELECT id, title, description, image_url, category, servings, prep_time, cook_time, source_url, ingredients, steps, tags, rating, created_at FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recipes
router.post('/recipes', (req, res) => {
  try {
    const { title, description, ingredients, steps, category, tags, image_url, servings, prep_time, cook_time, source_url } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const stmt = db.prepare(`
      INSERT INTO recipes (title, description, ingredients, steps, category, tags, image_url, servings, prep_time, cook_time, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      title, description || null,
      ingredients ? JSON.stringify(ingredients) : '[]',
      steps ? JSON.stringify(steps) : '[]',
      category || null,
      tags ? JSON.stringify(tags) : '[]',
      image_url || null, servings || null,
      prep_time || null, cook_time || null,
      source_url || null
    );
    const newRecipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newRecipe);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/recipes/:id
router.put('/recipes/:id', (req, res) => {
  try {
    const { title, description, ingredients, steps, category, tags, image_url, servings, prep_time, cook_time, source_url } = req.body;
    const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Recipe not found' });

    const stmt = db.prepare(`
      UPDATE recipes SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        ingredients = COALESCE(?, ingredients),
        steps = COALESCE(?, steps),
        category = COALESCE(?, category),
        tags = COALESCE(?, tags),
        image_url = COALESCE(?, image_url),
        servings = COALESCE(?, servings),
        prep_time = COALESCE(?, prep_time),
        cook_time = COALESCE(?, cook_time),
        source_url = COALESCE(?, source_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(
      title, description,
      ingredients ? JSON.stringify(ingredients) : null,
      steps ? JSON.stringify(steps) : null,
      category,
      tags ? JSON.stringify(tags) : null,
      image_url, servings, prep_time, cook_time, source_url,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recipes/:id
router.delete('/recipes/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Recipe not found' });
    res.json({ message: 'Recipe deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recipes/import
router.post('/recipes/import', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Use browser-based scraper for full JS rendering
    const data = await importRecipe(url);

    res.json({
      title: data.title || '',
      description: data.description || '',
      ingredients: data.ingredients || [],
      steps: data.steps || [],
      category: data.category || '',
      image_url: data.imageUrl || '',
      servings: data.servings || null,
      prep_time: data.prepTime || null,
      cook_time: data.cookTime || null,
      source_url: url
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import: ' + err.message });
  }
});

// PATCH /api/recipes/:id/favorite - Toggle favorite status
router.patch('/recipes/:id/favorite', (req, res) => {
  try {
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });
    
    const newFavorite = recipe.is_favorite ? 0 : 1;
    db.prepare('UPDATE recipes SET is_favorite = ? WHERE id = ?').run(newFavorite, req.params.id);
    res.json({ id: parseInt(req.params.id), is_favorite: newFavorite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/recipes/:id/rating - Add rating (running average: 1-5 stars)
router.patch('/recipes/:id/rating', (req, res) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
    }
    const recipe = db.prepare('SELECT rating, rating_count FROM recipes WHERE id = ?').get(req.params.id);
    if (!recipe) return res.status(404).json({ error: 'Recipe not found' });

    const oldAvg = Number(recipe.rating) || 0;
    const oldCount = Number(recipe.rating_count) || 0;
    const newCount = oldCount + 1;
    const newAvg = (oldAvg * oldCount + rating) / newCount;

    db.prepare('UPDATE recipes SET rating = ?, rating_count = ? WHERE id = ?').run(newAvg, newCount, req.params.id);
    res.json({ id: parseInt(req.params.id), rating: newAvg, rating_count: newCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
