import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Global crash protection — child process errors (e.g. broken pipes from
// ffmpeg/whisper) used to kill the whole Node server. Log and recover.
process.on('uncaughtException', err => {
  console.error('⚠️  uncaughtException (recovered):', err.message);
});
process.on('unhandledRejection', err => {
  console.error('⚠️  unhandledRejection (recovered):', err?.message || err);
});

import recipesRouter from './routes/recipes.js';
import searchRouter from './routes/search.js';
import mealPlansRouter from './routes/mealPlans.js';
import shoppingListsRouter from './routes/shoppingLists.js';
import { initDb } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Environment detection (PROD=production, else development)
const ENVIRONMENT = process.env.ENVIRONMENT
  || (process.env.NODE_ENV === 'production' ? 'production' : 'development');
const envHandler = (req, res) => res.json({ environment: ENVIRONMENT });
app.get('/recipe/api/environment', envHandler);
app.get('/api/environment', envHandler);


initDb();
app.use(cors());
app.use(express.json());

// Health check endpoint for Docker healthcheck
app.get("/recipe/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});


// API routes with /api prefix
app.use('/api', recipesRouter);
app.use('/api', searchRouter);
app.use('/api', mealPlansRouter);
app.use('/api', shoppingListsRouter);

// Also handle /recipe/api/* paths (from Caddy with strip_prefix /recipe/api)
app.use('/recipe/api', recipesRouter);
app.use('/recipe/api', searchRouter);

// Products router (Open Food Facts)
const productsRouter = require('./routes/products.cjs');
const learningRouter = require('./routes/learning.cjs');
app.use('/api/products', productsRouter);
app.use('/recipe/api/products', productsRouter);

// Learning router (server-side learned products)
app.use('/api/learning', learningRouter);
app.use('/recipe/api/learning', learningRouter);
// Ingredients router (OFF product matching for recipe ingredients)
const ingredientsRouter = require('./routes/ingredients.cjs');
app.use('/api/ingredients', ingredientsRouter);
app.use('/recipe/api/ingredients', ingredientsRouter);

// Video recipe import router (TikTok/Instagram)
const videoRecipeRouter = require('./routes/videoRecipeImport.cjs');
app.use('/api/recipes', videoRecipeRouter);
// Settings router (LLM config)
const settingsRouter = require('./routes/settings.cjs');
app.use('/api/settings', settingsRouter);
app.use('/recipe/api/settings', settingsRouter);

app.use('/recipe/api/recipes', videoRecipeRouter);

app.use('/recipe/api', mealPlansRouter);
app.use('/recipe/api', shoppingListsRouter);

// Uploads router (image multipart upload)
const uploadsRouter = require('./routes/uploads.cjs');
app.use('/api/uploads', uploadsRouter);
app.use('/recipe/api/uploads', uploadsRouter);

// Static serving for uploaded images
app.use('/api/uploads', express.static(path.join(__dirname, 'data', 'uploads')));
app.use('/recipe/api/uploads', express.static(path.join(__dirname, 'data', 'uploads')));

// Categorize router (enrich OFF products into our internal category/store model)
const categorizeRouter = require('./routes/categorize.cjs');
app.use('/api/categorize', categorizeRouter);
app.use('/recipe/api/categorize', categorizeRouter);

// Load offers history router
const offersHistoryRouter = require('./routes/offersHistory.cjs');
app.use('/api/offers', offersHistoryRouter);
// Load eigenmarken reference prices router
const eigenmarkenRouter = require('./routes/eigenmarken.cjs');
app.use('/api/offers/eigenmarken', eigenmarkenRouter);
app.use('/recipe/api/offers/eigenmarken', eigenmarkenRouter);
app.use('/recipe/api/offers', offersHistoryRouter);

// Offers scraper API routes
const offersRouter = require('./routes/offers.cjs');
app.use('/api/offers', offersRouter);
app.use('/recipe/api/offers', offersRouter);

// Merkliste (Favoriten)
const favoritesRouter = require('./routes/favorites.cjs');
app.use('/api/favorites', favoritesRouter);
app.use('/recipe/api/favorites', favoritesRouter);

// OpenFoodFacts Update router (manual trigger + changelog review)
const offUpdateRouter = require('./routes/offersOFFUpdate.cjs');
app.use('/api/offers/off-update', offUpdateRouter);
app.use('/recipe/api/offers/off-update', offUpdateRouter);

// Load scraper
let offersScraper;

// Pre-cache common products (async, non-blocking)
import('./services/precache.cjs').then(m => {
  setTimeout(() => m.precacheCommonProducts(), 2000); // Wait 2s after startup
}).catch(() => {});
try {
  offersScraper = require('./services/offersScraper.cjs');
  console.log('✅ Scraper loaded');
} catch(e) { 
  console.error('❌ Scraper error:', e.message); 
}

// Offers config (PLZ, etc.)
const CONFIG_FILE = path.join(__dirname, 'data', 'offers-config.json');
function getOffersConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {}
  return { plz: '' };
}
function saveOffersConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}
app.get('/api/offers/config', (req, res) => res.json(getOffersConfig()));
app.post('/api/offers/config', (req, res) => {
  try {
    const cfg = getOffersConfig();
    if (req.body.plz !== undefined) cfg.plz = String(req.body.plz).replace(/\D/g, '').slice(0, 5);
    saveOffersConfig(cfg);
    res.json({ success: true, config: cfg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/offers/config', (req, res) => {
  try {
    const cfg = getOffersConfig();
    const updates = req.body;
    if (updates.plz !== undefined) cfg.plz = String(updates.plz).replace(/\D/g, '').slice(0, 5);
    if (updates.edekaMarketId !== undefined) cfg.edekaMarketId = updates.edekaMarketId;
    if (updates.stores !== undefined) cfg.stores = updates.stores;
    if (updates.marktguruStores !== undefined) cfg.marktguruStores = updates.marktguruStores;
    saveOffersConfig(cfg);
    res.json({ success: true, config: cfg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/recipe/api/offers/config', (req, res) => res.json(getOffersConfig()));
app.post('/recipe/api/offers/config', (req, res) => {
  try {
    const cfg = getOffersConfig();
    if (req.body.plz !== undefined) cfg.plz = String(req.body.plz).replace(/\D/g, '').slice(0, 5);
    saveOffersConfig(cfg);
    res.json({ success: true, config: cfg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/recipe/api/offers/config', (req, res) => {
  try {
    const cfg = getOffersConfig();
    const updates = req.body;
    if (updates.plz !== undefined) cfg.plz = String(updates.plz).replace(/\D/g, '').slice(0, 5);
    if (updates.edekaMarketId !== undefined) cfg.edekaMarketId = updates.edekaMarketId;
    if (updates.stores !== undefined) cfg.stores = updates.stores;
    if (updates.marktguruStores !== undefined) cfg.marktguruStores = updates.marktguruStores;
    saveOffersConfig(cfg);
    res.json({ success: true, config: cfg });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Angebote: Persistenz + Auto-Scrape ────────────────────────────────────
// Die Route-Handler für /api/offers liegen in routes/offers.cjs (single source
// of truth). Die früheren Duplikate hier waren toter Code — Express matcht
// immer den zuerst registrierten Router.
const AUTO_SCRAPE_MAX_AGE_H = Number(process.env.MOCA_AUTO_SCRAPE_MAX_AGE_H || 24);
const AUTO_SCRAPE_CHECK_MS = Number(process.env.MOCA_AUTO_SCRAPE_CHECK_MS || 30 * 60 * 1000);

if (offersScraper) {
  // Letzten Scrape-Stand aus der DB holen — der Angebote-Tab ist damit auch
  // direkt nach einem Neustart gefüllt, bis ein neuer Scrape läuft.
  try {
    const { stores, offers, lastUpdated } = offersScraper.hydrateOffersFromHistory();
    console.log(stores > 0
      ? `♻️  Angebote wiederhergestellt: ${offers} Angebote aus ${stores} Stores (Stand ${lastUpdated})`
      : 'ℹ️  Keine persistierten Angebote gefunden — der erste Scrape startet automatisch');
  } catch (e) {
    console.error('⚠️  Angebots-Persistenz konnte nicht geladen werden:', e.message);
  }

  function autoScrapeIfStale() {
    try {
      if (offersScraper.getProgress()?.status === 'running') return;
      const { lastUpdated } = offersScraper.getOffers();
      const ageH = lastUpdated ? (Date.now() - Date.parse(lastUpdated)) / 3_600_000 : Infinity;
      if (ageH < AUTO_SCRAPE_MAX_AGE_H) return;
      console.log(`📡 Auto-Scrape (Bestand: ${Number.isFinite(ageH) ? ageH.toFixed(1) + ' h alt' : 'leer'})`);
      offersScraper.scrapeAndPersist('marktguru')
        .then(({ stores, offers, durationMs }) => console.log(`✅ Auto-Scrape fertig: ${offers} Angebote aus ${stores} Ketten (${(durationMs / 1000).toFixed(1)} s)`))
        .catch(e => console.error('⚠️  Auto-Scrape fehlgeschlagen:', e.message));
    } catch (e) {
      console.error('⚠️  Auto-Scrape-Check fehlgeschlagen:', e.message);
    }
  }

  setTimeout(autoScrapeIfStale, 15_000);                        // kurz nach dem Start
  setInterval(autoScrapeIfStale, AUTO_SCRAPE_CHECK_MS);         // danach regelmäßig
}

// Serve React static files from client/dist
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use('/recipe', express.static(clientDistPath));

// For any non-API route, return 404 for API-like paths or serve index.html for SPA
app.get('*', (req, res) => {
  // If it's an API-like path that wasn't handled, return 404
  if (req.path.includes('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Otherwise serve the SPA index.html
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
