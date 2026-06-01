/**
 * Store Brand Configuration
 * Can be customized per installation
 */

const STORE_BRANDS = {
  // ALDI Süd/Nord Eigenmarken
  aldi: [
    'vemondo', 'milsani', 'all seasons', 'tandil', 'choceur', 'clasico',
    'bon prix', 'siemens', 'activ', 'garden', 'pet', 'home', 'cereals'
  ],
  
  // Lidl Eigenmarken
  lidl: [
    'oko', 'freeway', 'milbona', 'crownfield', 'alesto', 'snack&play',
    'w5', 'evershop', 'park', 'invit', 'duschdas', 'bc', 'formil',
    'lacos', 'lacante', 'pasta', 'bianco', 'mantuani'
  ],
  
  // REWE Eigenmarken
  rewe: [
    'ja!', 'rewe original', 'rewe regional', 'rewe beste wahl', 'voll & gut',
    'freeway', 'beste wahl', 'reinhold', 'tuchel', 'wolke'
  ],
  
  // EDEKA Eigenmarken
  edeka: [
    'gut & günstig', 'edeka bio', 'edeka regional', 'edeka beste wahl',
    'gutfleisch', 'gut固günstig', 'ein gutes stück', 'backstube'
  ],
  
  // Netto Eigenmarken
  netto: [
    'netto marken-discount', 'netto', 'barbeel', 'ducker', 'gabriella'
  ],
  
  // PENNY Eigenmarken
  penny: [
    'penny', 'fresh', 'landliebe', 'mylord', 'penny marke'
  ],
  
  // Kaufland Eigenmarken
  kaufland: [
    'k-classic', 'breischein', 'fresh', 'kaufland', 'dem', 'oventrop'
  ],
  
  // Real Eigenmarken
  real: [
    'real,-', 'real', 'ofengold', 'golden food', 'tafelfreude'
  ],
  
  // Metro Eigenmarken
  metro: [
    'metro chef', 'metro professional', 'rodem', 'joker', 'impact'
  ],
  
  // TANMARKEN (bekannte Marken die oft günstiger sind)
  knownBrands: [
    'millac', 'landliebe', 'herzo', 'denn', 'taste of asia', 'golden',
    'organic', 'bio', 'natur', 'gut', 'basic', 'klassik', 'prmium', 'value',
    'oatly', 'alpro', 'sojadrink', 'haferdrink', 'plant', 'vegan', 'bio PLANt'
  ],

  // Plant-based brands
  // Plant-based brands (generic)
  plantBased: [
    'oatly', 'alpro', 'sojadrink', 'haferdrink', 'plant', 'vegan', 'bioplan',
    'limBURger', 'likemeat', 'gustibus', 'pfanner', 'innocent', 'fructopia',
    'vegana', 'gardein', 'beyond', 'impossible', 'moving mountains', ' végétal'
  ],
  
  // Plant-based Eigenmarken (store brands)
  plantStoreBrands: {
    aldi: ['bio plant', 'plant based', 'organic plant', 'vegan line', 'gut bio'],
    lidl: ['w5 plant', 'freeway vegan', 'belbake vegan', 'finest menu vegan'],
    rewe: ['ja! bio', 'rewe bio plant', 'voll & gut vegan', 'beste wahl vegan'],
    edeka: ['edeka bio plant', 'gut & günstig vegan', 'gutfleisch vegan'],
    netto: ['netto bio', 'barbeel vegan'],
    penny: ['penny bio', 'landliebe vegan'],
    kaufland: ['k-classic vegan', 'bio freunde'],
    real: ['real,- bio', 'tafelfreude vegan']
  }
};

/**
 * Check if a product is a store/discount brand
 */
function isStoreBrand(brand, productName) {
  const searchText = ((brand || '') + ' ' + (productName || '')).toLowerCase();
  
  // Check all store brands
  for (const [store, brands] of Object.entries(STORE_BRANDS)) {
    if (store === 'knownBrands') continue;
    for (const storeBrand of brands) {
      if (searchText.includes(storeBrand)) {
        return { isStoreBrand: true, store, brand: storeBrand };
      }
    }
  }
  
  // Also check known brands list
  for (const known of STORE_BRANDS.knownBrands) {
    if (searchText.includes(known)) {
      return { isStoreBrand: true, store: 'known', brand: known };
    }
  }
  
  return { isStoreBrand: false };
}

/**
 * Get store name from store identifier
 */
function getStoreName(storeKey) {
  const names = {
    aldi: 'ALDI',
    lidl: 'LIDL',
    rewe: 'REWE',
    edeka: 'EDEKA',
    netto: 'Netto',
    penny: 'PENNY',
    kaufland: 'Kaufland',
    real: 'Real',
    metro: 'METRO',
    known: 'Marke'
  };
  return names[storeKey] || storeKey;
}

/**
 * Export config for client-side display
 */
function getStoreBrandConfig() {
  return STORE_BRANDS;
}

module.exports = { 
  STORE_BRANDS, 
  isStoreBrand, 
  getStoreName,
  getStoreBrandConfig 
};