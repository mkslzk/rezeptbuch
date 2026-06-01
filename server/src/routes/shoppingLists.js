import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

// GET /api/shopping-lists?meal_plan_id=
router.get('/shopping-lists', (req, res) => {
  try {
    const { meal_plan_id } = req.query;
    if (meal_plan_id) {
      const list = db.prepare('SELECT * FROM shopping_lists WHERE meal_plan_id = ?').get(meal_plan_id);
      if (!list) return res.json(null);
      const items = db.prepare('SELECT * FROM shopping_items WHERE shopping_list_id = ? ORDER BY category, store, item').all(list.id);
      return res.json({ ...list, items });
    }
    const lists = db.prepare('SELECT * FROM shopping_lists ORDER BY created_at DESC').all();
    res.json(lists);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopping-lists
router.post('/shopping-lists', (req, res) => {
  try {
    const { meal_plan_id } = req.body;
    const result = db.prepare('INSERT INTO shopping_lists (meal_plan_id) VALUES (?)').run(meal_plan_id || null);
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopping-lists/:id/generate
router.post('/shopping-lists/:id/generate', (req, res) => {
  try {
    const listId = req.params.id;
    const list = db.prepare('SELECT * FROM shopping_lists WHERE id = ?').get(listId);
    if (!list) return res.status(404).json({ error: 'Shopping list not found' });

    // Get all recipes from the meal plan entries
    const entries = db.prepare(`
      SELECT mpe.recipe_id FROM meal_plan_entries mpe
      WHERE mpe.meal_plan_id = ?
    `).all(list.meal_plan_id);

    const recipeIds = entries.map(e => e.recipe_id);
    if (recipeIds.length === 0) return res.json({ items: [] });

    const placeholders = recipeIds.map(() => '?').join(',');
    const recipes = db.prepare(`SELECT * FROM recipes WHERE id IN (${placeholders})`).all(...recipeIds);

    // Aggregate ingredients
    const itemMap = {};
    for (const recipe of recipes) {
      let ingredients;
      try {
        ingredients = JSON.parse(recipe.ingredients);
      } catch {
        continue;
      }
      for (const ing of ingredients) {
        const key = `${ing.item.toLowerCase()}_${ing.unit || ''}`;
        if (itemMap[key]) {
          const existing = itemMap[key];
          const num1 = parseFloat(existing.amount) || 0;
          const num2 = parseFloat(ing.amount) || 0;
          existing.amount = String(num1 + num2);
        } else {
          itemMap[key] = { item: ing.item, amount: ing.amount, unit: ing.unit, category: ing.category || 'sonstiges', store: ing.store || '' };
        }
      }
    }

    // Clear existing items
    db.prepare('DELETE FROM shopping_items WHERE shopping_list_id = ?').run(listId);

    // Insert aggregated items
    const insert = db.prepare('INSERT INTO shopping_items (shopping_list_id, item, amount, unit, category, store) VALUES (?, ?, ?, ?, ?, ?)');
    for (const item of Object.values(itemMap)) {
      insert.run(listId, item.item, item.amount, item.unit, item.category, item.store);
    }

    const items = db.prepare('SELECT * FROM shopping_items WHERE shopping_list_id = ? ORDER BY category, store, item').all(listId);
    res.json({ ...list, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shopping-lists/:id/items/:itemId
router.patch('/shopping-lists/:id/items/:itemId', (req, res) => {
  try {
    const { checked } = req.body;
    db.prepare('UPDATE shopping_items SET checked = ? WHERE id = ? AND shopping_list_id = ?').run(checked ? 1 : 0, req.params.itemId, req.params.id);
    const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(req.params.itemId);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shopping-lists/:id/items
// Supports both free-text entry and OFF product selection
router.post('/shopping-lists/:id/items', (req, res) => {
  try {
    const { 
      item, amount, unit, category, store,
      off_product_name, off_product_code, off_brand, off_quantity
    } = req.body;
    
    if (!item) return res.status(400).json({ error: 'item is required' });
    
    const result = db.prepare(`
      INSERT INTO shopping_items 
        (shopping_list_id, item, amount, unit, category, store, off_product_name, off_product_code, off_brand, off_quantity) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, 
      item, 
      amount || '', 
      unit || '', 
      category || 'sonstiges', 
      store || '',
      off_product_name || null,
      off_product_code || null,
      off_brand || null,
      off_quantity || null
    );
    
    const newItem = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/shopping-lists/:id/items/:itemId - Update item with OFF data
router.patch('/shopping-lists/:id/items/:itemId', (req, res) => {
  try {
    const { 
      checked,
      off_product_name, off_product_code, off_brand, off_quantity
    } = req.body;
    
    const updates = [];
    const params = [];
    
    if (checked !== undefined) {
      updates.push('checked = ?');
      params.push(checked ? 1 : 0);
    }
    if (off_product_name !== undefined) {
      updates.push('off_product_name = ?');
      params.push(off_product_name || null);
    }
    if (off_product_code !== undefined) {
      updates.push('off_product_code = ?');
      params.push(off_product_code || null);
    }
    if (off_brand !== undefined) {
      updates.push('off_brand = ?');
      params.push(off_brand || null);
    }
    if (off_quantity !== undefined) {
      updates.push('off_quantity = ?');
      params.push(off_quantity || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(req.params.itemId, req.params.id);
    
    db.prepare(`UPDATE shopping_items SET ${updates.join(', ')} WHERE id = ? AND shopping_list_id = ?`).run(...params);
    const item = db.prepare('SELECT * FROM shopping_items WHERE id = ?').get(req.params.itemId);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shopping-lists/:id/items/:itemId
router.delete('/shopping-lists/:id/items/:itemId', (req, res) => {
  try {
    db.prepare('DELETE FROM shopping_items WHERE id = ? AND shopping_list_id = ?').run(req.params.itemId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;