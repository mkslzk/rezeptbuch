/**
 * Server-side Learning Service
 * Persists learned products across sessions/devices
 */

const fs = require('fs');
const { isStoreBrand } = require('./storeBrands.cjs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'learned-products.json');
const MAX_LEARNED = 200;

function ensureDataDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadLearned() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load learned products:', e);
  }
  return [];
}

function saveLearned(learned) {
  try {
    ensureDataDir();
    fs.writeFileSync(DATA_FILE, JSON.stringify(learned, null, 2));
  } catch (e) {
    console.error('Failed to save learned products:', e);
  }
}

/**
 * Learn a product (called when user selects from OFF)
 */
function learnProduct(product) {
  if (!product || !product.off_product_code) return null;
  
  const learned = loadLearned();
  const now = Date.now();
  
  const existing = learned.find(i => i.off_product_code === product.off_product_code);
  
  if (existing) {
    existing.usageCount = (existing.usageCount || 1) + 1;
    existing.lastUsed = now;
    existing.off_product_name = product.off_product_name || existing.off_product_name;
    existing.off_brand = product.off_brand || existing.off_brand;
    existing.off_quantity = product.off_quantity || existing.off_quantity;
    existing.off_image_url = product.off_image_url || existing.off_image_url;
    existing.item = product.item || existing.item;
    existing.category = product.category || existing.category;
  } else {
    learned.push({
      off_product_code: product.off_product_code,
      off_product_name: product.off_product_name,
      off_brand: product.off_brand,
      off_quantity: product.off_quantity,
      off_image_url: product.off_image_url || '',
      item: product.item,
      category: product.category,
      usageCount: 1,
      lastUsed: now,
      createdAt: now
    });
  }
  
  // Sort by usage count
  learned.sort((a, b) => (b.usageCount || 1) - (a.usageCount || 1));
  
  // Trim to max
  if (learned.length > MAX_LEARNED) {
    learned.splice(MAX_LEARNED);
  }
  
  saveLearned(learned);
  return existing || learned.find(i => i.off_product_code === product.off_product_code);
}

/**
 * Find learned products matching a query
 * Only returns products where name/brand fuzzy matches query
 */
function findLearned(query, limit = 7) {
  if (!query || query.trim().length < 2) return [];
  
  const learned = loadLearned();
  const queryLower = query.toLowerCase().trim();
  
  // Calculate relevance score for each learned product
  return learned
    .map(item => {
      const name = (item.off_product_name || item.item || '').toLowerCase();
      const brand = (item.off_brand || '').toLowerCase();
      
      // Calculate match score based on fuzzy text match
      let textScore = 0;
      
      // Exact or starts with query
      if (name.startsWith(queryLower)) textScore += 50;
      if (brand.startsWith(queryLower)) textScore += 30;
      
      // Query contained in name/brand
      if (name.includes(queryLower)) textScore += 20;
      if (brand.includes(queryLower)) textScore += 10;
      
      // Word-level matching
      const queryWords = queryLower.split(/\s+/);
      const nameWords = name.split(/\s+/);
      for (const qw of queryWords) {
        for (const nw of nameWords) {
          if (nw.includes(qw) || qw.includes(nw)) {
            textScore += 5;
          }
        }
      }
      
      // If no text match at all, don't include this product
      if (textScore === 0) return null;
      
      // Boost by usage count
      const usageBoost = (item.usageCount || 1) * 2;
      
      // Recency boost
      const daysSinceUsed = (Date.now() - (item.lastUsed || 0)) / (24 * 60 * 60 * 1000);
      let recencyBoost = 0;
      if (daysSinceUsed < 7) recencyBoost = 10;
      else if (daysSinceUsed < 30) recencyBoost = 5;
      
      // Store brand boost (Eigenmarken)
      const itemBrand = (item.off_brand || '').toLowerCase();
      const itemName = (item.off_product_name || item.item || '').toLowerCase();
      const storeBrands = ['gut', 'basic', 'bio', 'natur', 'rewe', 'aldi', 'lidl', 'penny', 'edeka', 'netto', 'kaufland'];
      if (storeBrands.some(b => itemBrand.includes(b) || itemName.includes(b))) {
        textScore += 15; // Boost store Eigenmarken
      }
      
      return { 
        ...item, 
        matchScore: textScore + usageBoost + recencyBoost 
      };
    })
    .filter(i => i !== null)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Get all learned products
 */
function getAllLearned() {
  return loadLearned();
}

/**
 * Clear all learned products
 */
function clearLearned() {
  saveLearned([]);
}

module.exports = { learnProduct, findLearned, getAllLearned, clearLearned };