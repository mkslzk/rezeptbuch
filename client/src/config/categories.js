// Recipe Categories Configuration
// Easy to switch between languages - just change the LABELS object

export const CATEGORY_LABELS = {
  // German labels (current)
  'hauptgericht': 'Hauptgericht',
  'vorspeise': 'Vorspeise',
  'suppe': 'Suppe',
  'salat': 'Salat',
  'dessert': 'Dessert',
  'snack': 'Snack',
  'frühstück': 'Frühstück',
  'backen': 'Backen',
  'getränk': 'Getränk',
  'sonstiges': 'Sonstiges',
};

// Emoji placeholder for recipes without an image — picked by category
export const CATEGORY_EMOJIS = {
  'hauptgericht': '🍖',
  'vorspeise': '🥗',
  'suppe': '🍲',
  'salat': '🥗',
  'dessert': '🍰',
  'snack': '🍪',
  'frühstück': '🥞',
  'backen': '🥐',
  'getränk': '🥤',
  'sonstiges': '🍳',
};

export const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

// Get display label for a category key
export function getCategoryLabel(key) {
  return CATEGORY_LABELS[key] || key;
}

// Get emoji placeholder for a category (used when recipe has no image)
export function getCategoryEmoji(key) {
  return CATEGORY_EMOJIS[key] || '🍳';
}

// Get all categories as options array
export function getCategoryOptions() {
  return CATEGORY_KEYS.map(key => ({
    value: key,
    label: CATEGORY_LABELS[key]
  }));
}