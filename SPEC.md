# Rezeptbuch – Projektdokumentation

> **Stand:** 18.05.2026 | **Version:** 1.0 | **Status:** Aktiv

---

## Inhaltsverzeichnis
1. [Überblick](#1-überblick)
2. [Tech Stack](#2-tech-stack)
3. [Projektstruktur](#3-projektstruktur)
4. [Datenbanken](#4-datendatenbanken)
5. [Features](#5-features)
6. [API-Endpunkte](#6-api-endpunkte)
7. [Services](#7-services)
8. [Konfigurationsdateien](#8-konfigurationsdateien)
9. [Einrichtung & Deployment](#9-einrichtung--deployment)
10. [ Bekannte Probleme](#10-bekannte-probleme)

---

## 1. Überblick

**Rezeptbuch** ist eine vollwertige Rezeptverwaltung mit Essensplan und Einkaufslisten-Funktion.

### Was es kann
- Rezepte erstellen, bearbeiten, importieren und löschen
- Essensplan (Wochenplan) mit Rezept-Zuordnung
- Einkaufsliste generiert aus Essensplan-Zutaten
- Produkt-Matching mit Open Food Facts (OFF)数据库
- Eigenmarken-Erkennung und Preisvergleich
- TikTok/Instagram Video-Rezept-Import (AI-basiert)
- LLM-Konfiguration (Ollama oder MiniMax)

---

## 2. Tech Stack

| Schicht | Technologie |
|--------|-------------|
| **Frontend** | React 18 + Vite |
| **Backend** | Express.js (Node.js) |
| **Datenbank** | SQLite (better-sqlite3) |
| **Browser-Automation** | Playwright |
| **Transkription** | faster-whisper (lokal) |
| **LLM** | Ollama (lokal) oder MiniMax (API) |
| **Reverse Proxy** | Caddy (auf Y50-70 Gateway) |

---

## 3. Projektstruktur

```
rezeptbuch/
├── client/                     # React Frontend
│   └── src/
│       ├── components/         # UI-Komponenten
│       │   ├── ProductSearch.jsx    # OFF-Produktsuche
│       │   ├── RecipeFormModal.jsx  # Rezept-Modal
│       │   ├── SettingsModal.jsx    # ⚙️ Einstellungen (Theme, KI, PLZ, Eigenmarken)
│       │   └── Modal.jsx           # Generic Modal
│       ├── pages/
│       │   ├── HomePage.jsx        # Rezept-Übersicht
│       │   ├── RecipeDetailPage.jsx # Rezept-Detail + "Zu Essensplan"
│       │   ├── RecipeFormPage.jsx   # Erstellen/Bearbeiten + Import
│       │   ├── MealPlanPage.jsx     # Wochenplan
│       │   ├── ShoppingListPage.jsx # Einkaufsliste
│       │   └── AdminPanel.jsx       # Admin (Angebote)
│       ├── config/
│       │   ├── categories.js    # Kategorien + Labels
│       │   └── themes.js        # Themes
│       ├── context/
│       │   └── ThemeContext.jsx # Theme-Provider
│       ├── App.css              # Haupt-Stylesheet
│       └── index.css           # Globale Styles
├── server/                     # Express Backend
│   └── src/
│       ├── routes/             # API-Routen
│       │   ├── recipes.js          # CRUD für Rezepte
│       │   ├── products.cjs        # OFF-Produktsuche (lokal)
│       │   ├── ingredients.cjs     # Zutaten-Matching
│       │   ├── shoppingLists.js    # Einkaufslisten
│       │   ├── mealPlans.js        # Essenspläne
│       │   ├── learning.cjs       # Server-side Product Learning
│       │   ├── offers.cjs          # Angebote
│       │   ├── offersHistory.cjs   # Angebote-Historie
│       │   ├── eigenmarken.cjs     # Eigenmarken-Referenzpreise
│       │   ├── settings.cjs        # ⚙️ LLM-Einstellungen
│       │   ├── videoRecipeImport.cjs # TikTok/Instagram Import
│       │   └── offersOFFUpdate.cjs  # OFF-Datenbank-Updates
│       ├── services/
│       │   ├── offProducts.cjs     # OFF-Lokalsuche mit FTS5
│       │   ├── openFoodFacts.cjs   # OFF-API (online)
│       │   ├── recipeImporter.cjs  # URL-Rezept-Import (JSON-LD)
│       │   ├── videoRecipeExtractor.cjs # Video-URL-Extraktion
│       │   ├── videoTranscriber.cjs    # faster-whisper Transcription
│       │   ├── recipeFromVideo.cjs     # LLM-Rezept-Extraktion
│       │   └── offersScraper.cjs   # Angebote-Scraper
│       ├── data/
│       │   ├── rezeptbuch.db       # Haupt-SQLite-DB
│       │   ├── off.db              # OFF-FTS5-Datenbank (298k Produkte)
│       │   ├── learned-products.json   # Gelernte Produkte
│       │   ├── llm-config.json     # ⚙️ LLM-Konfiguration
│       │   └── offers-config.json  # PLZ + Stores
│       └── index.js             # Express Entry Point
└── SPEC.md                    # Dieser Doc
```

---

## 4. Datenbanken

### 4.1 `rezeptbuch.db` (Hauptdatenbank)

Tables:
- `recipes` – Rezepte
- `meal_plans` – Essenspläne
- `meal_plan_entries` – Rezepteinträge pro Tag
- `shopping_lists` – Einkaufslisten
- `shopping_list_items` – Listeneinträge
- `offer_history` – Scrapte Angebote mit Timestamp
- `eigenmarken_prices` – Referenzpreise

### 4.2 `off.db` (Open Food Facts)

298.912 Produkte importiert aus `off_recipe_optimized.csv`.

**Schema:**
```sql
CREATE TABLE products (
  code TEXT PRIMARY KEY,
  product_name TEXT,
  product_name_de TEXT,
  brands TEXT,
  brands_normalized TEXT,
  categories TEXT,
  categories_en TEXT,
  purchase_places TEXT,
  countries TEXT,
  quantity TEXT,
  image_small_url TEXT,
  is_german INTEGER DEFAULT 0
);

CREATE VIRTUAL TABLE products_fts USING fts5(
  code, product_name, product_name_de, brands, categories, brands_normalized
);

CREATE INDEX idx_products_german ON products(is_german DESC);
```

**Suchleistung:** <50ms für_prefix queries

---

## 5. Features

### 5.1 Rezepte

| Feature | Status |
|---------|--------|
| Erstellen/Bearbeiten | ✅ |
| URL-Import (Chefkoch, etc.) | ✅ |
| TikTok/Instagram Video-Import | ✅ |
| Bild-URL oder Upload | ✅ |
| Kategorien, Tags, Zeiten | ✅ |
| Rezept duplizieren | ✅ |
| Favoriten | ✅ |
| Zutaten-Matching mit OFF | ✅ |

**Import-Quellen (getestet):**
- ✅ emmikochteinfach.de
- ✅ gaumenfreundin.de
- ✅ familienkost.de
- ❌ rewe.de (JavaScript-rendered, später)

### 5.2 Essensplan

- Wochenansicht (Montag–Sonntag)
- Rezepte Montag–Sonntag zuordnen
- "Zu Essensplan" Button in Rezept-Detailseite
- Generiert Einkaufsliste aus Zutaten

### 5.3 Einkaufsliste

| Feature | Status |
|---------|--------|
| Auto-Generierung aus Essensplan | ✅ |
| Sortierung nach Kategorie | ✅ |
| Sortierung nach Laden | ✅ |
| Eigenmarken-Erkennung (Aldi, Lidl, Rewe, etc.) | ✅ |
| Angebots-Preisanzeige | ✅ |
| Summen-Anzeige | ✅ |
| Checkboxen zum Abhaken | ✅ |
| Manuelle Zutaten | ✅ |
| OFF-Produktsuche | ✅ |

**Kategorien:** 🥬 Obst & Gemüse | 🥩 Fleisch & Fisch | 🧈 Milchprodukte | 🌱 Plant-based | 🍞 Brot & Brötchen | 🫙 Vorrat | ❄️ Tiefkühl | 🥤 Getränke | 🍫 Snacks | 📦 Sonstiges

### 5.4 OFF-Produktsuche

- Lokale FTS5-Suche (298k Produkte, <50ms)
- Eigenmarken priorisiert (Milbona, Ja!, Vemondo, etc.)
- Lernendes System: häufig genutzte Produkte werden höher gerankt
- Category + Store Erkennung pro Produkt

**Eigenmarken-Store-Zuordnung:**
- ALDI: vemondo, milsani, tandil, choceur, gourmet, all seasons
- LIDL: milbona, crownfield, alesto, bellal, freeway, oko, w5
- REWE: ja!, voll & gut, rewe bio
- EDEKA: gut & günstig, edeka bio, gutfleisch
- KAUFLAND: k-classic, tip
- PENNY: landliebe, penny bio
- NETTO: netto
- METRO: metro chef, real

### 5.5 TikTok/Instagram Import

**Pipeline:**
1. Playwright extrahiert Video-URL
2. `ffmpeg` extrahiert Audio
3. `faster-whisper` (base-Modell) transkribiert (lokal, kein API Key)
4. LLM extrahiert Zutaten + Schritte aus Transkript

**LLM:** Ollama (lokal) oder MiniMax (API) – wählbar in Settings

### 5.6 LLM-Settings (KI-Einstellungen)

**Route:** `/recipe/api/settings/llm`

| Action | Methode | Beschreibung |
|--------|---------|-------------|
| Config laden | GET | aktuelle Config |
| Config speichern | PUT | Anbieter + Modell + Endpoint/Key |
| Verbindung testen | POST | Testet Ollama oder MiniMax |

**Anbieter:**
- **Ollama** (lokal): Endpoint + Modell wählbar
- **MiniMax** (API): API Key + Modell

---

## 6. API-Endpunkte

### Rezepte
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/recipes | Alle Rezepte |
| GET | /api/recipes/:id | Einzelnes Rezept |
| POST | /api/recipes | Rezept erstellen |
| PUT | /api/recipes/:id | Rezept aktualisieren |
| DELETE | /api/recipes/:id | Rezept löschen |
| POST | /api/recipes/import | URL-Import (JSON-LD) |
| POST | /api/recipes/import-video | TikTok/Instagram Video |
| GET | /api/recipes/import-video/status | Import-Check |
| PATCH | /api/recipes/:id/favorite | Favorit toggeln |

### Produkte (OFF)
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/products/search?q= | Lokale OFF-Suche |
| GET | /api/products/search/online?q= | Online OFF-API |
| GET | /api/products/barcode/:barcode | Barcode-Lookup |
| GET | /api/products/match?item= | Hybrid-Matching |

### Zutaten
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| POST | /api/ingredients/match | Zutaten → OFF-Produkte |

### Essensplan
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/meal-plans | Alle Pläne |
| GET | /api/meal-plans?week= | Plan einer Woche |
| POST | /api/meal-plans | Plan erstellen |
| GET | /api/meal-plans/:id/entries | Einträge |
| PUT | /api/meal-plans/:id/entries | Einträge speichern |

### Einkaufsliste
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/shopping-lists | Alle Listen |
| GET | /api/shopping-lists?meal_plan_id= | Für Essensplan |
| POST | /api/shopping-lists | Neue Liste |
| POST | /api/shopping-lists/:id/generate | Aus Essensplan generieren |
| POST | /api/shopping-lists/:id/items | Item hinzufügen |
| PATCH | /api/shopping-lists/:id/items/:itemId | Item updaten |
| DELETE | /api/shopping-lists/:id/items/:itemId | Item löschen |

### Offers (Angebote)
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/offers | Aktuelle Angebote |
| POST | /api/offers/scrape | Alle Stores scrapen |
| POST | /api/offers/scrape/marktguru | Marktguru scrapen |
| GET | /api/offers/config | PLZ-Einstellung |
| POST | /api/offers/config | PLZ speichern |
| PUT | /api/offers/config | Config updaten |

### Settings (LLM)
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/settings/llm | LLM-Config |
| PUT | /api/settings/llm | LLM-Config speichern |
| POST | /api/settings/llm/test | Verbindung testen |

### Sonstige
| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | /api/learning?q= | Gelernte Produkte |
| POST | /api/learning | Produkt lernen |
| GET | /api/offers/eigenmarken | Eigenmarken-Referenzpreise |
| POST | /api/offers/eigenmarken | Referenzpreis hinzufügen |
| DELETE | /api/offers/eigenmarken/:id | Referenzpreis löschen |

---

## 7. Services

### 7.1 `offProducts.cjs` – Lokale OFF-Suche

```js
searchWithLearning(query, limit=15)  // Sucht + lernt overlay
searchProducts(query, limit=15)       // Nur OFF-DB
getLearnedProducts(query, limit=10)   // Nur Learnings
```

**Suchpriorität:**
1. Gelernte Produkte (aus `learned-products.json`)
2. Deutsche Produkte (is_german=1)
3. Eigenmarken (reduzierte Bewertung)
4. Alphabetisch

### 7.2 `recipeImporter.cjs` – URL-Import

Unterstützte Seiten:
- JSON-LD Schema (Recipe-Typ)
- Cookie-Consent-Handling via Playwright
- COOKMATE-Support (window.recipe)

### 7.3 `videoRecipeExtractor.cjs` – Video URL Extraction

```js
extractVideoUrl(url)  // → { videoUrl, platform }
```

Plattformen: TikTok, Instagram Reels

### 7.4 `videoTranscriber.cjs` – Audio Transcription

```js
transcribeVideoUrl(videoUrl, model='base')  // Download + Transkript
transcribeVideo(videoPath, model='base')   // Lokal
```

Verwendet: `ffmpeg` + `faster-whisper` (base model, float32, CPU)

### 7.5 `recipeFromVideo.cjs` – LLM Extraction

```js
extractRecipeFromTranscript(transcript, platform)
// → { title, ingredients[], steps[], servings, prepTime, cookTime }
```

Nutzt Ollama oder MiniMax (per LLM-Settings).

Fallback: Keyword-Extraktion ohne LLM.

---

## 8. Konfigurationsdateien

### `server/src/data/offers-config.json`
```json
{
  "plz": "56377",
  "stores": ["lidl", "kaufland", "netto-marken-discount", ...],
  "marktguruStores": [...]
}
```

### `server/src/data/llm-config.json`
```json
{
  "provider": "ollama",
  "ollama": {
    "endpoint": "http://localhost:11434",
    "model": "llama3.2",
    "temperature": 0.1
  },
  "minimax": {
    "apiKey": "",
    "model": "MiniMax-Text-01",
    "baseUrl": "https://api.minimax.chat/v1"
  }
}
```

### `server/src/data/learned-products.json`
```json
[
  {
    "off_product_code": "...",
    "off_product_name": "H-Milch 3,5%",
    "off_brand": "Weihenstephan",
    "off_quantity": "1l",
    "item": "H-Milch 3,5%",
    "category": "dairy",
    "usageCount": 23,
    "lastUsed": 1779050142552
  }
]
```

---

## 9. Einrichtung & Deployment

### Lokale Entwicklung
```bash
cd rezeptbuch/server
npm install
node src/index.js          # Server auf Port 3001

cd rezeptbuch/client
npm install
npm run dev                # Vite Dev Server auf Port 5173
```

### OFF-DB erstellen
```bash
cd server/src/data
node -e "
const Database = require('better-sqlite3');
const db = new Database('./off.db');
// ... Import from CSV (siehe setup script)
"
```

### Ollama (für Video-Import)
```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh

# Modell laden
ollama pull llama3.2

# Start (läuft auf localhost:11434)
ollama serve
```

### Caddy Reverse Proxy (Gateway Y50-70)
```
openclaw.tail62577c.ts.net/recipe/ → localhost:3001
```

---

## 10. Bekannte Probleme

| Store | Problem | Status |
|-------|---------|--------|
| REWE | Cloudflare + JS-Rendering | ❌ |
| ALDI | Cross-Price vs. Aktionspreis | 🔧 |
| Penny | Lazy-loaded Tiles | ❌ |
| EDEKA | Flipbook OCR | ❌ |
| NORMA | JSON Parse Error | ❌ |
| Netto | Access Denied (Bot Protection) | ❌ |
| LIDL | Fast nur Non-Food | ⚠️ |

| Feature | Status |
|---------|--------|
| Recipe URL Import (allgemein) | ✅ 3/4 Sites |
| Video Import (TikTok/Instagram) | ✅ |
| Zutaten-Matching | ✅ |
| LLM Settings UI | ✅ |

---

## Changelog

### 2026-05-18
- LLM Settings Feature (Ollama + MiniMax Konfiguration)
- TikTok/Instagram Video Import
- faster-whisper Transcription (lokal)
- Zutaten-Matching nach Rezept-Import
- Ingredient Match Dropdown in RecipeForm
- Shopping List: Sort-Toggle, Preissumme, Store+Preis Badge
- OFF SQLite DB mit FTS5 (<50ms Suche)
- Eigenmarken-Priorisierung in Suche

### 2026-05-15
- Marktguru Investigation
- Offers History + Dashboard

### 2026-05-13
- Recipe Import via Playwright
- COOKMATE Support

*Letzte Aktualisierung: 2026-05-18*