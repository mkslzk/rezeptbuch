// Theme Configuration
// Modular theming system for Rezeptbuch
// Based on trending food/culinary color palettes

export const THEMES = {
  
  // ============================================
  // EXISTING THEMES (preserved)
  // ============================================
  
  'oma': {
    id: 'oma',
    name: 'Omas Kochbuch',
    description: 'Warmes, vintage Design wie Omas altes Kochbuch',
    colors: {
      '--color-cream': '#FAF5E9',
      '--color-paper': '#FFF8F0',
      '--color-sepia': '#E8DCC8',
      '--color-sepia-dark': '#C4B49A',
      '--color-border': '#D4C4A8',
      '--color-accent': '#B85C38',
      '--color-accent-light': '#D4785C',
      '--color-brown': '#5C3D2E',
      '--color-brown-dark': '#3E2A1F',
      '--color-text': '#4A3728',
      '--color-text-light': '#8B7355',
    },
    fonts: {
      '--font-heading': "'Playfair Display', Georgia, serif",
      '--font-accent': "'Libre Baskerville', 'Times New Roman', serif",
      '--font-body': "'Source Serif Pro', Georgia, serif",
    },
    effects: {
      '--shadow': '2px 2px 8px rgba(94, 61, 46, 0.15)',
      '--shadow-lg': '4px 4px 16px rgba(94, 61, 46, 0.2)',
      '--radius': '8px',
      '--radius-lg': '12px',
    }
  },
  
  'minimal': {
    id: 'minimal',
    name: 'Minimal',
    description: 'Schlicht, clean, moderne Typografie',
    colors: {
      '--color-cream': '#FAFAFA',
      '--color-paper': '#FFFFFF',
      '--color-sepia': '#F0F0F0',
      '--color-sepia-dark': '#E0E0E0',
      '--color-border': '#DDDDDD',
      '--color-accent': '#2563EB',
      '--color-accent-light': '#3B82F6',
      '--color-brown': '#1F2937',
      '--color-brown-dark': '#111827',
      '--color-text': '#374151',
      '--color-text-light': '#6B7280',
    },
    fonts: {
      '--font-heading': "'Inter', -apple-system, sans-serif",
      '--font-accent': "'Inter', -apple-system, sans-serif",
      '--font-body': "'Inter', -apple-system, sans-serif",
    },
    effects: {
      '--shadow': '0 1px 3px rgba(0, 0, 0, 0.1)',
      '--shadow-lg': '0 4px 12px rgba(0, 0, 0, 0.1)',
      '--radius': '6px',
      '--radius-lg': '10px',
    }
  },
  
  'nordic': {
    id: 'nordic',
    name: 'Nordic',
    description: 'Skandinavisch, hell, kühle Farbtöne',
    colors: {
      '--color-cream': '#F8F9FA',
      '--color-paper': '#FFFFFF',
      '--color-sepia': '#ECEFF1',
      '--color-sepia-dark': '#CFD8DC',
      '--color-border': '#B0BEC5',
      '--color-accent': '#5C6BC0',
      '--color-accent-light': '#7986CB',
      '--color-brown': '#37474F',
      '--color-brown-dark': '#263238',
      '--color-text': '#455A64',
      '--color-text-light': '#90A4AE',
    },
    fonts: {
      '--font-heading': "'Nunito Sans', -apple-system, sans-serif",
      '--font-accent': "'Nunito Sans', -apple-system, sans-serif",
      '--font-body': "'Nunito Sans', -apple-system, sans-serif",
    },
    effects: {
      '--shadow': '0 2px 8px rgba(55, 71, 79, 0.08)',
      '--shadow-lg': '0 4px 16px rgba(55, 71, 79, 0.12)',
      '--radius': '4px',
      '--radius-lg': '8px',
    }
  },
  
  'dark': {
    id: 'dark',
    name: 'Dark Mode',
    description: 'Dunkles Theme für Nachtleser',
    colors: {
      '--color-cream': '#1A1A2E',
      '--color-paper': '#16213E',
      '--color-sepia': '#1F2937',
      '--color-sepia-dark': '#374151',
      '--color-border': '#4B5563',
      '--color-accent': '#F59E0B',
      '--color-accent-light': '#FBBF24',
      '--color-brown': '#FCD34D',
      '--color-brown-dark': '#F59E0B',
      '--color-text': '#E5E7EB',
      '--color-text-light': '#9CA3AF',
    },
    fonts: {
      '--font-heading': "'Inter', -apple-system, sans-serif",
      '--font-accent': "'Inter', -apple-system, sans-serif",
      '--font-body': "'Inter', -apple-system, sans-serif",
    },
    effects: {
      '--shadow': '0 2px 8px rgba(0, 0, 0, 0.3)',
      '--shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.4)',
      '--radius': '8px',
      '--radius-lg': '12px',
    }
  },

  // ============================================
  // NEW FOOD-INSPIRED THEMES (2026-05-14)
  // Based on trending culinary palettes
  // ============================================
  
  'peach-fuzz': {
    id: 'peach-fuzz',
    name: 'Peach Fuzz',
    description: 'Pantone 2024 – weich, warm, einladend',
    colors: {
      '--color-cream': '#FFF5EE',
      '--color-paper': '#FFFFFF',
      '--color-sepia': '#FFE8D6',
      '--color-sepia-dark': '#FFDAB9',
      '--color-border': '#FFBE98',
      '--color-accent': '#FF9A6C',
      '--color-accent-light': '#FFB347',
      '--color-brown': '#8B4513',
      '--color-brown-dark': '#6B3410',
      '--color-text': '#5D4037',
      '--color-text-light': '#A1887F',
    },
    fonts: {
      '--font-heading': "'Playfair Display', Georgia, serif",
      '--font-accent': "'Libre Baskerville', serif",
      '--font-body': "'Source Serif Pro', Georgia, serif",
    },
    effects: {
      '--shadow': '2px 2px 12px rgba(139, 69, 19, 0.12)',
      '--shadow-lg': '4px 4px 20px rgba(139, 69, 19, 0.18)',
      '--radius': '10px',
      '--radius-lg': '16px',
    }
  },
  
  'fresh-garden': {
    id: 'fresh-garden',
    name: 'Fresh Garden',
    description: 'Frisch, grün, natürlich – wie ein Bauernmarkt',
    colors: {
      '--color-cream': '#F5F5DC',
      '--color-paper': '#FEFEFA',
      '--color-sepia': '#E8F5E9',
      '--color-sepia-dark': '#C8E6C9',
      '--color-border': '#A5D6A7',
      '--color-accent': '#43A047',
      '--color-accent-light': '#66BB6A',
      '--color-brown': '#2E7D32',
      '--color-brown-dark': '#1B5E20',
      '--color-text': '#33691E',
      '--color-text-light': '#689F38',
    },
    fonts: {
      '--font-heading': "'Nunito Sans', -apple-system, sans-serif",
      '--font-accent': "'Nunito Sans', -apple-system, sans-serif",
      '--font-body': "'Source Serif Pro', Georgia, serif",
    },
    effects: {
      '--shadow': '0 2px 8px rgba(46, 125, 50, 0.15)',
      '--shadow-lg': '0 4px 16px rgba(46, 125, 50, 0.2)',
      '--radius': '6px',
      '--radius-lg': '12px',
    }
  },
  
  'berry': {
    id: 'berry',
    name: 'Berry',
    description: 'Beerenfarben, elegant, fruchtig',
    colors: {
      '--color-cream': '#FDF2F8',
      '--color-paper': '#FFFFFF',
      '--color-sepia': '#FCE4EC',
      '--color-sepia-dark': '#F8BBD9',
      '--color-border': '#F48FB1',
      '--color-accent': '#C2185B',
      '--color-accent-light': '#E91E63',
      '--color-brown': '#880E4F',
      '--color-brown-dark': '#560727',
      '--color-text': '#4A148C',
      '--color-text-light': '#7B1FA2',
    },
    fonts: {
      '--font-heading': "'Playfair Display', Georgia, serif",
      '--font-accent': "'Libre Baskerville', serif",
      '--font-body': "'Source Serif Pro', Georgia, serif",
    },
    effects: {
      '--shadow': '2px 2px 12px rgba(136, 14, 79, 0.15)',
      '--shadow-lg': '4px 4px 20px rgba(136, 14, 79, 0.2)',
      '--radius': '8px',
      '--radius-lg': '14px',
    }
  },
  
  'espresso': {
    id: 'espresso',
    name: 'Espresso',
    description: 'Reich, dunkel, wärmend wie ein Café',
    colors: {
      '--color-cream': '#F5F0EB',
      '--color-paper': '#FDFAF7',
      '--color-sepia': '#D7CCC8',
      '--color-sepia-dark': '#A1887F',
      '--color-border': '#8D6E63',
      '--color-accent': '#4E342E',
      '--color-accent-light': '#6D4C41',
      '--color-brown': '#3E2723',
      '--color-brown-dark': '#1B0000',
      '--color-text': '#3E2723',
      '--color-text-light': '#6D4C41',
    },
    fonts: {
      '--font-heading': "'Playfair Display', Georgia, serif",
      '--font-accent': "'Libre Baskerville', serif",
      '--font-body': "'Source Serif Pro', Georgia, serif",
    },
    effects: {
      '--shadow': '2px 2px 10px rgba(62, 39, 35, 0.2)',
      '--shadow-lg': '4px 4px 16px rgba(62, 39, 35, 0.25)',
      '--radius': '6px',
      '--radius-lg': '10px',
    }
  },
  
  'mediterranean': {
    id: 'mediterranean',
    name: 'Mediterran',
    description: 'Sonnig, terracotta, olive – wie ein griechisches Dorf',
    colors: {
      '--color-cream': '#FDF6E3',
      '--color-paper': '#FFFEF9',
      '--color-sepia': '#FFF8DC',
      '--color-sepia-dark': '#F0E68C',
      '--color-border': '#DAA520',
      '--color-accent': '#CD853F',
      '--color-accent-light': '#DEB887',
      '--color-brown': '#8B4513',
      '--color-brown-dark': '#654321',
      '--color-text': '#5D4E37',
      '--color-text-light': '#8B7355',
    },
    fonts: {
      '--font-heading': "'Playfair Display', Georgia, serif",
      '--font-accent': "'Libre Baskerville', serif",
      '--font-body': "'Source Serif Pro', Georgia, serif",
    },
    effects: {
      '--shadow': '2px 2px 8px rgba(139, 69, 19, 0.15)',
      '--shadow-lg': '4px 4px 16px rgba(139, 69, 19, 0.2)',
      '--radius': '4px',
      '--radius-lg': '8px',
    }
  }
};

export const DEFAULT_THEME = 'oma';

export function getTheme(themeId) {
  return THEMES[themeId] || THEMES[DEFAULT_THEME];
}

export function getThemeList() {
  return Object.values(THEMES);
}