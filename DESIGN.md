# Design Spec: Omas altes Kochbuch 🍳

## Vision
Ein warmes, einladendes digitales Kochbuch das aussieht wie ein geliebtes, abgegriffenes Kochbuch von Oma. Vintage Ästhetik trifft auf moderne UX.

## Farbpalette

```css
:root {
  /* Primary - Creme/Pergament */
  --color-cream: #F5E6D3;
  --color-cream-dark: #E8D4BC;
  
  /* Secondary - Sepia/Braun */
  --color-sepia: #8B7355;
  --color-sepia-dark: #5D4E37;
  --color-sepia-light: #A89078;
  
  /* Accent - Terracotta */
  --color-terracotta: #C67B5D;
  --color-terracotta-dark: #A65D3F;
  
  /* Background */
  --color-paper: #FDF8F0;
  --color-paper-texture: #F5EDE0;
  
  /* Text */
  --color-text-primary: #3D3024;
  --color-text-secondary: #6B5D4D;
  --color-text-muted: #9B8B7A;
  
  /* Functional */
  --color-success: #5D8A4E;
  --color-danger: #B85450;
  --color-border: #D4C4B0;
}
```

## Typografie

### Headings
- **Font:** Playfair Display (Google Fonts)
- **Fallback:** Georgia, serif
- **Sizes:** 
  - H1: 2.5rem (40px)
  - H2: 2rem (32px)
  - H3: 1.5rem (24px)

### Body
- **Font:** Crimson Text (Google Fonts)
- **Fallback:** Georgia, serif
- **Size:** 1rem (16px), line-height: 1.6

### Accents/Labels
- **Font:** Patrick Hand (Google Fonts)
- **Style:** Handschrift-Optik für Tags, Labels, kleine Akzente

## Komponenten

### Recipe Card
```
┌─────────────────────────┐
│  ┌───────────────────┐  │
│  │                   │  │
│  │      BILD         │  │
│  │                   │  │
│  └───────────────────┘  │
│                         │
│  Titel                  │
│  "Kurzbeschreibung..."  │
│                         │
│  🏷️ Kategorie  ⏱️ 30min │
└─────────────────────────┘
```
- Border-radius: 12px
- Box-shadow: 0 4px 12px rgba(93, 78, 55, 0.15)
- Background: var(--color-paper)
- Hover: leichter lift + shadow increase

### Buttons
- Primary: var(--color-terracotta), white text, rounded 8px
- Secondary: transparent, var(--color-sepia) border
- Border-radius: 8px
- Padding: 0.75rem 1.5rem

### Input Fields
- Background: white
- Border: 2px solid var(--color-border)
- Focus: var(--color-terracotta) border
- Border-radius: 8px
- Padding: 0.75rem

### Navigation
- Horizontal tabs oder Sidebar
- Active: underline in terracotta
- Icons: kleine handschrift-artige SVG icons

## Layout

### Pages
1. **Home:** Sidebar links (Kategorien-Filter) + Grid mit Rezept-Karten rechts
2. **Detail:** Großes Bild oben, Zutaten links, Steps rechts (2-Spalten)
3. **Form:** Single-column, klare Sektionen
4. **Meal Plan:** 7-Spalten für Tage, scrollbar
5. **Shopping:** Checkbox-Liste gruppiert nach Kategorie

### Responsive
- Desktop: Full layout
- Tablet: Stack sidebar below
- Mobile: Single column, cards stack

## Texturen & Effekte

### Papier-Textur
CSS gradient pattern:
```css
background: 
  linear-gradient(90deg, transparent 0%, rgba(139,115,85,0.03) 50%, transparent 100%),
  linear-gradient(rgba(139,115,85,0.02) 1px, transparent 1px),
  var(--color-paper);
background-size: 100% 100%, 20px 20px, 100% 100%;
```

### Vintage Border
```css
border: 3px solid var(--color-sepia-light);
box-shadow: inset 0 0 0 6px var(--color-cream-dark);
```

## Icons
Handschrift-Style SVG icons für:
- 🍳 (Kochtopf) - Haupt-Icon
- 🛒 (Einkauf)
- 📅 (Kalender/Meal Plan)
- ✏️ (Edit)
- 🗑️ (Delete)
- 🔍 (Search)

## Animation
- Subtle transitions: 200ms ease
- Hover lifts: translateY(-2px)
- Page transitions: fade-in 300ms

---

*Design by Charlie & (pending review by) Schmutzli* 🐱🐱