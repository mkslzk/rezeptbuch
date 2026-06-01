/**
 * Parse quantity string into amount and unit
 * Examples: "1L" -> { amount: "1", unit: "L" }
 *          "500g" -> { amount: "500", unit: "g" }
 *          "1.5kg" -> { amount: "1.5", unit: "kg" }
 */
function parseQuantity(quantityStr) {
  if (!quantityStr) return { amount: '', unit: '' };
  
  // Try to split into number and unit
  // Match patterns like: 1L, 500g, 1.5kg, 250 ml, 0.5l
  const match = quantityStr.match(/^([\d.,]+)\s*(.*)$/);
  
  if (match) {
    let amount = match[1].replace(',', '.');
    let unit = match[2].trim().toLowerCase();
    
    // Normalize common units
    const unitMap = {
      'l': 'L',
      'liter': 'L',
      'ml': 'ml',
      'milliliter': 'ml',
      'g': 'g',
      'gramm': 'g',
      'kg': 'kg',
      'kilogramm': 'kg',
      'stück': 'Stück',
      'stk': 'Stück',
      'packung': 'Pack',
      'pack': 'Pack',
    };
    
    unit = unitMap[unit] || unit;
    
    return { amount, unit };
  }
  
  return { amount: quantityStr, unit: '' };
}

/**
 * Detect store from brand name
 */
function detectStore(brand) {
  if (!brand) return '';
  
  const brandLower = brand.toLowerCase();
  
  const storeMap = {
    'vemondo': 'aldi',
    'milsani': 'aldi',
    'all seasons': 'aldi',
    'tandil': 'aldi',
    'choceur': 'aldi',
    'clasico': 'aldi',
    'oko': 'lidl',
    'freeway': 'lidl',
    'milbona': 'lidl',
    'crownfield': 'lidl',
    'alesto': 'lidl',
    'snack&play': 'lidl',
    'w5': 'lidl',
    'duschdas': 'lidl',
    'bc': 'lidl',
    'formil': 'lidl',
    'ja!': 'rewe',
    'voll & gut': 'rewe',
    'rewe original': 'rewe',
    'gut & günstig': 'edeka',
    'edeka bio': 'edeka',
    'gutfleisch': 'edeka',
    'bio': 'edeka',
    'netto': 'netto',
    'landliebe': 'penny',
    'k-classic': 'kaufland',
    'real,-': 'real',
    'metro chef': 'metro'
  };
  
  for (const [key, store] of Object.entries(storeMap)) {
    if (brandLower.includes(key)) {
      return store;
    }
  }
  
  return '';
}

/**
 * Get category from OFF product data
 */
function guessCategory(product) {
  const cats = (product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  
  if (cats.includes('milk') || cats.includes('milch') || cats.includes('dairy') || cats.includes('käse') || cats.includes('yoghurt') || cats.includes('yogurt')) return 'dairy';
  if (cats.includes('meat') || cats.includes('fleisch') || cats.includes('fish') || cats.includes('fisch')) return 'meat';
  if (cats.includes('vegetable') || cats.includes('gemüse') || cats.includes('fruit') || cats.includes('obst')) return 'produce';
  if (cats.includes('bread') || cats.includes('brot') || cats.includes('bakery') || cats.includes('gebäck')) return 'bakery';
  if (cats.includes('frozen') || cats.includes('tiefkühl') || cats.includes('eis')) return 'frozen';
  if (cats.includes('beverage') || cats.includes('getränk') || cats.includes('drink') || cats.includes('limonade')) return 'beverages';
  if (cats.includes('snack') || cats.includes('sweet') || cats.includes('schokolade') || cats.includes('candy') || cats.includes('keks')) return 'snacks';
  if (cats.includes('clean') || cats.includes('reinigung') || cats.includes('wasch')) return 'sonstiges';
  
  // Fallback based on name
  if (name.includes('milch') || name.includes('butter') || name.includes('käse') || name.includes('joghurt')) return 'dairy';
  if (name.includes('brot') || name.includes('brötchen') || name.includes('gebäck')) return 'bakery';
  if (name.includes('wasser') || name.includes('saft') || name.includes('cola')) return 'beverages';
  if (name.includes('fisch') || name.includes('lachs') || name.includes('thunfisch')) return 'meat';
  
  return 'sonstiges';
}

export { parseQuantity, detectStore, guessCategory };