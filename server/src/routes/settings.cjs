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

// GET /api/settings/llm - Get LLM config
router.get('/llm', (req, res) => {
  const cfg = getConfig();
  // Don't expose API key
  if (cfg.minimax?.apiKey) {
    cfg.minimax.apiKey = cfg.minimax.apiKey ? '***' + cfg.minimax.apiKey.slice(-4) : '';
  }
  res.json(cfg);
});

// PUT /api/settings/llm - Update LLM config
router.put('/llm', (req, res) => {
  const cfg = getConfig();
  const updates = req.body;
  
  if (updates.provider !== undefined) cfg.provider = updates.provider;
  if (updates.ollama) {
    cfg.ollama = { ...cfg.ollama, ...updates.ollama };
  }
  if (updates.minimax) {
    cfg.minimax = { ...cfg.minimax, ...updates.minimax };
    // Restore full API key if masked
    if (cfg.minimax.apiKey?.startsWith('***')) {
      const old = getConfig();
      cfg.minimax.apiKey = old.minimax?.apiKey || '';
    }
  }
  
  saveConfig(cfg);
  res.json({ success: true, config: cfg });
});

// POST /api/settings/llm/test - Test LLM connection
router.post('/llm/test', async (req, res) => {
  const cfg = getConfig();
  const { provider } = req.body || {};
  const targetProvider = provider || cfg.provider;

  if (targetProvider === 'ollama') {
    // Test Ollama connection
    const endpoint = cfg.ollama?.endpoint || 'http://localhost:11434';
    try {
      const result = await testOllama(endpoint);
      res.json({ success: true, provider: 'ollama', ...result });
    } catch (e) {
      res.json({ success: false, provider: 'ollama', error: e.message, endpoint });
    }
  } else if (targetProvider === 'minimax') {
    // Test MiniMax connection
    const apiKey = cfg.minimax?.apiKey;
    if (!apiKey || apiKey === '' || apiKey.startsWith('***')) {
      // Try to get full key from current config
      const fullCfg = getConfig();
      if (!fullCfg.minimax?.apiKey) {
        return res.json({ success: false, provider: 'minimax', error: 'API Key nicht gesetzt' });
      }
      cfg.minimax.apiKey = fullCfg.minimax.apiKey;
    }
    
    try {
      const result = await testMinimax(cfg.minimax);
      res.json({ success: true, provider: 'minimax', ...result });
    } catch (e) {
      res.json({ success: false, provider: 'minimax', error: e.message });
    }
  } else {
    res.status(400).json({ error: 'Unknown provider: ' + targetProvider });
  }
});

function testOllama(endpoint) {
  return new Promise((resolve, reject) => {
    const req = spawn('curl', ['-s', '-m', '5', `${endpoint}/api/tags`]);
    let output = '';
    let error = '';
    
    req.stdout.on('data', d => output += d.toString());
    req.stderr.on('data', d => error += d.toString());
    
    req.on('close', code => {
      if (code === 0) {
        try {
          const tags = JSON.parse(output);
          const models = tags.models?.map(m => m.name) || [];
          resolve({ endpoint, models, modelCount: models.length });
        } catch (e) {
          resolve({ endpoint, models: [], modelCount: 0 });
        }
      } else {
        reject(new Error(error || 'Connection failed (exit ' + code + ')'));
      }
    });
    
    req.on('error', e => reject(e));
  });
}

function testMinimax(config) {
  return new Promise((resolve, reject) => {
    const req = spawn('curl', [
      '-s', '-m', '10',
      '-H', `Authorization: Bearer ${config.apiKey}`,
      '-H', 'Content-Type: application/json',
      '-X', 'POST',
      `${config.baseUrl || 'https://api.minimax.chat/v1'}/text/chatcompletion_v2`,
      '-d', JSON.stringify({
        model: config.model || 'MiniMax-Text-01',
        messages: [{ role: 'user', content: 'Say "OK" if you can read this.' }]
      })
    ]);
    
    let output = '';
    let error = '';
    
    req.stdout.on('data', d => output += d.toString());
    req.stderr.on('data', d => error += d.toString());
    
    req.on('close', code => {
      if (code === 0) {
        try {
          const resp = JSON.parse(output);
          if (resp.choices?.[0]?.message?.content) {
            resolve({ model: config.model, response: resp.choices[0].message.content });
          } else {
            resolve({ model: config.model, raw: output.substring(0, 200) });
          }
        } catch (e) {
          resolve({ model: config.model, raw: output.substring(0, 200) });
        }
      } else {
        try {
          const errResp = JSON.parse(output);
          reject(new Error(errResp.base_error?.message || errResp.error?.message || output.substring(0, 100)));
        } catch (e) {
          reject(new Error(error || 'Request failed (exit ' + code + ')'));
        }
      }
    });
    
    req.on('error', e => reject(e));
  });
}

module.exports = router;