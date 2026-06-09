/**
 * Learning Cache Service
 * Speichert häufig genutzte Einkaufslisten-Einträge in localStorage
 */

const LEARNING_KEY = 'moca-off-learning';
const MAX_LEARNED_ITEMS = 100;
const USAGE_DECAY_DAYS = 30; // Items die länger nicht verwendet werden, werden niedriger priorisiert

/**
 * Hole alle gelernten Items aus localStorage
 */
function getLearnedItems() {
  try {
    const raw = localStorage.getItem(LEARNING_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Speichere alle gelernten Items
 */
function saveLearnedItems(items) {
  try {
    localStorage.setItem(LEARNING_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save learned items:', e);
  }
}

/**
 * Lerne einen neuen Eintrag (wird aufgerufen wenn User einen OFF-Eintrag erstellt)
 */
export function learnItem(offProduct) {
  if (!offProduct || !offProduct.off_product_code) return;
  
  const learned = getLearnedItems();
  const existingIndex = learned.findIndex(i => i.off_product_code === offProduct.off_product_code);
  
  if (existingIndex >= 0) {
    // Item existiert bereits - erhöhe usage count
    learned[existingIndex].usageCount = (learned[existingIndex].usageCount || 1) + 1;
    learned[existingIndex].lastUsed = Date.now();
    learned[existingIndex].item = offProduct.item || learned[existingIndex].item;
    learned[existingIndex].category = offProduct.category || learned[existingIndex].category;
    learned[existingIndex].off_brand = offProduct.off_brand || learned[existingIndex].off_brand;
  } else {
    // Neues Item hinzufügen
    learned.push({
      off_product_code: offProduct.off_product_code,
      off_product_name: offProduct.off_product_name || offProduct.item,
      off_brand: offProduct.off_brand,
      off_quantity: offProduct.off_quantity,
      item: offProduct.item,
      category: offProduct.category || 'sonstiges',
      usageCount: 1,
      lastUsed: Date.now(),
      createdAt: Date.now()
    });
  }
  
  // Sortiere nach usage count und last used
  learned.sort((a, b) => {
    const scoreA = (a.usageCount || 1) * (1 + (Date.now() - (a.lastUsed || 0)) / (USAGE_DECAY_DAYS * 24 * 60 * 60 * 1000));
    const scoreB = (b.usageCount || 1) * (1 + (Date.now() - (b.lastUsed || 0)) / (USAGE_DECAY_DAYS * 24 * 60 * 60 * 1000));
    return scoreB - scoreA;
  });
  
  // Begrenze auf max items
  if (learned.length > MAX_LEARNED_ITEMS) {
    learned.splice(MAX_LEARNED_ITEMS);
  }
  
  saveLearnedItems(learned);
  console.log(`📚 Learned item: ${offProduct.off_product_name} (usage: ${learned.find(i => i.off_product_code === offProduct.off_product_code)?.usageCount})`);
}

/**
 * Finde passende gelernte Items basierend auf Suchtext
 */
export function findLearnedItems(query, limit = 5) {
  if (!query || query.trim().length < 2) return [];
  
  const learned = getLearnedItems();
  const queryLower = query.toLowerCase().trim();
  
  // Score items basierend auf:
  // 1. Wie oft verwendet (usageCount)
  // 2. Wie recently verwendet (lastUsed)
  // 3. Text-Match mit query
  
  const scored = learned.map(item => {
    let score = 0;
    const name = (item.off_product_name || item.item || '').toLowerCase();
    const brand = (item.off_brand || '').toLowerCase();
    
    // Direkter Match am Anfang der Query
    if (name.startsWith(queryLower)) score += 50;
    if (brand.startsWith(queryLower)) score += 30;
    
    // Query enthält im Namen
    if (name.includes(queryLower)) score += 20;
    if (brand.includes(queryLower)) score += 10;
    
    // Word match
    const queryWords = queryLower.split(/\s+/);
    const nameWords = name.split(/\s+/);
    for (const qw of queryWords) {
      for (const nw of nameWords) {
        if (nw.includes(qw) || qw.includes(nw)) score += 5;
      }
    }
    
    // Usage boost
    score += (item.usageCount || 1) * 2;
    
    // Recency boost (neuere items höher)
    const daysSinceUsed = (Date.now() - (item.lastUsed || 0)) / (24 * 60 * 60 * 1000);
    if (daysSinceUsed < 7) score += 10;
    else if (daysSinceUsed < 30) score += 5;
    
    return { ...item, matchScore: score };
  });
  
  return scored
    .filter(i => i.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit);
}

/**
 * Check ob ein OFF-Produkt bereits gelernt wurde
 */
export function isLearnedItem(offProductCode) {
  const learned = getLearnedItems();
  return learned.some(i => i.off_product_code === offProductCode);
}

/**
 * Statistik über gelernte Items
 */
export function getLearningStats() {
  const learned = getLearnedItems();
  return {
    totalItems: learned.length,
    mostUsed: learned.slice(0, 5).map(i => ({
      name: i.off_product_name || i.item,
      usageCount: i.usageCount || 1,
      lastUsed: i.lastUsed
    })),
    totalUsageCount: learned.reduce((sum, i) => sum + (i.usageCount || 1), 0)
  };
}

/**
 * Clear all learned items
 */
export function clearLearnedItems() {
  localStorage.removeItem(LEARNING_KEY);
  console.log('📚 Cleared all learned items');
}