const Database = require('better-sqlite3');
const path = require('path');

// Eigenmarken patterns (store brands prioritized)
const EIGENMARKEN = [
  'vemondo','milsani','tandil','choceur','oko','freeway','milbona','crownfield','alesto','bellal','w5',
  'ja!','voll & gut','gut & günstig','edeka bio','gutfleisch','landliebe','k-classic','netto',
  'real,-','metro chef','fin carree','classic',
  'alpro','plant based','bio plant','organic plant','freeway vegan','rewe bio','penny bio'
];

const EIGENMARKEN_LIDL = ['milbona','crownfield','alesto','bellal','freeway','oko','w5'];
const EIGENMARKEN_ALDI = ['vemondo','milsani','tandil','choceur','gourmet','all seasons'];
const EIGENMARKEN_REWE = ['ja!','voll & gut','rewe bio','rewe'];
const EIGENMARKEN_EDEKA = ['gut & günstig','edeka bio','gutfleisch','markenwahl'];
const EIGENMARKEN_KAUFLAND = ['k-classic','tip'];
const EIGENMARKEN_PENNY = ['landliebe','penny bio'];

function detectStore(brand) {
  if (!brand) return null;
  const b = brand.toLowerCase();
  if (EIGENMARKEN_LIDL.some(em => b.includes(em))) return 'lidl';
  if (EIGENMARKEN_ALDI.some(em => b.includes(em))) return 'aldi';
  if (EIGENMARKEN_REWE.some(em => b.includes(em))) return 'rewe';
  if (EIGENMARKEN_EDEKA.some(em => b.includes(em))) return 'edeka';
  if (EIGENMARKEN_KAUFLAND.some(em => b.includes(em))) return 'kaufland';
  if (EIGENMARKEN_PENNY.some(em => b.includes(em))) return 'penny';
  if (b.includes('netto')) return 'netto';
  if (b.includes('real')) return 'real';
  return null;
}

function isEigenmarke(brand) {
  if (!brand) return false;
  const b = brand.toLowerCase();
  return EIGENMARKEN.some(em => b.includes(em));
}

function guessCategory(productName, categories) {
  const catStr = ((categories || '') + ' ' + (productName || '')).toLowerCase();
  
  if (catStr.includes('joghurt') || catStr.includes('käse') || catStr.includes('quark') || 
      catStr.includes('milch') || catStr.includes('butter') || catStr.includes('frischkäse') ||
      catStr.includes('yoghurt') || catStr.includes('dairy') || catStr.includes('milk') ||
      catStr.includes('eis') || catStr.includes('schmand') || catStr.includes('dessert')) {
    return 'dairy';
  }
  if (catStr.includes('fleisch') || catStr.includes('fisch') || catStr.includes('wurst') ||
      catStr.includes('meat') || catStr.includes('fish') || catStr.includes('geflügel') ||
      catStr.includes('hähnchen') || catStr.includes('rind') || catStr.includes('schwein') ||
      catStr.includes('thunfisch') || catStr.includes('lachs') || catStr.includes('salm')) {
    return 'meat';
  }
  if (catStr.includes('plant-based') || catStr.includes('vegan') || catStr.includes('dairy substitute') ||
      catStr.includes('oatly') || catStr.includes('alpro') || catStr.includes('haferdrink') ||
      catStr.includes('sojadrink') || catStr.includes('bio plant') || catStr.includes('plant based') ||
      catStr.includes('organic plant') || catStr.includes('vegan line') || catStr.includes('gut bio')) {
    return 'plant';
  }
  if (catStr.includes('gemüse') || catStr.includes('obst') || catStr.includes('frucht') ||
      catStr.includes('vegetable') || catStr.includes('fruit') || catStr.includes('salat')) {
    return 'produce';
  }
  if (catStr.includes('brot') || catStr.includes('brötchen') || catStr.includes('gebäck') ||
      catStr.includes('bread') || catStr.includes('bakery') || catStr.includes('backwaren')) {
    return 'bakery';
  }
  if (catStr.includes('tiefkühl') || catStr.includes('frozen') || catStr.includes('eiscreme')) {
    return 'frozen';
  }
  if (catStr.includes('getränk') || catStr.includes('beverage') || catStr.includes('drink') ||
      catStr.includes('limonade') || catStr.includes('saft') || catStr.includes('wasser')) {
    return 'beverages';
  }
  if (catStr.includes('schokolade') || catStr.includes('candy') || catStr.includes('keks') ||
      catStr.includes('snack') || catStr.includes('sweet') || catStr.includes('bonbon')) {
    return 'snacks';
  }
  if (catStr.includes('reinigung') || catStr.includes('wasch') || catStr.includes('clean')) {
    return 'sonstiges';
  }
  return 'sonstiges';
}

let db = null;

function getDb() {
  if (!db) {
    db = new Database(path.join(__dirname, '../data/off.db'));
    db.pragma('journal_mode = WAL');
  }
  return db;
}

/**
 * Search OFF products locally with Eigenmarken prioritization
 * @param {string} query - Search query
 * @param {number} limit - Max results (default 15)
 * @returns {Array} Products sorted by German first, then Eigenmarken, then relevance
 */
function searchProducts(query, limit = 15) {
  const database = getDb();
  
  if (!query || query.trim().length < 2) {
    return [];
  }
  
  const searchQuery = query.trim().toLowerCase();
  
  // Try FTS5 search first
  let products;
  try {
    products = database.prepare(`
      SELECT p.code, p.product_name_de, p.brands, p.categories_en, p.quantity, 
             p.image_small_url, p.is_german
      FROM products p 
      WHERE p.code IN (
        SELECT code FROM products_fts 
        WHERE product_name_de MATCH ? OR brands MATCH ?
      )
      ORDER BY p.is_german DESC,
        CASE WHEN p.brands IS NOT NULL AND p.brands != '' THEN
          CASE WHEN p.brands LIKE '%vemondo%' OR p.brands LIKE '%milbona%' OR p.brands LIKE '%ja!%' OR 
               p.brands LIKE '%oko%' OR p.brands LIKE '%freeway%' OR p.brands LIKE '%landliebe%' OR 
               p.brands LIKE '%k-classic%' OR p.brands LIKE '%alpro%' OR p.brands LIKE '%rewe bio%' OR
               p.brands LIKE '%edeka bio%' OR p.brands LIKE '%gut & günstig%' THEN 0 ELSE 1 END
        ELSE 2
        END,
        p.product_name_de
      LIMIT ?
    `).all([searchQuery + '*', searchQuery + '*', limit]);
  } catch (e) {
    // FTS failed, fallback to LIKE search
    products = database.prepare(`
      SELECT p.code, p.product_name_de, p.brands, p.categories_en, p.quantity, 
             p.image_small_url, p.is_german
      FROM products p 
      WHERE p.product_name_de LIKE ? OR p.brands LIKE ?
      ORDER BY p.is_german DESC,
        CASE WHEN p.brands IS NOT NULL AND p.brands != '' THEN
          CASE WHEN p.brands LIKE '%vemondo%' OR p.brands LIKE '%milbona%' OR p.brands LIKE '%ja!%' OR 
               p.brands LIKE '%oko%' OR p.brands LIKE '%freeway%' OR p.brands LIKE '%landliebe%' OR 
               p.brands LIKE '%k-classic%' OR p.brands LIKE '%alpro%' THEN 0 ELSE 1 END
        ELSE 2
        END,
        p.product_name_de
      LIMIT ?
    `).all([`%${searchQuery}%`, `%${searchQuery}%`, limit]);
  }
  
  // Add computed fields
  return products.map(p => ({
    code: p.code,
    name: p.product_name_de || p.product_name || '',
    brand: p.brands || '',
    category: guessCategory(p.product_name_de, p.categories_en),
    store: detectStore(p.brands),
    isEigenmarke: isEigenmarke(p.brands),
    isGerman: p.is_german === 1,
    quantity: p.quantity || '',
    imageUrl: p.image_small_url || ''
  }));
}

/**
 * Load learned products from JSON file and merge with OFF results
 */
function getLearnedProducts(query, limit = 10) {
  try {
    const fs = require('fs');
    const learnedPath = path.join(__dirname, '../data/learned-products.json');
    if (!fs.existsSync(learnedPath)) return [];
    
    const learned = JSON.parse(fs.readFileSync(learnedPath, 'utf8'));
    const q = query.toLowerCase();
    
    return learned
      .filter(p => p.item?.toLowerCase().includes(q) || p.off_product_name?.toLowerCase().includes(q))
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
      .slice(0, limit)
      .map(p => ({
        code: p.off_product_code,
        name: p.off_product_name || p.item,
        brand: p.off_brand || '',
        category: p.category || 'sonstiges',
        store: detectStore(p.off_brand),
        isEigenmarke: isEigenmarke(p.off_brand),
        isGerman: true,
        isLearned: true,
        quantity: p.off_quantity || '',
        imageUrl: p.off_image_url || ''
      }));
  } catch (e) {
    return [];
  }
}

/**
 * Search with learning overlay (learned products first, then OFF matches)
 */
function searchWithLearning(query, limit = 15) {
  const learned = getLearnedProducts(query, Math.ceil(limit * 0.3));
  const offProducts = searchProducts(query, limit + learned.length);
  
  const merged = [];
  const seenCodes = new Set();
  
  // Add learned first
  for (const p of learned) {
    if (!seenCodes.has(p.code)) {
      merged.push(p);
      seenCodes.add(p.code);
    }
  }
  
  // Add OFF products not already learned
  for (const p of offProducts) {
    if (!seenCodes.has(p.code)) {
      merged.push(p);
      seenCodes.add(p.code);
    }
  }
  
  return merged.slice(0, limit);
}

module.exports = {
  searchProducts,
  searchWithLearning,
  getLearnedProducts,
  guessCategory,
  detectStore,
  getDb
};