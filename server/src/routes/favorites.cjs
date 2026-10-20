/**
 * Merkliste (Favoriten) für Angebote.
 *
 * Bewusst minimal: Name + Marke, optional ein Zielpreis (Grundlage für den
 * späteren Preis-Alarm). Keine eigenen Produkt-IDs — der Name ist der Schlüssel,
 * weil Angebote keine stabile Artikelnummer über Ketten hinweg haben.
 */

const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const router = express.Router();
const db = new Database(path.join(__dirname, '..', 'data', 'rezeptbuch.db'));
// Zweite Verbindung zur selben Datei: WAL + busy_timeout verhindern SQLITE_BUSY
// beim parallelen Scrape-Schreibzugriff.
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

/** IDs kommen aus der URL — nur positive Ganzzahlen durchlassen. */
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS favorite_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT,
    target_price REAL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_favorite_products_unique
    ON favorite_products(name COLLATE NOCASE, COALESCE(brand, '') COLLATE NOCASE);
`);

function listFavorites() {
  return db.prepare('SELECT id, name, brand, target_price, created_at FROM favorite_products ORDER BY created_at DESC').all();
}

router.get('/', (req, res) => {
  try {
    res.json({ favorites: listFavorites() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const brand = req.body?.brand ? String(req.body.brand).trim() : null;
    const target = req.body?.target_price === undefined || req.body?.target_price === null || req.body?.target_price === ''
      ? null
      : Number(req.body.target_price);
    if (!name) return res.status(400).json({ error: 'name required' });
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      return res.status(400).json({ error: 'target_price must be a positive number' });
    }

    db.prepare(`
      INSERT INTO favorite_products (name, brand, target_price, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(name, brand, target, new Date().toISOString());

    res.json({ success: true, favorites: listFavorites() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Ungültige ID' });
    const target = req.body?.target_price === null || req.body?.target_price === ''
      ? null
      : Number(req.body?.target_price);
    if (target !== null && (!Number.isFinite(target) || target <= 0)) {
      return res.status(400).json({ error: 'target_price must be a positive number' });
    }
    const info = db.prepare('UPDATE favorite_products SET target_price = ? WHERE id = ?').run(target, id);
    if (info.changes === 0) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ success: true, favorites: listFavorites() });
  } catch (e) {
    console.error('PATCH /favorites/:id:', e.message);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Ungültige ID' });
    const info = db.prepare('DELETE FROM favorite_products WHERE id = ?').run(id);
    if (info.changes === 0) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ success: true, favorites: listFavorites() });
  } catch (e) {
    console.error('DELETE /favorites/:id:', e.message);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

// Für andere Module (z. B. späterer Preis-Alarm)
module.exports = router;
module.exports.listFavorites = listFavorites;
module.exports.db = db;
