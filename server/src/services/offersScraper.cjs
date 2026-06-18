const cheerio = require('cheerio');
const { chromium, firefox } = require('playwright');
const { createWorker } = require('tesseract.js');
const fs = require('fs');
const path = require('path');

// Load PLZ and EDEKA market ID from offers-config.json at runtime
function getConfig() {
  try {
    const configPath = path.join(__dirname, '../data/offers-config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return { plz: '56377', edekaMarketId: '' };
}
const config = getConfig();
const PLZ = config.plz || '56377';
const EDEKA_MARKET_ID = config.edekaMarketId || PLZ;

//===============================================================
// Progress tracking (in-memory; client polls /api/offers/scrape/progress)
//===============================================================
const PROGRESS_TTL_MS = 5 * 60 * 1000;  // Auto-clear after 5 min

let currentProgress = null;

function setProgress(p) {
  currentProgress = { timestamp: Date.now(), ...p };
}

function getProgress() {
  if (!currentProgress) return null;
  if (['done', 'error'].includes(currentProgress.status) &&
      Date.now() - currentProgress.timestamp > PROGRESS_TTL_MS) {
    currentProgress = null;
    return null;
  }
  return currentProgress;
}

function clearProgress() { currentProgress = null; }

// Marktguru stores from config (default to food stores only)
const DEFAULT_MARKTGURU_STORES = [
  'lidl', 'penny', 'rewe', 'kaufland', 'netto-marken-discount',
  'nahkauf', 'toom', 'hornbach', 'obi', 'hellweg', 'kabs'
];
const MARKTGURU_STORE_CONFIG = config.marktguruStores || DEFAULT_MARKTGURU_STORES;
// Excluded stores (user-configured in Settings → Stores)
// Dynamic exclusion check: re-read config on every call so changes are picked up live
function getExcludedStores() {
  try {
    const liveConfig = getConfig();
    return liveConfig.excludedStores || [];
  } catch {
    return [];
  }
}
const STORE_EXCLUDED = (storeKey) => getExcludedStores().includes(storeKey);

// Build the MARKTGURU_STORES array from config
const MARKTGURU_STORE_URLS = {
  'lidl': { name: 'Lidl', url: 'https://www.marktguru.de/r/lidl' },
  'penny': { name: 'PENNY', url: 'https://www.marktguru.de/r/penny' },
  'rewe': { name: 'REWE', url: 'https://www.marktguru.de/r/rewe' },
  'kaufland': { name: 'Kaufland', url: 'https://www.marktguru.de/r/kaufland' },
  'netto-marken-discount': { name: 'Netto Marken-Discount', url: 'https://www.marktguru.de/r/netto-marken-discount' },
  'nahkauf': { name: 'Nahkauf', url: 'https://www.marktguru.de/r/nahkauf' },
  'toom': { name: 'Toom Baumarkt', url: 'https://www.marktguru.de/r/toom-baumarkt' },
  'hornbach': { name: 'Hornbach', url: 'https://www.marktguru.de/r/hornbach' },
  'obi': { name: 'OBI', url: 'https://www.marktguru.de/r/obi' },
  'hellweg': { name: 'Hellweg', url: 'https://www.marktguru.de/r/hellweg' },
  'kabs': { name: 'KABS Polsterwelt', url: 'https://www.marktguru.de/r/kabs-polsterwelt' },
  'xxx Lutz': { name: 'XXXLUTZ', url: 'https://www.marktguru.de/r/xxxl' },
  'sb-moebel-boss': { name: 'SB-Möbel Boss', url: 'https://www.marktguru.de/r/sb-moebel-boss' },
  'opti-wohnwelt': { name: 'Opti Wohnwelt', url: 'https://www.marktguru.de/r/opti-wohnwelt' },
  'opti-megastore': { name: 'Opti Megastore', url: 'https://www.marktguru.de/r/opti-megastore' },
  'moebel-inhofer': { name: 'Möbel Inhofer', url: 'https://www.marktguru.de/r/moebel-inhofer' },
};

// ============================================================
// FEATURE FLAGS
// ============================================================
const USE_OLLAMA = true;
const USE_OCR = true;
// OLLAMA_HOST: in Docker use host.docker.internal, else localhost
const OLLAMA_HOST = process.env.OLLAMA_HOST || (process.env.DOCKER_CONTAINER ? 'host.docker.internal' : 'localhost');
const OLLAMA_URL = `http://${OLLAMA_HOST}:11434`;
const OLLAMA_MODEL = 'llama3.2:1b';

const STORES = {
  aldi:  { name: 'ALDI Süd',  url: 'https://www.aldi-sued.de/angebote' },
  lidl:  { name: 'LIDL',      url: 'https://www.lidl.de/angebote' },
  netto: { name: 'Netto',      url: 'https://www.netto-online.de/angebote' },
  penny: { name: 'PENNY',     url: 'https://www.penny.de/angebote' },
  norma: { name: 'NORMA',     url: 'https://www.norma-online.de/de/angebote/onlineprospekt/' },
  rewe:  { name: 'REWE',      url: `https://www.rewe.de/angebote/?plz=${PLZ}` },
  nettoLebensmittel: { name: 'Netto Food', url: `https://www.netto-online.de/lebensmittel-angebote/c-N07941?plz=${PLZ}` },
  edeka: { name: 'EDEKA',     url: 'https://www.edeka.de/eh/angebote.jsp' }
};

// Store-specific scraping configs
const SCRAPE_CONFIG = {
  aldi: {
    browser: 'firefox', waitUntil: 'networkidle', timeout: 30000,
    useStealth: true,
    scrollWait: 1200, scrollIterations: 12,
    preFlow: async (page) => {
      // Accept cookies
      try {
        const btn = await page.$('button[id*="cookie"], button[class*="cookie"], button:has-text("Akzeptieren"), button:has-text("Alles akzeptieren")');
        if (btn) { await btn.click(); await page.waitForTimeout(1500); }
      } catch(e) {}
    },
    selectors: ['div.product-tile', 'article[class*="product"]'],
    extractName: ($, el) => {
      const title = $(el).attr('title') || '';
      if (title) return title.replace(/[*]/g, '').trim();
      const h3 = $(el).find('h3').first();
      return h3.length ? h3.text().trim() : '';
    },
    extractPrice: ($, el) => {
      const ins = $(el).find('ins[aria-label*="Reduzierter Preis"], ins[aria-label*="Aktionspreis"]').first();
      if (ins.length) {
        const m = ins.attr('aria-label').match(/(\d+[.,]\d+)/);
        if (m) return parseFloat(m[1].replace(',', '.'));
      }
      const price = $(el).find('[class*="price"]').first();
      if (price.length) {
        const m = price.text().match(/(\d+[.,]\d+)/);
        if (m) return parseFloat(m[1].replace(',', '.'));
      }
      return null;
    },
    extractOfferId: ($, el) => $(el).attr('title') || ''
  },
  lidl: {
    browser: 'firefox', waitUntil: 'domcontentloaded', timeout: 20000,
    selectors: ['.odsc-tile'],
    preFlow: async (page) => {
      try {
        const btn = await page.waitForSelector('button', { timeout: 5000 });
        if (!btn) return;
        const txt = await btn.textContent();
        if (txt && (txt.includes('ZUSTIMMEN') || txt.includes('Akzeptieren') || txt.includes('ALLEN ZUSTIMMEN'))) {
          await btn.click();
          await page.waitForTimeout(1500);
        }
      } catch(e) {}
      try {
        const ytBtn = await page.$('.n-youtube-consent-popup__action');
        if (ytBtn) await ytBtn.click();
        await page.waitForTimeout(500);
      } catch(e) {}
    },
    scrollWait: 600, scrollIterations: 6,
    extractName: ($, el) => {
      // Primary: .product-grid-box__title (visible title with brand)
      let name = '';
      $(el).find('.product-grid-box__title').each((_, h) => {
        const t = $(h).text().trim().replace(/\s+/g, ' ').trim();
        if (t && t.length > 2) name = t;
      });
      // Fallback: odsc-tile__headline
      if (!name) {
        $(el).find('.odsc-tile__headline, [class*="headline"]').each((_, h) => {
          const t = $(h).text().trim();
          if (t && t.length > 2 && !name) name = t;
        });
      }
      // Last resort: URL slug
      if (!name) {
        const href = $(el).find('a').attr('href') || '';
        const match = href.match(/\/p\/([^\/]+)\/p/i);
        if (match) name = match[1].replace(/-/g, ' ').replace(/\+/g, ' ');
      }
      return name;
    },
    extractPrice: ($, el) => {
      // .ods-price__value = actual sale price (not UVP, not percentage)
      const priceVal = $(el).find('.ods-price__value').first().text();
      const match = priceVal.match(/(\d+[.,]\d{2})/);
      if (match) return parseFloat(match[1].replace(',', '.'));
      return null;
    },
    extractOfferId: ($, el) => {
      // Use URL product slug for dedup
      const href = $(el).find('a').attr('href') || '';
      const match = href.match(/\/p\/([^\/]+)\/p/i);
      return match ? match[1] : null;
    }
  },
  netto: {
    browser: 'firefox', waitUntil: 'domcontentloaded', timeout: 30000,
    scrollWait: 1000, scrollIterations: 6,
    useStealth: true,
    preFlow: async (page) => {
      // Accept cookies
      try {
        await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll');
        await page.waitForTimeout(1500);
      } catch(e) {}
      
      // Enter PLZ
      const plzInput = await page.$('input[name="post_code"]');
      if (plzInput) {
        await plzInput.click();
        for (const digit of PLZ) {
          await page.keyboard.type(digit, { delay: 80 });
          await page.waitForTimeout(50);
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);
      }
      
      // Click "Angebote" in nav
      const navAngebote = await page.$('nav a[href*="/angebote/c-N07"]');
      if (navAngebote) {
        await navAngebote.click();
        await page.waitForTimeout(5000);
      }
    },
    selectors: ['[class*="product-tile"]', '[class*="offer-tile"]', 'article[class*="product"]'],
    extractName: ($, el) => {
      // Try multiple selectors for product name
      const h3 = $(el).find('h3').first();
      if (h3.length) return h3.text().trim();
      const nameLink = $(el).find('a[class*="name"], a[class*="title"]').first();
      if (nameLink.length) return nameLink.text().trim();
      return '';
    },
    extractPrice: ($, el) => {
      // Look for price in specific elements
      const priceEl = $(el).find('[class*="price"]:not([class*="old"]):not([class*="original"])').first();
      if (priceEl.length) {
        const text = priceEl.text();
        const match = text.match(/(\d+[.,]\d{2})/);
        if (match) return parseFloat(match[1].replace(',', '.'));
      }
      // Fallback to any price in the tile
      const tileText = $(el).text();
      const match = tileText.match(/(\d+[.,]\d{2})\s*[€]?/);
      if (match) return parseFloat(match[1].replace(',', '.'));
      return null;
    },
    extractOfferId: ($, el) => {
      const name = $(el).find('h3').first().text().trim() || '';
      const priceEl = $(el).find('[class*="price"]').first();
      const price = priceEl.length ? priceEl.text().match(/(\d+[.,]\d{2})/)?.[1] : '';
      return `${name}|${price}`.replace(/\s+/g, '').substring(0, 50);
    }
  },
  penny: {
    browser: 'firefox', waitUntil: 'domcontentloaded', timeout: 30000,
    scrollWait: 800, scrollIterations: 20,
    // Penny lazy-loads via "Mehr angebote" / "Mehr laden" buttons — click them while scrolling
    preFlow: async (page) => {
      // Scroll and click "Mehr" buttons for several cycles
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1200);
        // Try multiple button selectors
        const mehrBtn = await page.$(
          'button:has-text("Mehr angebote"), button:has-text("Mehr laden"), ' +
          'button:has-text("Weitere"), button[class*="more"]:not([disabled]), ' +
          'a:has-text("Mehr angebote"), a:has-text("Mehr laden")'
        );
        if (mehrBtn) {
          try {
            await mehrBtn.click({ force: true });
            await page.waitForTimeout(1500);
          } catch(e) {}
        }
      }
      // Scroll back to top before extraction
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
    },
    selectors: ['article.offer-tile'],
    extractName: ($, el) => {
      return $(el).find('h3').first().text().trim().replace(/\*/g, '').trim() || '';
    },
    extractPrice: ($, el) => {
      const priceBubble = $(el).find('[data-label-price="Angebotspreis"]');
      if (!priceBubble.length) return null;
      const text = priceBubble.text();
      const match = text.match(/(\d+[.,]\d{2})/);
      if (match) {
        const price = parseFloat(match[1].replace(',', '.'));
        // Skip app-only or invalid prices
        if (price > 0 && price < 100) return price;
      }
      return null;
    },
    extractOriginalPrice: ($, el) => {
      const origBubble = $(el).find('[data-label-cross-out="Streichpreis"]');
      if (!origBubble.length) return null;
      const text = origBubble.text();
      const match = text.match(/UVP\s+(\d+[.,]\d{2})/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    },
    extractOfferId: ($, el) => {
      // Use h3 text + price as unique ID
      const name = $(el).find('h3').first().text().trim();
      const priceBubble = $(el).find('[data-label-price="Angebotspreis"]');
      const price = priceBubble.length ? priceBubble.text().match(/(\d+[.,]\d{2})/)?.[1] : '';
      return `${name}|${price}`.replace(/\s+/g, '').substring(0, 60);
    }
  },
  norma: { 
    browser: 'firefox', waitUntil: 'networkidle', timeout: 30000,
    isFlipbook: true,
    scrollWait: 2000, scrollIterations: 6
  },
  rewe: {
    browser: 'firefox', waitUntil: 'domcontentloaded', timeout: 30000,
    selectors: ['[class*="cor-offer-renderer-tile"]'],
    scrollWait: 800, scrollIterations: 8,
    // REWE: use data attributes for precise extraction (name + price from aria-label)
    extractName: ($, el) => {
      const link = $(el).find('a.cor-offer-information__title-link');
      const name = link.attr('data-offer-title') || '';
      if (!name) {
        // Fallback to h3
        const h3 = $(el).find('h3.cor-offer-information__title');
        return h3.length > 0 ? h3.text().trim() : '';
      }
      return name;
    },
    extractPrice: ($, el) => {
      const link = $(el).find('a.cor-offer-information__title-link');
      const ariaLabel = link.attr('aria-label') || '';
      // aria-label = "Pepsi, Aktionspreis 0,79 €"
      // Fixed: was using 'd' instead of '\d'
      const match = ariaLabel.match(/(\d+[.,]\d{2})\s*[€]?/);
      return match ? parseFloat(match[1].replace(',', '.')) : null;
    },
    extractOfferId: ($, el) => {
      const link = $(el).find('a.cor-offer-information__title-link');
      return link.attr('data-offer-id') || '';
    }
  },
  // EDEKA: uses a JSON API at /api/auth-proxy/?path=api%2Foffers%3Flimit%3D999
  // No flipbook/OCR needed - direct API extraction via Playwright
  edeka: {
    browser: 'firefox', waitUntil: 'networkidle', timeout: 30000,
    useApi: true
  }
};

let cachedOffers = {};
let lastUpdated = null;
let tesseractWorker = null;

// ============================================================
// MUTUAL SCRAPER LOCK — prevents /scrape and /scrape/marktguru
// from running simultaneously (otherwise they clobber each
// other's cachedOffers + lastUpdated).
// ============================================================
let currentScrapePromise = null;
let currentScrapeError = null;

// ============================================================
// TESSERACT OCR
// ============================================================
async function getTesseractWorker() {
  if (!tesseractWorker) {
    console.log('  📝 Initializing Tesseract OCR (German)...');
    tesseractWorker = await createWorker('deu');
    console.log('  📝 Tesseract ready');
  }
  return tesseractWorker;
}

async function ocrImage(imageUrl) {
  if (!USE_OCR) return null;
  try {
    const worker = await getTesseractWorker();
    const { data: { text } } = await worker.recognize(imageUrl);
    return text;
  } catch (e) {
    console.warn(`  ⚠️ OCR failed: ${e.message}`);
    return null;
  }
}

// ============================================================
// OLLAMA SEMANTIC PARSING
// ============================================================
async function parseWithOllama(text, storeKey) {
  if (!USE_OLLAMA || !text || text.length < 10) return null;
  
  try {
    const prompt = `Extract ALL product offers from this text as a JSON array.

Return ONLY valid JSON (no markdown, no explanation):
[
  {"name": "product name in German", "price": number},
  ...
]

Rules:
- Only products with prices in EUR
- Price is a number (convert "1,29 €" or "1.29" or "€1.29" to number)
- Product name max 80 chars
- If no offers, return []

TEXT:
${text.substring(0, 8000)}`;

    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { temperature: 0.1, num_predict: 800 } }),
      signal: AbortSignal.timeout(60000)
    });
    
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    const data = await res.json();
    const response = (data.response || '').trim();
    
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const offers = JSON.parse(jsonMatch[0]).filter(o => o.name && o.price > 0);
      if (offers.length > 0) console.log(`  🧠 Ollama ${storeKey}: ${offers.length} offers`);
      return offers.map(o => ({ ...o, store: storeKey }));
    }
    
    // Fallback: parse lines with prices directly
    const priceLines = text.split('\n').filter(line => /[\d.,]+\s*[€]/.test(line));
    const fallback = priceLines.map(line => {
      const priceMatch = line.match(/(\d+[.,]\d{2})\s*[€]?/);
      const name = line.replace(/\d+[.,]\d{2}\s*[€]?/g, '').trim().replace(/\*/g, '').slice(0, 80);
      if (priceMatch && name.length > 2) {
        return { name, price: parseFloat(priceMatch[1].replace(',', '.')), store: storeKey };
      }
    }).filter(Boolean);
    
    if (fallback.length > 0) console.log(`  🔧 ${storeKey}: ${fallback.length} offers via regex fallback`);
    return fallback;
  } catch (e) {
    console.warn(`  ⚠️ Ollama ${storeKey}: ${e.message}`);
    return null;
  }
}

// ============================================================
// FLIPBOOK SCRAPER (NORMA)
// ============================================================
async function scrapeFlipbook(storeKey, url) {
  let browser = null;
  
  try {
    browser = await firefox.launch({ headless: true, args: ['--headless'] });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(5000);
    
    try {
      const btn = await page.$('button:has-text("Alle akzeptieren"), button:has-text("Accept")');
      if (btn) await btn.click();
      await page.waitForTimeout(1000);
    } catch {}
    
    const allImages = new Set();
    const getImages = async () => {
      return await page.$$eval('img', els =>
        els.filter(e => e.src && e.naturalWidth > 100)
           .map(e => e.src)
      );
    };
    
    let imgs = await getImages();
    imgs.forEach(src => allImages.add(src));
    
    for (let attempt = 0; attempt < 6; attempt++) {
      const nextBtn = await page.$('button[class*="next"], button[class*="forward"], [class*="slide"]:not([class*="current"])');
      if (nextBtn) {
        await nextBtn.click();
        await page.waitForTimeout(1500);
        imgs = await getImages();
        imgs.forEach(src => allImages.add(src));
      }
    }
    
    await browser.close();
    
    console.log(`  📄 ${storeKey}: ${allImages.size} images for OCR`);
    
    const allOffers = [];
    for (const src of [...allImages].slice(0, 5)) {
      const ocrText = await ocrImage(src);
      if (ocrText && ocrText.length > 20) {
        const offers = await parseWithOllama(ocrText, storeKey);
        if (offers) allOffers.push(...offers);
      }
    }
    
    const seen = new Set();
    return allOffers.filter(o => {
      const key = `${o.name.toLowerCase()}|${o.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  } catch (e) {
    console.warn(`  ⚠️ Flipbook ${storeKey}: ${e.message}`);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

// ============================================================
// PLAYWRIGHT SCRAPER with scrolling
// ============================================================
async function scrapeWithBrowser(storeKey, url, options = {}) {
  const {
    browser: browserType = 'chromium',
    waitUntil = 'domcontentloaded',
    timeout = 30000,
    selectors = null,
    scrollWait = 800,
    scrollIterations = 8,
    extractName = null,
    extractPrice = null,
    extractOfferId = null,
    preFlow = null,
    useStealth = false
  } = options;
  
  let browser = null;
  
  try {
    const launchOpts = {
      chromium: { 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-blink-features=AutomationDetection'] 
      },
      firefox: { 
        // Headless: true is required in Docker / server environments (no X server).
        // Use 'new' headless mode for better compatibility with modern sites.
        headless: true, 
        args: ['--disable-blink-features=AutomationDetection'] 
      }
    };

    browser = browserType === 'firefox' ? await firefox.launch(launchOpts.firefox) : await chromium.launch(launchOpts.chromium);
    
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: browserType === 'firefox'
        ? 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0'
        : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      extraHTTPHeaders: { 'Accept-Language': 'de-DE,de;q=0.9' }
    });
    
    const page = await context.newPage();
    
    // Apply stealth for Firefox
    if (useStealth && browserType === 'firefox') {
      await page.addInitScript({
        content: `Object.defineProperty(navigator, 'webdriver', { get: () => false });`
      });
    }
    
    await page.goto(url, { waitUntil, timeout });
    await page.waitForTimeout(2500);
    
    // Run preFlow if defined (for multi-step flows like Netto)
    if (typeof preFlow === 'function') {
      console.log(`  🔐 Running preFlow for ${storeKey}...`);
      await preFlow(page);
    }
    
    // Scroll with fixed wait (no networkidle)
    for (let i = 1; i <= scrollIterations; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * 2000);
      await page.waitForTimeout(scrollWait);
    }
    
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    
    const html = await page.content();
    const customExtractors = {};
    if (typeof extractName === 'function') customExtractors.extractName = extractName;
    if (typeof extractPrice === 'function') customExtractors.extractPrice = extractPrice;
    if (typeof extractOfferId === 'function') customExtractors.extractOfferId = extractOfferId;
    if (typeof extractOriginalPrice === 'function') customExtractors.extractOriginalPrice = extractOriginalPrice;
    const offers = parseCheerio(html, storeKey, selectors, Object.keys(customExtractors).length > 0 ? customExtractors : null);
    
    await browser.close();
    return offers;
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

// ============================================================
// ALDI API SCRAPER
// ============================================================
async function scrapeAldiApi(storeKey, storeUrl) {
  let browser = null;
  
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });
    // User agent set via context options instead
    
    // Navigate to establish session/cookies
    await page.goto(storeUrl, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(2000);
    
    // Get the servicePoint from page context or use default B384
    const servicePoint = await page.evaluate(async () => {
      // Try to find servicePoint in localStorage or window state
      try {
        // Look for ALDI store/session data
        const nuxt = window.__NUXT__;
        if (nuxt && nuxt.config && nuxt.config.public) {
          return nuxt.config.public.SERVICE_POINT_ID || 'B384';
        }
      } catch(e) {}
      return 'B384';
    }).catch(() => 'B384');
    
    // Get the category tree to know which categories to scrape
    const categoryData = await page.evaluate(async (sp) => {
      const resp = await fetch(`https://api.aldi-sued.de/v2/product-category-tree?serviceType=walk-in&servicePoint=${sp}`);
      if (!resp.ok) return null;
      return await resp.json();
    }, servicePoint).catch(() => null);
    
    await browser.close();
    browser = null;
    
    if (!categoryData || !categoryData.data) {
      console.warn(`  ⚠️ ${storeKey}: could not get category tree`);
      return [];
    }
    
    // Skip non-food categories
    const skipNames = [
      'Garten', 'Küche & Backen', 'Outdoor & Freizeit', 'Grills & Grillzubehör', 'Heimwerken',
      'Technik & Elektronik', 'Autozubehör', 'Bettwäsche & Heimtextilien', 'Kleidung',
      'Schreibwaren', 'Wellness & Spa', 'Einrichtung & Wohnen', 'Spielzeug',
      'Basteln & DIY', 'Camping', 'Blumen & Blumensträuße', 'ALDImania', 'Muttertag',
      'Sport & Fitness', 'Tierbedarf', 'Drogerie & Kosmetik', 'Haushaltsartikel',
      'Babyartikel', 'Urlaub & Strand'
    ];
    
    const foodCategoryKeys = [];
    function extractFoodCategories(categories) {
      for (const cat of categories) {
        const isFood = !skipNames.some(s => cat.name.includes(s));
        if (isFood) {
          foodCategoryKeys.push(cat.key);
        }
        if (cat.children && cat.children.length > 0) {
          extractFoodCategories(cat.children);
        }
      }
    }
    extractFoodCategories(categoryData.data);
    
    console.log(`  🍎 ${storeKey}: scraping ${foodCategoryKeys.length} food categories via API`);
    
    const allOffers = [];
    const seen = new Set();
    
    // Scrape each food category with pagination
    for (const catKey of foodCategoryKeys) {
      const catOffers = await fetchAldiCategoryWithPagination(servicePoint, catKey);
      
      for (const offer of catOffers) {
        // Dedupe by name+price
        const key = `${offer.name.toLowerCase()}|${offer.price}`;
        if (!seen.has(key)) {
          seen.add(key);
          allOffers.push({ ...offer, store: storeKey });
        }
      }
      
      process.stdout.write(`\r  🍎 ${storeKey}: ${allOffers.length} offers collected (${foodCategoryKeys.indexOf(catKey) + 1}/${foodCategoryKeys.length} categories)`);
    }
    
    console.log(`\n  📋 ${storeKey}: ${allOffers.length} offers via ALDI API`);
    return allOffers;
    
  } catch (e) {
    console.warn(`  ⚠️ ${storeKey}: ${e.message}`);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

async function fetchAldiCategoryWithPagination(servicePoint, categoryKey, limit = 100) {
  const offers = [];
  
  try {
    for (let offset = 0; offset < 500; offset += limit) {
      const url = `https://api.aldi-sued.de/v3/product-search?currency=EUR&serviceType=walk-in&categoryKey=${categoryKey}&limit=${limit}&offset=${offset}&servicePoint=${servicePoint}`;
      
      const resp = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'de-DE,de;q=0.9'
        },
        signal: AbortSignal.timeout(20000)
      });
      
      if (!resp.ok) break;
      
      const data = await resp.json();
      const items = data.data || [];
      const total = data.meta?.pagination?.totalCount;
      
      for (const p of items) {
        // Skip non-food items
        const skipWords = ['Spülmaschinen', 'Waschmaschine', 'Staubsauger', 'Möbel', 'Werkzeug', 'Spielzeug', 'Badewanne', 'Kissen', 'Vorhang', 'Decke'];
        if (skipWords.some(w => p.name.toLowerCase().includes(w))) continue;
        
        // Skip not-for-sale items
        if (p.notForSale) continue;
        
        const priceAmount = p.price?.amount;
        if (!priceAmount || priceAmount <= 0 || priceAmount >= 200) continue;
        
        const originalPriceAmount = p.price?.comparison || null;
        
        offers.push({
          name: p.name.trim().substring(0, 80),
          price: priceAmount / 100,  // ALDI returns prices in cents
          original_price: originalPriceAmount ? originalPriceAmount / 100 : null
        });
      }
      
      if (items.length < limit || offers.length >= total) break;
    }
  } catch (e) {
    console.warn(`    ⚠️ Category ${categoryKey}: ${e.message}`);
  }
  
  return offers;
}

// ============================================================
// EDEKA API SCRAPER
// ============================================================
async function scrapeEdekaApi(storeKey, url) {
  let browser = null;
  
  try {
    browser = await firefox.launch({ headless: true, args: ['--disable-blink-features=AutomationDetection'] });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9' });
    
    // Navigate to the offers page first to establish session/cookies
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Accept cookies if present
    try {
      const cookieBtn = await page.$('button:has-text("Alle akzeptieren")');
      if (cookieBtn) {
        await cookieBtn.click();
        await page.waitForTimeout(1500);
      }
    } catch(e) {}
    
    // Discover the actual market ID from the page
    let marketId = EDEKA_MARKET_ID;
    try {
      // Try to get market ID from page state
      const extracted = await page.evaluate(() => {
        // Try __NEXT_DATA__ or similar hydration state
        const nextData = document.getElementById('__NEXT_DATA__');
        if (nextData) {
          try {
            const parsed = JSON.parse(nextData.textContent);
            // Walk the object looking for marketId/storeId
            const str = JSON.stringify(parsed);
            const m = str.match(/"marketId"\s*:\s*(\d+)/);
            if (m) return m[1];
            const s = str.match(/"storeNumber"\s*:\s*"?(\d+)"?/);
            if (s) return s[1];
          } catch(e) {}
        }
        // Try window state
        const stateMatch = document.body.innerText.match(/Markt-Nr\.?\s*[:.]?\s*(\d{5,})/);
        if (stateMatch) return stateMatch[1];
        return null;
      });
      if (extracted) {
        marketId = extracted;
        console.log(`  📍 ${storeKey}: discovered market ID: ${marketId}`);
      }
    } catch(e) { console.warn(`  ⚠️ Market discovery: ${e.message}`); }

    // Call the internal API that the page uses
    // Use market ID from config for regional offers
    const apiUrl = `https://www.edeka.de/api/auth-proxy/?path=api%2Foffers%3Flimit%3D999&storeNumber=${marketId}`;
    
    const apiResponse = await page.evaluate(async (apiUrl) => {
      try {
        const resp = await fetch(apiUrl);
        if (resp.ok) {
          const json = await resp.json();
          return JSON.stringify(json);
        }
        return null;
      } catch(e) {
        return null;
      }
    }, apiUrl);
    
    await browser.close();
    
    if (!apiResponse) {
      console.warn(`  ⚠️ ${storeKey}: API returned no data`);
      return [];
    }
    
    const data = JSON.parse(apiResponse);
    const offersRaw = data.offers || [];
    
    const offers = [];
    const seen = new Set();
    
    for (const item of offersRaw) {
      if (!item.title || !item.price) continue;
      
      // Skip non-food items
      const skipWords = ['Spülmaschinen', 'Waschmaschine', 'Staubsauger', 'Möbel', 'Werkzeug', 'Spielzeug', 'Drogerie'];
      if (skipWords.some(w => item.title.toLowerCase().includes(w))) continue;
      
      const price = typeof item.price === 'object' ? item.price.rawValue : parseFloat(item.price);
      if (!price || price <= 0 || price >= 200) continue;
      
      // Build name: title + first description
      let name = item.title.trim();
      if (item.descriptions && item.descriptions.length > 0) {
        const desc = item.descriptions[0];
        if (desc && desc.length > 2 && desc.length < 80) {
          name = `${name} ${desc}`;
        }
      }
      name = name.substring(0, 80);
      
      const key = `${name.toLowerCase()}|${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      
      offers.push({
        name,
        price,
        store: storeKey
      });
    }
    
    console.log(`  📋 ${storeKey}: ${offers.length} offers via API`);
    return offers;
    
  } catch (e) {
    console.warn(`  ⚠️ ${storeKey}: ${e.message}`);
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}


// ============================================================
// MARKTGURU SCRAPER - Scrapes marktguru.de for multiple stores
// ============================================================

// Stores discovered on marktguru.de
// Build MARKTGURU_STORES from config (filtered to only enabled stores)
const MARKTGURU_STORES = MARKTGURU_STORE_CONFIG
  .filter(storeKey => MARKTGURU_STORE_URLS[storeKey] && !STORE_EXCLUDED(storeKey))
  .map(storeKey => ({ store: storeKey, ...MARKTGURU_STORE_URLS[storeKey] }));

// Also track excluded marktguru stores count for the scraper status
const MARKTGURU_EXCLUDED_COUNT = MARKTGURU_STORE_CONFIG
  .filter(s => STORE_EXCLUDED(s)).length;

async function scrapeMarktguruStore(page, storeInfo) {
  const { store, name, url } = storeInfo;
  
  try {
    // Accept cookies if present - be more specific
    try {
      const btn = await page.waitForSelector('button:has-text("Akzeptieren"), button:has-text("Alles akzeptieren"), button[id*="cookie"]', { timeout: 5000 }).catch(() => null);
      if (btn) { await btn.click(); await page.waitForTimeout(2000); }
    } catch(e) {}
    
    // Wait longer for JS to render initial offers
    await page.waitForTimeout(8000);
    
    // Try clicking "Mehr angebote" button to load ALL offers (many clicks needed)
    for (let click = 0; click < 50; click++) {
      try {
        const moreBtn = await page.$('button.more-btn');
        if (!moreBtn) break;
        await moreBtn.click({ force: true });
        await page.waitForTimeout(1500);
        const count = await page.evaluate(() => document.querySelectorAll('ul.offer-list li.offer-list-item').length);
        process.stdout.write(`\r  ${name}: ${count} items loaded...`);
        // Stop if we have enough items (e.g., > 500)
        if (count >= 500) break;
      } catch(e) { break; }
    }
    console.log(`\r  ${name}: Done loading offers`);
    
    // Extract offers using structured HTML elements (NOT text parsing)
    const offers = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('ul.offer-list li.offer-list-item'));
      return items.map(item => {
        const name = item.querySelector('h3')?.innerText?.trim() || '';
        const brand = item.querySelector('dd.brand')?.innerText?.trim() || '';
        const priceEl = item.querySelector('dd.price .price');
        const priceText = priceEl?.innerText?.replace(/[€\s]/g, '').replace(',', '.') || '';
        const price = parseFloat(priceText);
        const unitPrice = item.querySelector('div.info strong')?.innerText?.trim() || '';
        // Get offer ID from image URL (contains /offers/{id}/images/)
        const img = item.querySelector('img');
        let offerId = '';
        if (img && img.src) {
          const m = img.src.match(/\/offers\/(\d+)\//);
          if (m) offerId = m[1];
        }
        const link = item.querySelector('a[href*="/offers/"]');
        
        return { name, brand, price, originalPrice: null, unitPrice, offerId, url: offerId ? 'https://www.marktguru.de/offers/' + offerId : '' };
      }).filter(o => o.price > 0 && o.name.length > 2);
    });
    
    return offers;
    
  } catch (e) {
    console.warn(`  ⚠️ ${name}: ${e.message}`);
    return [];
  }
}

async function scrapeAllMarktguruStores() {
  if (currentScrapePromise) throw new Error('Ein Scrape läuft bereits');
  currentScrapePromise = (async () => {
  console.log('\n📍 Scraping marktguru.de stores...');
  const results = {};
  if (MARKTGURU_EXCLUDED_COUNT > 0) {
    console.log(`⏭️  ${MARKTGURU_EXCLUDED_COUNT} marktguru stores excluded`);
  }
  
  const browser = await firefox.launch({ 
    headless: true,
    args: ['--disable-blink-features=AutomationDetection'] 
  });
  
  for (const storeInfo of MARKTGURU_STORES) {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0'
    });
    
    const page = await context.newPage();
    await page.addInitScript({
      content: `Object.defineProperty(navigator, 'webdriver', { get: () => false });`
    });
    
    try {
      await page.goto(storeInfo.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const offers = await scrapeMarktguruStore(page, storeInfo);
      
      // Normalize offers to include proper marktguru offer URLs
      results[storeInfo.store] = offers.map(o => ({
        name: o.name,
        price: o.price,
        original_price: o.originalPrice,
        url: o.url || (o.offerId ? `https://www.marktguru.de/offers/${o.offerId}` : storeInfo.url),
        offer_id: o.offerId,
        source_url: storeInfo.url,
        store: storeInfo.store,
        source: 'marktguru'
      }));
      
      console.log(`  ✅ ${storeInfo.name}: ${results[storeInfo.store].length} offers`);
      
    } catch(e) {
      console.log(`  ❌ ${storeInfo.name}: ${e.message.split('\n')[0]}`);
      results[storeInfo.store] = [];
    }
    
    await context.close();
  }
  
  await browser.close();

  const totalOffers = Object.values(results).reduce((s, a) => s + a.length, 0);
  const active = Object.values(results).filter(a => a.length > 0).length;
  const total = MARKTGURU_STORES.length;  // Total configured Marktguru stores
  const marktguruStart = Date.now() - 60000; // Approximate: scraped for ~1 min
  const durationS = ((Date.now() - marktguruStart) / 1000).toFixed(1);
  console.log(`✅ marktguru: ${totalOffers} total offers from ${active} stores in ${durationS}s\n`);

  setProgress({
    stage: 'done', status: 'done',
    message: `${totalOffers} Marktguru-Angebote von ${active}/${total} Stores in ${durationS}s`,
    source: 'marktguru',
    progress: 100, currentStore: total, totalStores: total,
    stats: { totalOffers, activeStores: active, totalStores: total, durationS }
  });

  return results;
  })();
  try {
    return await currentScrapePromise;
  } finally {
    currentScrapePromise = null;
  }
}
function parseCheerio(html, storeKey, customSelectors = null, customExtractors = null) {
  if (!html) return [];
  
  const customNameExtractor = customExtractors?.extractName || null;
  const customPriceExtractor = customExtractors?.extractPrice || null;
  const customIdExtractor = customExtractors?.extractOfferId || null;
  
  const $ = cheerio.load(html);
  const offers = [];
  const seenIds = customIdExtractor ? new Set() : null;
  const seenTexts = new Set();
  
  const defaultSelectors = [
    '[data-testid="product-tile"]', '[class*="product-tile"]', '[class*="offer-tile"]',
    '[class*="cor-offer-renderer-tile"]', 'article[class*="product"]', '[class*="odsc-tile"]',
    '[class*="product"][class*="item"]', '[class*="offer"][class*="item"]', 'article[class*="offer"]',
  ];
  
  const selectors = customSelectors || defaultSelectors;
  
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (!text || seenTexts.has(text)) return;
      
      let price = null;
      let original_price = null;
      if (customPriceExtractor) {
        price = customPriceExtractor($, el);
      }
      if (!price) {
        const priceMatch = text.match(/(\d+[.,]\d{2})\s*[€]?/);
        if (priceMatch) price = parseFloat(priceMatch[1].replace(',', '.'));
      }
      // Extract original price if custom extractor exists
      if (customExtractors?.extractOriginalPrice) {
        original_price = customExtractors.extractOriginalPrice($, el);
      }
      if (price && price > 0 && price < 200) {
          let name = '';
          
          // Get offer ID for dedup if available
          const offerId = customIdExtractor ? customIdExtractor($, el) : null;
          
          // Get name
          if (customNameExtractor) {
            name = customNameExtractor($, el);
          }
          if (!name || name.length < 2) {
            name = $el.find('h3, h4, h5, .name, .title, [class*="name"], [class*="product-name"], .odsc-tile__headline').first().text().trim() ||
                     $el.find('img').attr('alt') ||
                     $el.find('a[class*="tile__link"]').text().trim() || '';
          }
          
          if (!name || name.length < 2 || name.length > 120) return;
          
          // Skip if we've seen this ID (for stores that have the same offer ID)
          if (offerId && seenIds.has(offerId)) return;
          if (offerId) seenIds.add(offerId);
          
          name = name.replace(/\*/g, '').trim().substring(0, 80);
          seenTexts.add(text);
          offers.push({ name, price, original_price, store: storeKey });
      }
    });
    if (offers.length > 20) break;
  }
  
  // Generic fallback
  if (offers.length < 5) {
    $('[class*="product"], [class*="offer"], article, .item, [data-testid*="product"], a[href*="/p/"]').each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (!text || seenTexts.has(text)) return;
      
      const priceMatch = text.match(/(\d+[.,]\d{2})\s*[€]?/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        if (price && price > 0 && price < 200) {
          const name = $el.find('h3, h4, .name, .title, [class*="name"]').first().text().trim() ||
                       $el.find('img').attr('alt') || '';
          if (name && name.length > 2 && name.length < 120) {
            seenTexts.add(text);
            offers.push({ name: name.replace(/\*/g, '').trim().substring(0, 80), price, store: storeKey });
          }
        }
      }
    });
  }
  
  // Dedupe by name+price
  const unique = [];
  const seen = new Set();
  for (const o of offers) {
    const key = `${o.name}|${o.price}`;
    if (!seen.has(key)) { seen.add(key); unique.push(o); }
  }
  
  return unique
}

// ============================================================
// FETCH
// ============================================================
async function fetchWithRetry(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) return await res.text();
      if (i < retries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return null;
}

// ============================================================
// MAIN SCRAPER
// ============================================================
async function scrapeAllStores() {
  if (currentScrapePromise) throw new Error('Ein Scrape läuft bereits');
  currentScrapePromise = (async () => {
  console.log('🔍 Scraping all stores...');
  const results = {};
  const storeKeys = Object.keys(STORES).filter(k => !STORE_EXCLUDED(k));
  const storeCount = storeKeys.length;
  if (storeCount < Object.keys(STORES).length) {
    console.log(`⏭️  Skipping ${Object.keys(STORES).length - storeCount} excluded stores: ${Object.keys(STORES).filter(k => STORE_EXCLUDED(k)).join(', ')}`);
  }
  const startTime = Date.now();

  for (let i = 0; i < storeKeys.length; i++) {
    const key = storeKeys[i];
    const store = STORES[key];
    const cfg = SCRAPE_CONFIG[key] || {};

    // Emit progress: store started
    setProgress({
      stage: 'fetching',
      status: 'running',
      message: `Lade ${store.name} (${i + 1}/${storeCount})...`,
      progress: Math.round((i / storeCount) * 100),
      currentStore: i + 1,
      totalStores: storeCount,
      currentStoreName: store.name,
      source: 'direkt'
    });

    if (cfg.useApi) {
      console.log(`  📋 ${key}: fetching via API...`);
      results[key] = await scrapeEdekaApi(key, store.url);
    } else if (cfg.isFlipbook && USE_OCR) {
      console.log(`  📄 ${key}: flipbook+OCR...`);
      results[key] = await scrapeFlipbook(key, store.url);
    } else {
      results[key] = await scrapeWithBrowser(key, store.url, {
        browser: cfg.browser,
        waitUntil: cfg.waitUntil || 'domcontentloaded',
        timeout: cfg.timeout || 30000,
        selectors: cfg.selectors,
        scrollWait: cfg.scrollWait || 800,
        scrollIterations: cfg.scrollIterations || 8,
        extractName: cfg.extractName || null,
        extractPrice: cfg.extractPrice || null,
        extractOfferId: cfg.extractOfferId || null,
        extractOriginalPrice: cfg.extractOriginalPrice || null,
        preFlow: cfg.preFlow || null,
        useStealth: cfg.useStealth || false
      });
    }
    console.log(`  ✅ ${key}: ${results[key].length} offers`);
  }

  // Final progress update
  const total = Object.values(results).reduce((s, a) => s + a.length, 0);
  const active = Object.values(results).filter(a => a.length > 0).length;
  const durationS = ((Date.now() - startTime) / 1000).toFixed(1);

  setProgress({
    stage: 'done',
    status: 'done',
    message: `${total} Angebote von ${active}/${storeCount} Stores`,
    progress: 100,
    currentStore: storeCount,
    totalStores: storeCount,
    stats: { totalOffers: total, activeStores: active, totalStores: storeCount, durationS },
    source: 'direkt'
  });

  cachedOffers = results;
  lastUpdated = new Date().toISOString();

  console.log(`✅ ${total} offers from ${active}/${storeCount} stores`);
  return results;
  })();
  try {
    return await currentScrapePromise;
  } finally {
    currentScrapePromise = null;
  }
}

// ============================================================
// FUZZY MATCHING
// ============================================================
const STOPWORDS = new Set(['der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'mit', 'von', 'für', 'zu', 'am', 'im', 'an', 'auf', 'bis', 'nach', 'über', 'aus', 'bei', 'ist', 'sind', 'war', 'waren']);

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\bkg\b/g, 'kilogramm').replace(/\bl\b/g, 'liter').replace(/\bstück\b/g, 'stueck')
    .replace(/\bpkg\b/g, 'packung').replace(/\bg\b/g, 'gramm')
    .replace(/\d+/g, '#')
    .split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w)).join(' ');
}

function levenshteinSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lenA = a.length, lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;
  const matrix = Array(lenA + 1).fill(null).map(() => Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
    }
  }
  return 1 - matrix[lenA][lenB] / Math.max(lenA, lenB);
}

function fuzzyMatch(itemName, offerName) {
  const normItem = normalizeText(itemName);
  const normOffer = normalizeText(offerName);
  if (!normItem || !normOffer) return 0;
  
  const itemWords = normItem.split(/\s+/).filter(w => w.length > 2);
  const offerWords = normOffer.split(/\s+/).filter(w => w.length > 2);
  if (itemWords.length === 0 || offerWords.length === 0) return 0;
  
  let score = 0;
  for (const iw of itemWords) {
    let best = 0;
    for (const ow of offerWords) {
      if (ow.includes(iw) || iw.includes(ow)) {
        best = Math.max(best, 2);
      } else {
        best = Math.max(best, levenshteinSimilarity(iw, ow));
      }
    }
    score += best;
  }
  return score / itemWords.length;
}

function matchItemsToOffers(shoppingItems) {
  if (!shoppingItems || shoppingItems.length === 0) return [];
  
  const results = [];
  for (const item of shoppingItems) {
    if (item.checked) continue;
    const matchedOffers = [];
    for (const [store, offers] of Object.entries(cachedOffers)) {
      for (const offer of offers) {
        const score = fuzzyMatch(item.item, offer.name);
        if (score > 0.3) {
          matchedOffers.push({ store, name: offer.name, price: offer.price, matchScore: score });
        }
      }
    }
    matchedOffers.sort((a, b) => b.matchScore - a.matchScore || a.price - b.price);
    if (matchedOffers.length > 0) {
      results.push({
        item: item.item, amount: item.amount, unit: item.unit,
        category: item.category, store: item.store,
        bestOffers: matchedOffers.slice(0, 3)
      });
    }
  }
  return results;
}

function getOffers() {
  return { offers: cachedOffers, lastUpdated };
}

process.on('exit', async () => { 
  try { 
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
  } catch {} 
});

module.exports = {
  getProgress,
  scrapeAllStores, scrapeAllMarktguruStores, getOffers, matchItemsToOffers, MARKTGURU_STORES };