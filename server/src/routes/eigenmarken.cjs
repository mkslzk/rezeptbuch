const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'rezeptbuch.db'));

// Ensure table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS eigenmarken_reference_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store TEXT NOT NULL,
    product_name TEXT NOT NULL,
    reference_price REAL NOT NULL,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(store, product_name)
  )
`);

// GET /api/offers/eigenmarken - Get all reference prices
router.get('/', (req, res) => {
  try {
    const { store } = req.query;
    let query = 'SELECT * FROM eigenmarken_reference_prices';
    const params = [];
    if (store) {
      query += ' WHERE store = ?';
      params.push(store);
    }
    query += ' ORDER BY store, product_name';
    const rows = db.prepare(query).all(...params);
    res.json({ eigenmarken: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/offers/eigenmarken/check - Check if product has reference price
router.get('/check', (req, res) => {
  try {
    const { productName, store } = req.query;
    if (!productName) return res.status(400).json({ error: 'productName required' });
    
    const row = db.prepare(`
      SELECT * FROM eigenmarken_reference_prices
      WHERE store = ? AND LOWER(product_name) LIKE LOWER(?)
    `).get(store || 'rewe', `%${productName}%`);
    
    res.json({ 
      hasReference: !!row,
      referencePrice: row ? row.reference_price : null,
      productName: row ? row.product_name : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/offers/eigenmarken - Add reference price
router.post('/', (req, res) => {
  try {
    const { store, product_name, reference_price, notes } = req.body;
    if (!store || !product_name || reference_price == null) {
      return res.status(400).json({ error: 'store, product_name, reference_price required' });
    }
    
    const result = db.prepare(`
      INSERT INTO eigenmarken_reference_prices (store, product_name, reference_price, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(store, product_name) DO UPDATE SET
        reference_price = excluded.reference_price,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(store, product_name, reference_price, notes || null);
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/offers/eigenmarken/:id
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM eigenmarken_reference_prices WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
