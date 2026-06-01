import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/meal-plans?week=YYYY-MM-DD
router.get('/meal-plans', (req, res) => {
  try {
    const { week } = req.query;
    if (week) {
      const plan = db.prepare('SELECT * FROM meal_plans WHERE week_start = ?').get(week);
      if (!plan) return res.json(null);
      const entries = db.prepare('SELECT mpe.*, r.title as recipe_title, r.image_url as recipe_image FROM meal_plan_entries mpe LEFT JOIN recipes r ON mpe.recipe_id = r.id WHERE mpe.meal_plan_id = ?').all(plan.id);
      return res.json({ ...plan, entries });
    }
    // Return all plans
    const plans = db.prepare('SELECT * FROM meal_plans ORDER BY week_start DESC').all();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/meal-plans
router.post('/meal-plans', (req, res) => {
  try {
    const { week_start } = req.body;
    if (!week_start) return res.status(400).json({ error: 'week_start is required' });

    // Check if plan already exists for this week
    const existing = db.prepare('SELECT * FROM meal_plans WHERE week_start = ?').get(week_start);
    if (existing) return res.json(existing);

    const result = db.prepare('INSERT INTO meal_plans (week_start) VALUES (?)').run(week_start);
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/meal-plans/:id/entries
router.put('/meal-plans/:id/entries', (req, res) => {
  try {
    const { entries } = req.body; // [{ day_of_week, meal_type, recipe_id }]
    const planId = req.params.id;

    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(planId);
    if (!plan) return res.status(404).json({ error: 'Meal plan not found' });

    // Clear existing entries
    db.prepare('DELETE FROM meal_plan_entries WHERE meal_plan_id = ?').run(planId);

    // Insert new entries
    const insert = db.prepare('INSERT INTO meal_plan_entries (meal_plan_id, recipe_id, day_of_week, meal_type) VALUES (?, ?, ?, ?)');
    for (const entry of entries) {
      insert.run(planId, entry.recipe_id, entry.day_of_week, entry.meal_type);
    }

    const updatedEntries = db.prepare('SELECT mpe.*, r.title as recipe_title, r.image_url as recipe_image FROM meal_plan_entries mpe LEFT JOIN recipes r ON mpe.recipe_id = r.id WHERE mpe.meal_plan_id = ?').all(planId);
    res.json(updatedEntries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/meal-plans/:id
router.delete('/meal-plans/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM meal_plans WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Meal plan not found' });
    res.json({ message: 'Meal plan deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meal-plans/:id/entries - List entries of a plan (with recipe info)
router.get('/meal-plans/:id/entries', (req, res) => {
  try {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Meal plan not found' });

    const entries = db.prepare(`
      SELECT mpe.*, r.title as recipe_title, r.image_url as recipe_image
      FROM meal_plan_entries mpe
      LEFT JOIN recipes r ON mpe.recipe_id = r.id
      WHERE mpe.meal_plan_id = ?
      ORDER BY mpe.day_of_week, mpe.meal_type
    `).all(req.params.id);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/meal-plans/:id - Get a single plan with its entries
router.get('/meal-plans/:id', (req, res) => {
  try {
    const plan = db.prepare('SELECT * FROM meal_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Meal plan not found' });
    const entries = db.prepare(`
      SELECT mpe.*, r.title as recipe_title, r.image_url as recipe_image
      FROM meal_plan_entries mpe
      LEFT JOIN recipes r ON mpe.recipe_id = r.id
      WHERE mpe.meal_plan_id = ?
      ORDER BY mpe.day_of_week, mpe.meal_type
    `).all(plan.id);
    res.json({ ...plan, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
