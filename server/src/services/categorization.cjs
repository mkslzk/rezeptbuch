// Categorization service: parses OFF products into our internal category/store model.
// Single source of truth — replaces ~140 lines of duplicate logic that was inlined in
// client/src/components/ProductSearch.jsx.

// === Parse "200 g" / "1 L" / "6 Stück" into { amount, unit } ===
function parseQuantity(quantityStr) {
  if (!quantityStr) return { amount: '', unit: '' };
  const match = quantityStr.match(/^([\d.,]+)\s*(.*)$/);
  if (match) {
    let amount = match[1].replace(',', '.');
    let unit = match[2].trim().toLowerCase();
    const unitMap = {
      'l': 'L', 'liter': 'L', 'ml': 'ml',
      'g': 'g', 'gramm': 'g', 'kg': 'kg',
      'stück': 'Stück', 'stk': 'Stück'
    };
    unit = unitMap[unit] || unit;
    return { amount, unit };
  }
  return { amount: quantityStr, unit: '' };
}

// === Detect store from brand/product name (Eigenmarken heuristic) ===
const STORE_MAP = {
  // ALDI
  'vemondo': 'aldi', 'milsani': 'aldi', 'all seasons': 'aldi', 'tandil': 'aldi', 'choceur': 'aldi',
  'bio plant': 'aldi', 'plant based': 'aldi', 'organic plant': 'aldi',
  // LIDL
  'oko': 'lidl', 'freeway': 'lidl', 'milbona': 'lidl', 'crownfield': 'lidl', 'alesto': 'lidl',
  'alpro': 'lidl',
  'w5 plant': 'lidl', 'freeway vegan': 'lidl',
  // REWE
  'ja!': 'rewe', 'voll & gut': 'rewe', 'rewe': 'rewe',
  'ja! bio': 'rewe', 'rewe bio plant': 'rewe', 'voll & gut vegan': 'rewe',
  // EDEKA
  'gut & günstig': 'edeka', 'edeka bio': 'edeka', 'gutfleisch': 'edeka',
  'edeka bio plant': 'edeka', 'gut & günstig vegan': 'edeka',
  // Other
  'netto': 'netto', 'landliebe': 'penny', 'k-classic': 'kaufland', 'k-classic vegan': 'kaufland',
  'real,-': 'real', 'metro chef': 'metro',
  'penny bio': 'penny'
};

function detectStore(brand, productName) {
  if (!brand && !productName) return '';
  const searchText = ((brand || '') + ' ' + (productName || '')).toLowerCase();
  for (const [key, store] of Object.entries(STORE_MAP)) {
    if (searchText.includes(key)) return store;
  }
  return '';
}

// === Category rules: keyword lists → our internal categories ===
const VALID_CATEGORIES = ['dairy', 'meat', 'produce', 'bakery', 'frozen', 'beverages', 'snacks', 'plant', 'sonstiges', 'pantry'];

// Each rule: { category, categoryKeywords: [], nameKeywords: [] }
// Order matters — first match wins.
// Order matters: plant + frozen are checked BEFORE dairy so that
// "Alpro Sojamilch" → plant, "Eis am Stiel" → frozen, "Brötchen" → bakery.
const CATEGORY_RULES = [
  // 1) PLANT — must beat dairy for plant-milk alternatives
  { category: 'plant', categoryKeywords: ['plant-based', 'vegan', 'dairy substitute', 'substitute'], nameKeywords: ['oatly', 'alpro', 'haferdrink', 'sojadrink', 'hafermilch', 'sojamilch', 'mandelmilch', 'kokosmilch', 'reisdrink', 'plant', 'vegan', 'soja', 'almond', 'rice', 'coconut', 'likemeat', 'bio plant', 'plant based', 'organic plant', 'vegan line', 'gut bio', 'w5 plant', 'freeway vegan', 'rewe bio', 'voll & gut vegan', 'edeka bio', 'gutfleisch vegan', 'landliebe vegan', 'k-classic vegan'] },
  // 2) FROZEN — must beat dairy for ice cream / eis
  { category: 'frozen', categoryKeywords: ['tiefkühl', 'tiefkuehl', 'frozen', 'eiscreme', 'speiseeis'], nameKeywords: ['eis am stiel', 'speiseeis', 'tiefkühl', 'tiefkuehl', 'pizza tiefkühl', 'pizza tiefkuehl'] },
  // 3) MEAT/FISH
  { category: 'meat', categoryKeywords: ['fleisch', 'fisch', 'wurst', 'meat', 'fish', 'geflügel', 'gefluegel', 'hähnchen', 'haehnchen', 'rind', 'schwein', 'thunfisch', 'lachs', 'salm', 'salami'], nameKeywords: ['thunfisch', 'lachs', 'salami', 'hackfleisch', 'schnitzel'] },
  // 4) DAIRY — only true dairy, no 'eis' (handled by frozen)
  //    Includes German 'milch' for OFF data, but plant-milks are caught earlier by plant.
  { category: 'dairy', categoryKeywords: ['joghurt', 'jogurt', 'käse', 'kaese', 'quark', 'milch', 'butter', 'cream', 'yoghurt', 'dairy', 'milk', 'frischkäse', 'frischkaese', 'schmand', 'mléčné', 'fermented', 'dessert'], nameKeywords: ['joghurt', 'jogurt', 'quark', 'milch', 'butter', 'käse', 'kaese', 'yoghurt', 'yogurt', 'dairy', 'cheese', 'crème', 'creme', 'schmand', 'frischkäse', 'frischkaese'] },
  // 5) PRODUCE
  { category: 'produce', categoryKeywords: ['gemüse', 'gemüse', 'obst', 'frucht', 'vegetable', 'fruit', 'salat'], nameKeywords: [] },
  // 6) BAKERY — no 'wurst' here (that means sausage, not bread-roll)
  { category: 'bakery', categoryKeywords: ['brot', 'brötchen', 'broetchen', 'gebäck', 'gebaeck', 'bread', 'bakery', 'backwaren'], nameKeywords: ['brot', 'brötchen', 'broetchen'] },
  // 7) BEVERAGES — explicit drink words only (oatly/haferdrink now in plant)
  { category: 'beverages', categoryKeywords: ['getränk', 'getraenk', 'beverage', 'drink', 'limonade', 'saft', 'wasser'], nameKeywords: ['wasser', 'cola', 'limonade', 'fanta', 'sprite', 'bier', 'wein', 'saft', 'juice'] },
  // 8) SNACKS
  { category: 'snacks', categoryKeywords: ['schokolade', 'candy', 'keks', 'snack', 'sweet', 'bonbon'], nameKeywords: ['schokolade', 'keks', 'kekse', 'gummibärchen', 'gummibaerchen'] },
  // 9) SONSTIGES (cleaning, household)
  { category: 'sonstiges', categoryKeywords: ['reinigung', 'wasch', 'clean', 'haushalt'], nameKeywords: [] }
];

function guessCategory(product) {
  if (!product) return 'sonstiges';

  // 1) If product already has one of our categories, trust it
  if (product.category && VALID_CATEGORIES.includes(product.category)) {
    return product.category;
  }

  const catStr = ((product.category || product.categories || '') + '').toLowerCase();
  const name = (product.name || '').toLowerCase();

  // 2) Match against rules in order
  for (const rule of CATEGORY_RULES) {
    const catHit = rule.categoryKeywords.some(kw => catStr.includes(kw));
    if (catHit) return rule.category;
  }
  for (const rule of CATEGORY_RULES) {
    const nameHit = rule.nameKeywords.some(kw => name.includes(kw));
    if (nameHit) return rule.category;
  }

  return 'sonstiges';
}

// === Master: enrich a raw product into our shopping-item format ===
function enrichProduct(product) {
  if (!product) return null;
  const { amount, unit } = parseQuantity(product.quantity);
  return {
    item: product.name,
    amount,
    unit,
    category: guessCategory(product),
    store: detectStore(product.brand, product.name),
    off_product_name: product.name,
    off_product_code: product.code,
    off_brand: product.brand,
    off_quantity: product.quantity
  };
}

module.exports = {
  parseQuantity,
  detectStore,
  guessCategory,
  enrichProduct,
  VALID_CATEGORIES
};
