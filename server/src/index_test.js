import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

import recipesRouter from './routes/recipes.js';
import searchRouter from './routes/search.js';
import mealPlansRouter from './routes/mealPlans.js';
import shoppingListsRouter from './routes/shoppingLists.js';
import { initDb } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;

initDb();
app.use(cors());
app.use(express.json());

app.use('/api', recipesRouter);
app.use('/api', searchRouter);
app.use('/api', mealPlansRouter);
app.use('/api', shoppingListsRouter);

// Load scraper
let offersScraper;
try {
  offersScraper = require('./services/offersScraper.cjs');
} catch(e) { console.error('Scraper load error:', e.message); }

// TEST: App-level route (not a sub-router)
app.get('/api/test-app', (req, res) => {
  console.log('APP LEVEL TEST HANDLER');
  res.json({ test: 'app-level works' });
});

// TEST: Direct JSON response on the same path
app.get('/api/offers-direct', (req, res) => {
  console.log('DIRECT HANDLER');
  res.json({ direct: true });
});

// The offers router
const offersRouter = express.Router();
offersRouter.get('/', (req, res) => {
  console.log('ROUTER OFFERS GET /');
  try {
    if (!offersScraper) return res.status(500).json({ error: 'no scraper' });
    const data = offersScraper.getOffers();
    res.json(data);
  } catch(e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.use('/api', offersRouter);

const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use('/recipe', express.static(clientDistPath));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  }
});

app.listen(PORT, () => console.log(`Server on ${PORT}`));
