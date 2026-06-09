const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const CONFIG_FILE = path.join(__dirname, '../data/llm-config.json');

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return { provider: 'ollama', ollama: { endpoint: 'http://localhost:11434', model: 'llama3.2', temperature: 0.1 }, minimax: { apiKey: '', model: 'MiniMax-Text-01', baseUrl: 'https://api.minimax.chat/v1' } };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Supported LLM providers
const PROVIDERS = {
  openrouter: { name: 'OpenRouter', defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'openai/gpt-4o-mini' },
  anthropic: { name: 'Anthropic', defaultEndpoint: 'https://api.anthropic.com/v1/messages', defaultModel: 'claude-sonnet-4-20250514' },
  openai: { name: 'OpenAI', defaultEndpoint: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' },
  gemini: { name: 'Google Gemini', defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', defaultModel: 'gemini-2.0-flash' },
  ollama: { name: 'Ollama (Lokal)', defaultEndpoint: 'http://localhost:11434/api/chat', defaultModel: 'llama3.2' },
  minimax: { name: 'MiniMax', defaultEndpoint: 'https://api.minimax.chat/v1/chat/completions', defaultModel: 'MiniMax-Text-01' },
  custom: { name: 'Custom Endpoint', defaultEndpoint: '', defaultModel: '' }
};

// Mask an API key, showing only last 4 chars
function maskKey(key) {
  if (!key) return '';
  return key.startsWith('***') ? key : (key ? '***' + key.slice(-4) : '');
}

// Mask all apiKey fields in config for GET response
function maskConfig(cfg) {
  const masked = JSON.parse(JSON.stringify(cfg));
  for (const key of Object.keys(PROVIDERS)) {
    if (masked[key]?.apiKey) {
      masked[key].apiKey = maskKey(masked[key].apiKey);
    }
  }
  return masked;
}

// GET /api/settings/llm - Get LLM config (apiKey masked)
router.get('/llm', (req, res) => {
  const cfg = getConfig();
  res.json(maskConfig(cfg));
});

// PUT /api/settings/llm - Update LLM config
router.put('/llm', (req, res) => {
  const cfg = getConfig();
  const updates = req.body;

  if (updates.provider !== undefined) cfg.provider = updates.provider;

  // Update per-provider config
  for (const key of Object.keys(PROVIDERS)) {
    if (updates[key]) {
      cfg[key] = { ...cfg[key], ...updates[key] };
      // Restore full API key if client sent a masked value
      if (cfg[key].apiKey?.startsWith('***')) {
        const old = getConfig();
        cfg[key].apiKey = old[key]?.apiKey || '';
      }
    }
  }

  saveConfig(cfg);
  res.json({ success: true, config: maskConfig(cfg) });
});

// POST /api/settings/llm/test - Test LLM connection for a provider
router.post('/llm/test', async (req, res) => {
  const cfg = getConfig();
  const { provider } = req.body || {};
  const targetProvider = provider || cfg.provider;
  const pCfg = cfg[targetProvider] || {};

  if (!pCfg || !PROVIDERS[targetProvider]) {
    return res.status(400).json({ error: 'Unknown provider: ' + targetProvider });
  }

  // Get full apiKey for testing (restore from disk if masked)
  let apiKey = pCfg.apiKey || '';
  if (apiKey.startsWith('***')) {
    const fullCfg = getConfig();
    apiKey = fullCfg[targetProvider]?.apiKey || '';
  }

  const endpoint = pCfg.endpoint || PROVIDERS[targetProvider].defaultEndpoint;
  const model = pCfg.model || PROVIDERS[targetProvider].defaultModel;

  if (!apiKey && targetProvider !== 'ollama' && targetProvider !== 'custom') {
    return res.json({ success: false, error: 'API Key nicht gesetzt', provider: targetProvider });
  }

  try {
    const result = await testLLMProvider(targetProvider, endpoint, apiKey, model);
    res.json({ success: true, provider: targetProvider, ...result });
  } catch (e) {
    res.json({ success: false, provider: targetProvider, error: e.message, endpoint });
  }
});

async function testLLMProvider(provider, endpoint, apiKey, model) {
  const messages = [{ role: 'user', content: 'Say "OK" if you can read this.' }];
  let headers = { 'Content-Type': 'application/json' };

  if (provider === 'openrouter') {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = 'https://moca.local';
    headers['X-Title'] = 'MOCA';
  } else if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (provider === 'openai' || provider === 'gemini') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'minimax') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'custom') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  let body;
  if (provider === 'anthropic') {
    body = { model, max_tokens: 10, messages };
  } else {
    body = { model, messages, max_tokens: 50 };
  }

  const resp = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await resp.text();

  if (!resp.ok) {
    try { const e = JSON.parse(text); throw new Error(e.error?.message || e.message || text.slice(0, 100)); }
    catch (e) { if (e.message !== text.slice(0, 100)) throw e; throw new Error(text.slice(0, 200)); }
  }

  const data = JSON.parse(text);
  if (provider === 'anthropic') {
    return { model, response: data.content?.[0]?.text || 'OK' };
  } else {
    return { model, response: data.choices?.[0]?.message?.content || 'OK' };
  }
}

module.exports = router;
// ============================================================
// STORE EXCLUSIONS
// ============================================================
const OFFERS_CONFIG = path.join(__dirname, '../data/offers-config.json');
const STORE_LABELS = {
  'lidl': 'Lidl',
  'penny': 'PENNY',
  'rewe': 'REWE',
  'kaufland': 'Kaufland',
  'netto-marken-discount': 'Netto Marken-Discount',
  'nahkauf': 'Nahkauf',
  'toom': 'Toom Baumarkt',
  'hornbach': 'Hornbach',
  'obi': 'OBI',
  'hellweg': 'Hellweg',
  'kabs': 'Kabs',
  'aldi': 'ALDI',
  'edeka': 'EDEKA',
  'metro': 'METRO',
  'real': 'real'
};

function getOffersConfig() {
  try {
    if (fs.existsSync(OFFERS_CONFIG)) {
      return JSON.parse(fs.readFileSync(OFFERS_CONFIG, 'utf8'));
    }
  } catch (e) {}
  return { plz: '56377', stores: [], marktguruStores: [], excludedStores: [] };
}

function saveOffersConfig(cfg) {
  fs.writeFileSync(OFFERS_CONFIG, JSON.stringify(cfg, null, 2));
}

// GET /api/settings/stores - Get all known stores + their excluded status
router.get('/stores', (req, res) => {
  const cfg = getOffersConfig();
  const allStores = Array.from(new Set([...(cfg.stores || []), ...(cfg.marktguruStores || [])]));
  const excluded = cfg.excludedStores || [];
  res.json({
    stores: allStores.map(key => ({
      key,
      label: STORE_LABELS[key] || key,
      excluded: excluded.includes(key)
    })),
    excludedCount: excluded.length,
    activeCount: allStores.length - excluded.length
  });
});

// PUT /api/settings/stores - Update store exclusions and PLZ
// Body: { excludedStores?: string[], plz?: string }
router.put('/stores', (req, res) => {
  const cfg = getOffersConfig();
  const { excludedStores, plz } = req.body || {};

  if (plz !== undefined) cfg.plz = String(plz).trim();

  if (excludedStores !== undefined) {
    if (!Array.isArray(excludedStores)) {
      return res.status(400).json({ error: 'excludedStores must be an array' });
    }
    const validKeys = new Set([...(cfg.stores || []), ...(cfg.marktguruStores || []), ...Object.keys(STORE_LABELS)]);
    const cleaned = excludedStores.filter(k => typeof k === 'string' && validKeys.has(k));
    cfg.excludedStores = [...new Set(cleaned)];
  }

  saveOffersConfig(cfg);
  res.json({ success: true, plz: cfg.plz, excludedStores: cfg.excludedStores || [] });
});

// POST /api/settings/stores/reset - Reset exclusions to default (none excluded)
router.post('/stores/reset', (req, res) => {
  const cfg = getOffersConfig();
  cfg.excludedStores = [];
  saveOffersConfig(cfg);
  res.json({ success: true, excludedStores: [] });
});

