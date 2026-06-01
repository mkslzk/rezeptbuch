/**
 * Open Food Facts API Service
 * Priorisiert deutsche Produkte mit cc=DE Filter
 */

const { offCache } = require('./offCache.cjs');

const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_API_V2 = 'https://world.openfoodfacts.org/api/v2';
const PRODUCT_URL = `${OFF_API_V2}/product`;

// German country code for filtering
const DE_FILTER = 'cc=DE';

/**
 * Search Open Food Facts for products (prioritizing German products)
 */
async function searchOpenFoodFacts(searchTerm, pageSize = 5) {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  const cacheKey = `search:${searchTerm.toLowerCase().trim()}:${pageSize}:de`;
  
  // Check cache first
  const cached = offCache.get(cacheKey);
  if (cached) {
    console.log(`📦 OFF cache hit: "${searchTerm}"`);
    return cached;
  }

  try {
    // Try first with German country filter
    const params = new URLSearchParams({
      search_terms: searchTerm,
      search_simple: 1,
      json: 1,
      page_size: pageSize,
      cc: 'DE',  // German products priority
      fields: 'code,product_name,product_name_de,brands,categories,quantity,image_url,url'
    });

    console.log(`🔍 OFF search (DE): "${searchTerm}"`);
    
    const response = await fetch(`${OFF_SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        const products = data.products || [];

        if (products.length > 0) {
          // We have German products!
          const result = transformProducts(products, pageSize);
          offCache.set(cacheKey, result);
          return result;
        }
      }
    }
    
    // If DE filter returned no results or failed, try without filter but still prefer German
    console.log(`🔍 OFF fallback (all): "${searchTerm}"`);
    return await searchWithoutDEFilter(searchTerm, pageSize, cacheKey);
    
  } catch (err) {
    console.error('OFF search failed:', err.message);
    return await searchWithoutDEFilter(searchTerm, pageSize, cacheKey);
  }
}

/**
 * Fallback search without DE filter (but still prefer German products)
 */
async function searchWithoutDEFilter(searchTerm, pageSize, cacheKey) {
  try {
    const params = new URLSearchParams({
      search_terms: searchTerm,
      search_simple: 1,
      json: 1,
      page_size: pageSize * 3, // Fetch more to filter
      fields: 'code,product_name,product_name_de,brands,categories,quantity,image_url,url'
    });

    const response = await fetch(`${OFF_SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      // Try API v2 as last resort
      return await searchV2Fallback(searchTerm, pageSize, cacheKey);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return await searchV2Fallback(searchTerm, pageSize, cacheKey);
    }

    const data = await response.json();
    let products = data.products || [];

    // Filter and prioritize: German products first
    products = prioritizeGermanProducts(products);
    const result = transformProducts(products.slice(0, pageSize), pageSize);
    offCache.set(cacheKey, result);
    return result;
    
  } catch (err) {
    console.error('OFF fallback failed:', err.message);
    return await searchV2Fallback(searchTerm, pageSize, cacheKey);
  }
}

/**
 * Last resort: API v2 fallback
 */
async function searchV2Fallback(searchTerm, pageSize, cacheKey) {
  try {
    const params = new URLSearchParams({
      search_terms: searchTerm,
      page_size: pageSize,
      fields: 'code,product_name,product_name_de,brands,categories,quantity,image_url,url'
    });

    const response = await fetch(`${OFF_API_V2}/search?${params}`, {
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return [];

    const data = await response.json();
    let products = data.products || [];
    products = prioritizeGermanProducts(products);
    
    const result = transformProducts(products.slice(0, pageSize), pageSize);
    offCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('OFF v2 fallback failed:', err.message);
    return [];
  }
}

/**
 * Prioritize German products in the result list
 */
function prioritizeGermanProducts(products) {
  return products.sort((a, b) => {
    const aHasDE = !!(a.product_name_de && a.product_name_de.trim());
    const bHasDE = !!(b.product_name_de && b.product_name_de.trim());
    if (aHasDE && !bHasDE) return -1;
    if (!aHasDE && bHasDE) return 1;
    return 0;
  });
}

/**
 * Transform OFF product to our format
 */
function transformProducts(products, limit) {
  return products
    .filter(p => p.product_name_de || p.product_name)
    .slice(0, limit)
    .map(p => ({
      code: p.code,
      name: p.product_name_de || p.product_name || '',
      brand: p.brands || '',
      category: p.categories || '',
      quantity: p.quantity || '',
      imageUrl: p.image_url || '',
      url: p.url || ''
    }));
}

/**
 * Get a single product by barcode (with caching)
 */
async function getProductByBarcode(barcode) {
  if (!barcode) return null;

  const cacheKey = `barcode:${barcode}`;
  const cached = offCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${PRODUCT_URL}/${barcode}.json`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const result = {
      code: p.code,
      name: p.product_name_de || p.product_name || '',
      brand: p.brands || '',
      category: p.categories || '',
      quantity: p.quantity || '',
      imageUrl: p.image_front_url || p.image_url || '',
      url: `https://world.openfoodfacts.org/product/${p.code}`
    };

    offCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.error('OFF barcode lookup error:', err.message);
    return null;
  }
}

/**
 * Create a standardized search key from product data
 */
function createSearchKey(product) {
  if (!product) return '';
  const name = (product.name || '').toLowerCase().trim();
  const brand = (product.brand || '').toLowerCase().trim();
  
  const words = name.split(/\s+/).filter(w => w.length > 2);
  
  if (brand && brand.length < 15 && !name.includes(brand)) {
    words.unshift(brand);
  }
  
  return words.join(' ');
}

/**
 * Find best matching OFF product for a store offer
 */
function matchOfferToProduct(offerName, store, offProducts) {
  if (!offProducts || offProducts.length === 0) return null;
  
  const offerWords = offerName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const product of offProducts) {
    const productWords = product.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    let score = 0;
    
    for (const ow of offerWords) {
      for (const pw of productWords) {
        if (pw.includes(ow) || ow.includes(pw)) {
          score += 2;
        }
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = product;
    }
  }
  
  return bestMatch && bestScore > 0 ? { product: bestMatch, score: bestScore } : null;
}

module.exports = { 
  searchOpenFoodFacts, 
  getProductByBarcode, 
  createSearchKey,
  matchOfferToProduct,
  offCache 
};