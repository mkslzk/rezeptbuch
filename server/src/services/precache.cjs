/**
 * Pre-cache common German products on server startup
 */

const { learnProduct } = require('./learningService.cjs');
const { searchOpenFoodFacts } = require('./openFoodFacts.cjs');

const COMMON_PRODUCTS = [
  // Milchprodukte
  { term: 'vollmilch', name: 'Vollmilch' },
  { term: 'hafermilch', name: 'Hafer Milch' },
  { term: 'butter', name: 'Butter' },
  { term: 'käse', name: 'Käse' },
  { term: 'joghurt', name: 'Joghurt' },
  { term: 'quark', name: 'Quark' },
  { term: 'eier', name: 'Eier' },
  
  // Brot & Gebäck
  { term: 'brot', name: 'Brot' },
  { term: 'brötchen', name: 'Brötchen' },
  { term: 'toast', name: 'Toast' },
  
  // Grundnahrungsmittel
  { term: 'mehl', name: 'Mehl' },
  { term: 'zucker', name: 'Zucker' },
  { term: 'salz', name: 'Salz' },
  { term: 'reis', name: 'Reis' },
  { term: 'nudeln', name: 'Nudeln' },
  { term: 'pasta', name: 'Pasta' },
  
  // Getränke
  { term: 'wasser', name: 'Mineralwasser' },
  { term: 'cola', name: 'Cola' },
  { term: 'saft', name: 'Orangensaft' },
  { term: 'kaffee', name: 'Kaffee' },
  { term: 'tee', name: 'Tee' },
  
  // Obst & Gemüse
  { term: 'bananen', name: 'Bananen' },
  { term: 'äpfel', name: 'Äpfel' },
  { term: 'tomaten', name: 'Tomaten' },
  { term: 'kartoffeln', name: 'Kartoffeln' },
  { term: 'zwiebeln', name: 'Zwiebeln' },
  { term: 'knoblauch', name: 'Knoblauch' },
  
  // Fleisch & Fisch
  { term: 'hähnchen', name: 'Hähnchen' },
  { term: 'rindfleisch', name: 'Rindfleisch' },
  { term: 'fisch', name: 'Fisch' },
  { term: 'lachs', name: 'Lachs' },
  
  // Tiefkühl
  { term: 'pizza', name: 'Pizza' },
  { term: 'pommes', name: 'Pommes' },
  { term: 'eis', name: 'Speiseeis' },
  
  // Snacks & Sonstiges
  { term: 'schokolade', name: 'Schokolade' },
  { term: 'chips', name: 'Chips' },
  { term: 'bonbons', name: 'Bonbons' },
  { term: 'eiscreme', name: 'Eiscreme' },
  
  // Reinigung
  { term: 'spülmittel', name: 'Spülmittel' },
  { term: 'waschmittel', name: 'Waschmittel' },
  { term: 'toilettenpapier', name: 'Toilettenpapier' },
  { term: 'küchenrolle', name: 'Küchenrolle' },
];

let precacheInProgress = false;

/**
 * Pre-cache common products in the background
 */
async function precacheCommonProducts() {
  if (precacheInProgress) {
    console.log('📦 Pre-cache already in progress, skipping');
    return;
  }
  
  precacheInProgress = true;
  console.log('📦 Starting pre-cache of common products...');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const { term, name } of COMMON_PRODUCTS) {
    try {
      const products = await searchOpenFoodFacts(term, 3);
      
      if (products && products.length > 0) {
        // Learn the first/best result
        const top = products[0];
        learnProduct({
          off_product_code: top.code,
          off_product_name: top.name,
          off_brand: top.brand,
          off_quantity: top.quantity,
          item: top.name,
          category: guessCategory(top),
          _precached: true
        });
        successCount++;
      } else {
        failCount++;
      }
      
      // Small delay to be nice to OFF API
      await new Promise(r => setTimeout(r, 100));
      
    } catch (err) {
      console.log(`  ⚠️ Failed to pre-cache "${name}": ${err.message}`);
      failCount++;
    }
  }
  
  precacheInProgress = false;
  console.log(`📦 Pre-cache done: ${successCount} products cached, ${failCount} failed`);
}

/**
 * Guess category from product data
 */
function guessCategory(product) {
  const cats = (product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  
  if (cats.includes('milk') || cats.includes('milch') || cats.includes('dairy') || cats.includes('käse') || cats.includes('yoghurt')) return 'dairy';
  if (cats.includes('meat') || cats.includes('fleisch') || cats.includes('fish') || cats.includes('fisch')) return 'meat';
  if (cats.includes('vegetable') || cats.includes('gemüse') || cats.includes('fruit') || cats.includes('obst')) return 'produce';
  if (cats.includes('bread') || cats.includes('brot') || cats.includes('bakery')) return 'bakery';
  if (cats.includes('frozen') || cats.includes('tiefkühl')) return 'frozen';
  if (cats.includes('beverage') || cats.includes('getränk') || cats.includes('drink')) return 'beverages';
  if (cats.includes('snack') || cats.includes('sweet') || cats.includes('schokolade') || cats.includes('candy')) return 'snacks';
  if (cats.includes('clean') || cats.includes('reinigung')) return 'sonstiges';
  return 'sonstiges';
}

module.exports = { precacheCommonProducts };