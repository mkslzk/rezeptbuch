// Integration tests for the P0/P1 route fixes.
// Run with: node --test test/routes.test.cjs
//
// These tests start a full Express app on a random port and hit the
// real routes with HTTP. They require a writable server/src/data dir
// (the existing rezeptbuch.db will be reused — these tests don't drop
// tables, they only assert endpoint behavior).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

let baseUrl;
const TEST_PORT = 3911;

before(async () => {
  // Boot the real server but on a random port. We require the index.js which
  // auto-initializes the DB and routes.
  const { createRequire } = require('node:module');
  const path = require('node:path');

  // Patch PORT before requiring
  const origPort = process.env.PORT;
  process.env.PORT = '0';

  // We can't easily require the ESM index.js from CJS, so we spawn it as a
  // child process instead.
  const { spawn } = require('node:child_process');
  const proc = spawn('node', [path.join(__dirname, '..', 'src', 'index.js')], {
    env: { ...process.env, PORT: '3911' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Wait for "Server on" to appear
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server boot timeout')), 10000);
    proc.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      if (s.includes('Server on')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr.on('data', (chunk) => process.stderr.write('[server] ' + chunk));
    proc.on('error', reject);
  });

  baseUrl = `http://localhost:${TEST_PORT}`;

  // Save the process so we can kill it after
  global.__testServer = proc;
});

after(async () => {
  if (global.__testServer) {
    global.__testServer.kill('SIGTERM');
  }
});

async function http_(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: chunks });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// === P0-1: PATCH /api/recipes/:id/favorite regression ===
test('PATCH /api/recipes/:id/favorite toggles is_favorite (was dead due to export default bug)', async () => {
  // Read initial state
  const before = await http_('GET', '/api/recipes/1');
  assert.equal(before.status, 200, 'recipe 1 should exist (seeded)');
  const initial = before.body.is_favorite === 1 ? 1 : 0;

  // Toggle
  const patch = await http_('PATCH', '/api/recipes/1/favorite');
  assert.equal(patch.status, 200, 'PATCH should succeed (was 404 before P0-1 fix)');
  assert.ok('is_favorite' in patch.body, 'response should include is_favorite');
  assert.equal(patch.body.is_favorite, initial === 1 ? 0 : 1, 'should toggle');

  // Toggle back so tests are idempotent
  await http_('PATCH', '/api/recipes/1/favorite');
});

test('PATCH /api/recipes/9999/favorite returns 404 for missing recipe', async () => {
  const r = await http_('PATCH', '/api/recipes/9999/favorite');
  assert.equal(r.status, 404);
});

// === P0-2: shopping_items off_* columns regression ===
test('POST /api/shopping-lists/:id/items with off_* fields no longer throws (P0-2 schema fix)', async () => {
  // Find or create a shopping list
  const lists = await http_('GET', '/api/shopping-lists');
  let listId;
  if (Array.isArray(lists.body) && lists.body.length > 0) {
    listId = lists.body[0].id;
  } else {
    const created = await http_('POST', '/api/shopping-lists', {});
    listId = created.body.id;
  }

  const payload = {
    item: 'Test Milch (regression)',
    amount: '1',
    unit: 'L',
    category: 'dairy',
    store: 'aldi',
    off_product_name: 'Milsani H-Milch 3.5%',
    off_product_code: 'TEST-CODE-123',
    off_brand: 'Milsani',
    off_quantity: '1 L'
  };

  const r = await http_('POST', `/api/shopping-lists/${listId}/items`, payload);
  assert.equal(r.status, 201, `should create (was 500 before P0-2 fix): ${r.raw}`);
  assert.equal(r.body.off_product_code, 'TEST-CODE-123', 'should persist off_product_code');
  assert.equal(r.body.off_brand, 'Milsani');

  // Cleanup
  await http_('DELETE', `/api/shopping-lists/${listId}/items/${r.body.id}`);
});

// === P1-1: GET /api/offers/history regression ===
test('GET /api/offers/history returns paginated scrape records (was 404 before P1-1)', async () => {
  const r = await http_('GET', '/api/offers/history?page=1&limit=10');
  assert.equal(r.status, 200, 'should return 200 (was 404 before P1-1 fix)');
  assert.ok(Array.isArray(r.body.records), 'should have records array');
  assert.ok('total' in r.body, 'should include total count');
  assert.ok('page' in r.body && 'totalPages' in r.body, 'should include pagination metadata');
});

test('GET /api/offers/history/:scrapeId returns 404 for non-existent scrape', async () => {
  const r = await http_('GET', '/api/offers/history/999999');
  assert.equal(r.status, 404);
});

// === P1-2: GET /api/meal-plans/:id/entries regression ===
test('GET /api/meal-plans/:id/entries returns array (was 404 before P1-2 fix)', async () => {
  // Get a meal plan
  const plans = await http_('GET', '/api/meal-plans');
  let planId;
  if (Array.isArray(plans.body) && plans.body.length > 0) {
    planId = plans.body[0].id;
  } else if (plans.body && plans.body.id) {
    planId = plans.body.id;
  } else {
    // Create a plan
    const today = new Date().toISOString().split('T')[0];
    const created = await http_('POST', '/api/meal-plans', { week_start: today });
    planId = created.body.id;
  }

  if (planId) {
    const r = await http_('GET', `/api/meal-plans/${planId}/entries`);
    assert.equal(r.status, 200, 'should return 200 (was 404 before P1-2 fix)');
    assert.ok(Array.isArray(r.body), 'should return array of entries');
  }
});

// === P3-1: Image upload endpoint ===
test('POST /api/uploads/image accepts valid PNG', async () => {
  // 1x1 transparent PNG
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const buf = Buffer.from(pngB64, 'base64');

  const r = await new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const parts = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="image"; filename="test.png"\r\n',
      'Content-Type: image/png\r\n\r\n'
    ];
    const head = Buffer.from(parts.join(''), 'utf8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([head, buf, tail]);

    const req = http.request({
      method: 'POST',
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/uploads/image',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: chunks });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  assert.equal(r.status, 201, `should return 201, got ${r.status}: ${r.raw}`);
  assert.ok(r.body.url, 'should return url');
  assert.match(r.body.url, /^\/api\/uploads\//, 'url should be /api/uploads/...');
  assert.equal(r.body.mimetype, 'image/png');
});

test('POST /api/uploads/image rejects non-image with 400', async () => {
  const r = await new Promise((resolve, reject) => {
    const boundary = '----TestBoundary' + Date.now();
    const parts = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="image"; filename="fake.txt"\r\n',
      'Content-Type: text/plain\r\n\r\n'
    ];
    const head = Buffer.from(parts.join(''), 'utf8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const body = Buffer.concat([head, Buffer.from('not an image', 'utf8'), tail]);

    const req = http.request({
      method: 'POST',
      hostname: 'localhost',
      port: TEST_PORT,
      path: '/api/uploads/image',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, body: parsed, raw: chunks });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  assert.equal(r.status, 400, 'should reject non-image');
});

// === P3-2: Categorize endpoint ===
test('POST /api/categorize enriches an OFF product', async () => {
  const r = await http_('POST', '/api/categorize', {
    name: 'Milsani H-Milch 3.5%',
    brand: 'Milsani',
    quantity: '1 L',
    category: 'Milch'
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.category, 'dairy');
  assert.equal(r.body.store, 'aldi');
  assert.equal(r.body.amount, '1');
  assert.equal(r.body.unit, 'L');
});

test('POST /api/categorize/batch handles multiple products', async () => {
  const r = await http_('POST', '/api/categorize/batch', {
    products: [
      { name: 'Coca Cola 1.5L' },
      { name: 'Thunfisch in Olivenöl' },
      { name: 'Brot Vollkorn' }
    ]
  });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.products));
  assert.equal(r.body.products.length, 3);
  assert.equal(r.body.products[0].category, 'beverages');
  assert.equal(r.body.products[1].category, 'meat');
  assert.equal(r.body.products[2].category, 'bakery');
});

// === Rating endpoint (Rezept-Rating feature) ===
test('PATCH /api/recipes/:id/rating sets first rating correctly', async () => {
  // Use recipe 5 (least touched by other tests)
  const before = await http_('GET', '/api/recipes/5');
  const initialCount = before.body.rating_count || 0;
  const initialAvg = Number(before.body.rating) || 0;

  const r = await http_('PATCH', '/api/recipes/5/rating', { rating: 5 });
  assert.equal(r.status, 200, `should return 200, got ${r.status}: ${r.raw}`);
  assert.equal(r.body.rating_count, initialCount + 1);
  const expectedAvg = (initialAvg * initialCount + 5) / (initialCount + 1);
  assert.ok(Math.abs(r.body.rating - expectedAvg) < 0.001, `avg should be ~${expectedAvg}, got ${r.body.rating}`);
});

test('PATCH /api/recipes/:id/rating computes running average on multiple ratings', async () => {
  const before = await http_('GET', '/api/recipes/3');
  const initialCount = before.body.rating_count || 0;
  const initialAvg = Number(before.body.rating) || 0;

  const r1 = await http_('PATCH', '/api/recipes/3/rating', { rating: 4 });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.rating_count, initialCount + 1);

  const r2 = await http_('PATCH', '/api/recipes/3/rating', { rating: 2 });
  assert.equal(r2.status, 200);
  assert.equal(r2.body.rating_count, initialCount + 2);

  const expectedAvg = (initialAvg * initialCount + 4 + 2) / (initialCount + 2);
  assert.ok(Math.abs(r2.body.rating - expectedAvg) < 0.001, `avg should be ~${expectedAvg}, got ${r2.body.rating}`);
});

test('PATCH /api/recipes/:id/rating rejects invalid values with 400', async () => {
  for (const bad of [0, 6, -1, 1.5, 'abc', null, undefined]) {
    const r = await http_('PATCH', '/api/recipes/1/rating', { rating: bad });
    assert.equal(r.status, 400, `should reject rating=${JSON.stringify(bad)}, got ${r.status}: ${r.raw}`);
  }
});

test('PATCH /api/recipes/9999/rating returns 404 for missing recipe', async () => {
  const r = await http_('PATCH', '/api/recipes/9999/rating', { rating: 3 });
  assert.equal(r.status, 404);
});

test('GET /api/recipes/:id includes rating and rating_count fields', async () => {
  const r = await http_('GET', '/api/recipes/1');
  assert.equal(r.status, 200);
  assert.ok('rating' in r.body, 'should include rating field');
  assert.ok('rating_count' in r.body, 'should include rating_count field');
});
