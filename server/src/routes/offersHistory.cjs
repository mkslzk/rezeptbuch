const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'rezeptbuch.db'));

// Ensure tables exist (updated schema with source, offer_id, source_url, price history tracking)
db.exec(`
  CREATE TABLE IF NOT EXISTS offer_scrape_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scraped_at TEXT NOT NULL,
    store TEXT NOT NULL,
    offer_count INTEGER DEFAULT 0,
    success INTEGER DEFAULT 1,
    error TEXT,
    source TEXT DEFAULT 'direct'
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS offer_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scrape_id INTEGER,
    store TEXT NOT NULL,
    product_name TEXT NOT NULL,
    price REAL,
    url TEXT,
    scraped_at TEXT NOT NULL,
    original_price REAL,
    source TEXT DEFAULT 'direct',
    offer_id TEXT,
    source_url TEXT,
    is_lowest_price INTEGER DEFAULT 0,
    lowest_price_date TEXT,
    is_highest_price INTEGER DEFAULT 0,
    highest_price_date TEXT,
    FOREIGN KEY (scrape_id) REFERENCES offer_scrape_records(id)
  )
`);

// Add missing columns if they don't exist
const priceHistoryColumns = [
  "ALTER TABLE offer_history ADD COLUMN is_lowest_price INTEGER DEFAULT 0",
  "ALTER TABLE offer_history ADD COLUMN lowest_price_date TEXT",
  "ALTER TABLE offer_history ADD COLUMN is_highest_price INTEGER DEFAULT 0",
  "ALTER TABLE offer_history ADD COLUMN highest_price_date TEXT"
];

for (const col of priceHistoryColumns) {
  try { db.exec(col); } catch(e) {}
}

// Indexes
try { db.exec("CREATE INDEX IF NOT EXISTS idx_offer_history_product ON offer_history(product_name)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_offer_history_store ON offer_history(store)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_offer_history_price ON offer_history(price)"); } catch(e) {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_marktguru_id ON offer_history(offer_id) WHERE offer_id IS NOT NULL"); } catch(e) {}

// GET /api/offers/overview
router.get('/overview', (req, res) => {
  try {
    const totalRecords = db.prepare("SELECT COUNT(*) as c FROM offer_scrape_records").get().c;
    const totalOffers = db.prepare("SELECT COUNT(*) as c FROM offer_history").get().c;
    const uniqueProducts = db.prepare("SELECT COUNT(DISTINCT product_name) as c FROM offer_history").get().c;
    const lastScrape = db.prepare("SELECT * FROM offer_scrape_records ORDER BY scraped_at DESC LIMIT 1").get();
    
    const storeCounts = db.prepare(`
      SELECT store, source, COUNT(DISTINCT scraped_at) as scrape_count, 
             COUNT(*) as total_offers 
      FROM offer_history 
      GROUP BY store, source 
      ORDER BY total_offers DESC
    `).all();
    
    const sourceSummary = db.prepare(`
      SELECT source, COUNT(DISTINCT scraped_at) as scrape_count, COUNT(*) as total_offers
      FROM offer_history GROUP BY source
    `).all();
    
    res.json({ totalRecords, totalOffers, uniqueProducts, lastScrape, storeCounts, sourceSummary });
  } catch(e) {
    console.error('Overview error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/offers/stores
router.get('/stores', (req, res) => {
  try {
    const stores = db.prepare(`
      SELECT store, source, 
             COUNT(*) as offer_count,
             COUNT(DISTINCT product_name) as unique_products,
             MIN(scraped_at) as first_seen,
             MAX(scraped_at) as last_seen
      FROM offer_history 
      GROUP BY store, source
      ORDER BY offer_count DESC
    `).all();
    res.json({ stores });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/offers/search
router.get('/search', (req, res) => {
  try {
    const q = req.query.q || '';
    const store = req.query.store || null;
    const limit = parseInt(req.query.limit) || 50;

    let sql = `
      SELECT DISTINCT product_name, store, MIN(price) as min_price, MAX(price) as max_price, 
             COUNT(*) as seen_count, MAX(url) as offer_url,
             MAX(is_lowest_price) as has_lowest, MAX(lowest_price_date) as lowest_date,
             MAX(is_highest_price) as has_highest, MAX(highest_price_date) as highest_date
      FROM offer_history 
      WHERE LOWER(product_name) LIKE LOWER(?)
    `;
    const params = [`%${q}%`];

    if (store) {
      sql += ' AND store = ?';
      params.push(store);
    }

    sql += ' GROUP BY product_name, store ORDER BY seen_count DESC LIMIT ?';
    params.push(limit);

    const results = db.prepare(sql).all(...params);
    res.json({ results });
  } catch(e) {
    console.error('Search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/offers/prices/:productName - price history for a product
router.get('/prices/:productName', (req, res) => {
  try {
    const { productName } = req.params;
    const store = req.query.store || null;
    
    let sql = `
      SELECT id, store, price, original_price, scraped_at, url, source,
             is_lowest_price, lowest_price_date, is_highest_price, highest_price_date
      FROM offer_history 
      WHERE LOWER(product_name) = LOWER(?) AND price > 0
    `;
    const params = [productName];
    
    if (store) {
      sql += ' AND store = ?';
      params.push(store);
    }
    
    sql += ' ORDER BY scraped_at DESC LIMIT 200';
    
    const prices = db.prepare(sql).all(...params);
    res.json({ product_name: productName, prices });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/offers/price-chart/:productName - aggregated chart data
router.get('/price-chart/:productName', (req, res) => {
  try {
    const { productName } = req.params;
    
    const chartData = db.prepare(`
      SELECT store, 
             MIN(price) as min_price, MAX(price) as max_price, AVG(price) as avg_price,
             DATE(scraped_at) as date
      FROM offer_history
      WHERE LOWER(product_name) = LOWER(?) AND price > 0
      GROUP BY store, DATE(scraped_at)
      ORDER BY date ASC
    `).all(productName);
    
    const stats = db.prepare(`
      SELECT store, 
             MIN(price) as all_time_low, MAX(price) as all_time_high,
             MIN(scraped_at) as low_date, MAX(scraped_at) as high_date
      FROM offer_history
      WHERE LOWER(product_name) = LOWER(?) AND price > 0
      GROUP BY store
    `).all(productName);
    
    res.json({ product_name: productName, chartData, stats });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/offers/history - List all scrape records (paginated)
router.get('/history', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const total = db.prepare("SELECT COUNT(*) as c FROM offer_scrape_records").get().c;
    const records = db.prepare(`
      SELECT id, scraped_at, store, offer_count, success, error, source
      FROM offer_scrape_records
      ORDER BY scraped_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({
      records,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (e) {
    console.error('GET /api/offers/history error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/offers/history/:scrapeId - Get offers from a specific scrape
router.get('/history/:scrapeId', (req, res) => {
  try {
    const { scrapeId } = req.params;
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;

    const record = db.prepare('SELECT * FROM offer_scrape_records WHERE id = ?').get(scrapeId);
    if (!record) return res.status(404).json({ error: 'Scrape record not found' });

    const offers = db.prepare(`
      SELECT * FROM offer_history
      WHERE scrape_id = ?
      ORDER BY product_name ASC
      LIMIT ? OFFSET ?
    `).all(scrapeId, limit, offset);

    res.json({ record, offers, count: offers.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/offers/history - Save scrape results
router.post('/history', (req, res) => {
  try {
    const { store, offers, success, error, source = 'direct' } = req.body;
    
    if (!store || !offers) {
      return res.status(400).json({ error: 'store and offers required' });
    }

    const scrapedAt = new Date().toISOString();
    
    // Insert scrape record
    const insertRecord = db.prepare(`
      INSERT INTO offer_scrape_records (scraped_at, store, offer_count, success, error, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = insertRecord.run(scrapedAt, store, offers.length, success ? 1 : 0, error || null, source);
    const scrapeId = result.lastInsertRowid;

    if (offers && offers.length > 0) {
      const insertOffer = db.prepare(`
        INSERT INTO offer_history (scrape_id, store, product_name, price, url, scraped_at, original_price, source, offer_id, source_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const insertMany = db.transaction((items) => {
        for (const o of items) {
          insertOffer.run(
            scrapeId, 
            store, 
            o.name, 
            o.price, 
            o.url || null, 
            scrapedAt, 
            o.original_price || null,
            source,
            o.offer_id || null,
            o.source_url || null
          );
        }
      });
      insertMany(offers);
      
      // Update price history flags for all products in this scrape
      updatePriceHistoryFlags(db, store, scrapedAt);
    }

    res.json({ success: true, scrapeId, offerCount: offers.length, source });
  } catch(err) {
    console.error('POST /api/offers/history error:', err);
    res.status(500).json({ error: 'Failed to save scrape' });
  }
});

// Update lowest/highest price flags after new scrape
function updatePriceHistoryFlags(db, store, scrapedAt) {
  // Find all products that were just scraped
  const products = db.prepare(`
    SELECT DISTINCT product_name FROM offer_history 
    WHERE store = ? AND scraped_at = ?
  `).all(store, scrapedAt);
  
  for (const { product_name } of products) {
    // Get min and max price for this product across ALL scrpes
    const priceRange = db.prepare(`
      SELECT MIN(price) as min_price, MAX(price) as max_price
      FROM offer_history 
      WHERE store = ? AND LOWER(product_name) = LOWER(?)
    `).get(store, product_name);
    
    if (!priceRange || !priceRange.min_price) continue;
    
    // Clear all flags for this product first
    db.prepare(`
      UPDATE offer_history 
      SET is_lowest_price = 0, lowest_price_date = NULL,
          is_highest_price = 0, highest_price_date = NULL
      WHERE store = ? AND LOWER(product_name) = LOWER(?)
    `).run(store, product_name);
    
    // Set lowest price flag
    db.prepare(`
      UPDATE offer_history 
      SET is_lowest_price = 1, lowest_price_date = scraped_at
      WHERE store = ? AND LOWER(product_name) = LOWER(?) AND price = ?
    `).run(store, product_name, priceRange.min_price);
    
    // Set highest price flag (if different from lowest)
    if (priceRange.max_price !== priceRange.min_price) {
      db.prepare(`
        UPDATE offer_history 
        SET is_highest_price = 1, highest_price_date = scraped_at
        WHERE store = ? AND LOWER(product_name) = LOWER(?) AND price = ?
      `).run(store, product_name, priceRange.max_price);
    }
  }
}

// DELETE /api/offers/clear - Clear all offer history (for fresh start)
router.delete('/clear', (req, res) => {
  try {
    db.exec("DELETE FROM offer_history");
    db.exec("DELETE FROM offer_scrape_records");
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('offer_history', 'offer_scrape_records')");
    res.json({ success: true, message: 'All offer history cleared' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// GET /api/offers/all - All offers with pagination
router.get('/all', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5000;
    const offset = parseInt(req.query.offset) || 0;
    const store = req.query.store || null;
    
    let sql = 'SELECT * FROM offer_history WHERE 1=1';
    const params = [];
    
    if (store) {
      sql += ' AND store = ?';
      params.push(store);
    }
    
    sql += ' ORDER BY scraped_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const offers = db.prepare(sql).all(...params);
    const total = db.prepare('SELECT COUNT(*) as c FROM offer_history' + (store ? ' WHERE store = ?' : '')).get(...(store ? [store] : [])).c;
    
    res.json({ offers, total, limit, offset });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

// Helper functions for use by scraper
module.exports.saveScrapeRecord = (store, offerCount, success, error, source = 'direct') => {
  const scrapedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO offer_scrape_records (scraped_at, store, offer_count, success, error, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(scrapedAt, store, offerCount, success ? 1 : 0, error || null, source);
};

module.exports.saveOffers = (scrapeId, store, offers, source = 'direct') => {
  const scrapedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO offer_history (scrape_id, store, product_name, price, url, scraped_at, original_price, source, offer_id, source_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items) => {
    for (const o of items) {
      stmt.run(
        scrapeId, store, o.name, o.price, o.url || null, scrapedAt, 
        o.original_price || null, source,
        o.offer_id || null,
        o.source_url || null
      );
    }
  });
  insertMany(offers);
  
  // Update price history flags for all products just inserted
  updatePriceHistoryFlags(db, store, scrapedAt);
  
  return offers.length;
};