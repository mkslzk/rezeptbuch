# 📖 Rezeptbuch

Recipe management app with weekly meal planning, smart shopping lists, and live supermarket offer matching (Germany/AT/CH).

## ✨ Features

- 🍳 **Recipe database** — CRUD, image upload, import from URLs (Chefkoch, Allrecipes) and TikTok/Instagram video transcription
- 📅 **Meal plans** — weekly calendar with breakfast/lunch/dinner slots, copy from last week
- 🛒 **Shopping lists** — auto-generated from meal plans, sorted by category or store
- 💰 **Offer matching** — live scraping of Lidl, REWE, Netto, Penny, Kaufland, ALDI + Marktguru integration
- 🥛 **OFF integration** — OpenFoodFacts product search with Eigenmarken-prioritization and learning system
- 🤖 **LLM-powered** — Ollama (local) or MiniMax for video→recipe extraction and image categorization

## 🏗️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite 5, React Router 7 |
| Backend | Express 4, better-sqlite3 |
| Scraping | Cheerio (HTML), Playwright (JS), Tesseract.js (OCR for receipts) |
| External | OpenFoodFacts API, Marktguru, Lidl/Kaufland/Penny/REWE/Netto direct |

## 🚀 Quick Start

```bash
# 1. Install
cd server && npm install
cd ../client && npm install

# 2. Run dev (in 2 terminals)
cd server && npm run dev      # http://localhost:3001
cd client && npm run dev      # http://localhost:5174 (proxies /api → 3001)

# 3. Production (Docker)
docker build -t rezeptbuch .
docker run -p 3001:3001 -v $PWD/server/src/data:/app/server/src/data rezeptbuch
```

## 🧪 Tests

```bash
cd server
node --test test/
```

26 tests covering the categorization service (parse quantity, detect store, guess category, enrich product).

## 🔌 API Endpoints

### Recipes
- `GET    /api/recipes` — list all
- `GET    /api/recipes/:id` — single recipe
- `POST   /api/recipes` — create
- `PUT    /api/recipes/:id` — update
- `DELETE /api/recipes/:id` — delete
- `PATCH  /api/recipes/:id/favorite` — toggle favorite
- `POST   /api/recipes/import` — import from URL
- `POST   /api/recipes/import-video` — TikTok/Instagram import

### Meal Plans
- `GET    /api/meal-plans?week=YYYY-MM-DD` — get plan for week
- `POST   /api/meal-plans` — create plan
- `PUT    /api/meal-plans/:id/entries` — replace all entries
- `DELETE /api/meal-plans/:id` — delete
- `GET    /api/meal-plans/:id` — single plan with entries
- `GET    /api/meal-plans/:id/entries` — list entries

### Shopping Lists
- `GET    /api/shopping-lists?meal_plan_id=X` — get list for plan
- `POST   /api/shopping-lists` — create
- `POST   /api/shopping-lists/:id/generate` — regenerate from meal plan
- `POST   /api/shopping-lists/:id/items` — add item (with OFF product fields)
- `PATCH  /api/shopping-lists/:id/items/:itemId` — update item
- `DELETE /api/shopping-lists/:id/items/:itemId` — remove item

### Offers (Live Scraping)
- `GET    /api/offers` — current offers cache
- `POST   /api/offers/scrape` — trigger fresh scrape
- `GET    /api/offers/overview` — stats
- `GET    /api/offers/stores` — store list
- `GET    /api/offers/history` — scrape history (paginated)
- `GET    /api/offers/history/:scrapeId` — single scrape details
- `GET    /api/offers/all` — all offers (paginated)
- `GET    /api/offers/search?q=...` — search offers
- `GET    /api/offers/prices/:productName` — price history
- `GET    /api/offers/price-chart/:productName` — chart data
- `POST   /api/offers/scrape/marktguru` — marktguru scrape

### Uploads
- `POST   /api/uploads/image` — multipart image upload (max 5MB, JPEG/PNG/WebP/GIF)
- `GET    /api/uploads/:filename` — serve uploaded file

### Categorization (Backend)
- `POST   /api/categorize` — enrich OFF product → shopping item format
- `POST   /api/categorize/batch` — batch enrichment
- `GET    /api/categorize/categories` — list valid internal categories

### Search
- `GET    /api/search?q=...&category=...` — recipe search
- `GET    /api/categories` — available categories

### Products (OpenFoodFacts)
- `GET    /api/products/search?q=...&limit=...` — local OFF search with learning
- `GET    /api/products/search/online?q=...` — live OFF search
- `GET    /api/products/barcode/:barcode` — lookup by barcode
- `GET    /api/products/match?item=...&store=...` — match item to OFF + offers

### Learning
- `GET    /api/learning?q=...` — learned products
- `POST   /api/learning` — teach a new product mapping

### Settings
- `GET    /api/settings/llm` — LLM config (Ollama / MiniMax)
- `PUT    /api/settings/llm` — update LLM config
- `POST   /api/settings/llm/test` — test LLM connection

## 🗂️ Project Structure

```
rezeptbuch/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/        # Reusable UI (ProductSearch, Modal, etc.)
│   │   ├── pages/             # Route pages (Home, Recipe, MealPlan, etc.)
│   │   ├── config/            # Static config (categories)
│   │   └── App.jsx            # Router root
│   └── dist/                  # Build output (gitignored)
├── server/                    # Express backend
│   ├── src/
│   │   ├── routes/            # HTTP route handlers
│   │   ├── services/          # Business logic (categorization, scraping, OFF)
│   │   ├── db/                # SQLite + schema migrations
│   │   └── data/              # Runtime data (db, uploads, configs)
│   ├── test/                  # node:test unit tests
│   └── package.json
├── Dockerfile                 # Multi-stage client-build + production
└── README.md
```

## 🔧 Configuration

- `server/src/data/offers-config.json` — PLZ, EDEKA market ID, store list
- `server/src/data/llm-config.json` — LLM provider + API keys (NOT committed if contains secrets)

## 📜 License

Private project, all rights reserved.
