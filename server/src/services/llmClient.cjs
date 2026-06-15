/**
 * Generic LLM Client
 * Supports any OpenAI-compatible API endpoint (OpenAI, OpenRouter, Anthropic, Gemini, Ollama, MiniMax, custom).
 * Reads configuration from llm-config.json.
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'data', 'llm-config.json');

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    provider: 'ollama',
    ollama: { endpoint: 'http://localhost:11434', model: 'llama3.2', temperature: 0.1 }
  };
}

function maskKey(key) {
  if (!key) return '';
  return key ? '***' + key.slice(-4) : '';
}

// Provider definitions
const PROVIDERS = {
  openrouter: {
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-4o-mini',
    headers: () => ({
      'Authorization': `Bearer ${getConfig().openrouter?.apiKey || ''}`,
      'HTTP-Referer': 'https://moca.local',
      'X-Title': 'MOCA'
    })
  },
  anthropic: {
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    headers: () => ({
      'x-api-key': getConfig().anthropic?.apiKey || '',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    })
  },
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    headers: () => ({
      'Authorization': `Bearer ${getConfig().openai?.apiKey || ''}`,
      'Content-Type': 'application/json'
    })
  },
  gemini: {
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.0-flash',
    headers: () => ({
      'Authorization': `Bearer ${getConfig().gemini?.apiKey || ''}`,
      'Content-Type': 'application/json'
    })
  },
  ollama: {
    name: 'Ollama (Lokal)',
    endpoint: 'http://localhost:11434/api/chat',
    defaultModel: 'llama3.2',
    headers: () => ({
      'Content-Type': 'application/json'
    })
  },
  minimax: {
    name: 'MiniMax',
    endpoint: 'https://api.minimax.chat/v1/chat/completions',
    defaultModel: 'MiniMax-Text-01',
    headers: () => ({
      'Authorization': `Bearer ${getConfig().minimax?.apiKey || ''}`,
      'Content-Type': 'application/json'
    })
  },
  custom: {
    name: 'Custom Endpoint',
    endpoint: null, // user provides their own
    defaultModel: '',
    headers: () => ({
      'Authorization': `Bearer ${getConfig().custom?.apiKey || ''}`,
      'Content-Type': 'application/json'
    })
  }
};

/**
 * Call the LLM with a chat messages array.
 * @param {string[]} messages - Array of {role, content} objects
 * @param {object} opts - Optional overrides: model, temperature, maxTokens
 * @returns {Promise<string>} - The response text
 */
async function chat(messages, opts = {}) {
  const config = getConfig();
  const providerKey = opts._providerOverride || config.provider;
  const provider = config[providerKey] || {};

  let endpoint = provider.endpoint || PROVIDERS[providerKey]?.endpoint || '';
  // Ollama requires /api/chat path
  if (providerKey === 'ollama' && endpoint && !endpoint.includes('/api/chat')) {
    endpoint = endpoint.replace(/\/$/, '') + '/api/chat';
  }
  let model = opts._modelOverride || opts.model || provider.model || PROVIDERS[providerKey]?.defaultModel || '';
  const temperature = opts.temperature ?? provider.temperature ?? 0.1;
  const maxTokens = opts.maxTokens || 800;

  // Override endpoint for custom provider
  if (providerKey === 'custom') {
    endpoint = provider.endpoint || '';
  }

  if (!endpoint) {
    throw new Error(`No endpoint configured for provider: ${providerKey}`);
  }

  const headers = { ...PROVIDERS[providerKey]?.headers() };

  let body;
  if (providerKey === 'anthropic') {
    // Anthropic uses different message format and has max_tokens instead of maxTokens
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');
    body = {
      model: model || PROVIDERS.anthropic.defaultModel,
      max_tokens: maxTokens,
      messages: [
        ...(systemMsg ? [{ role: 'user', content: `System instructions: ${systemMsg.content}` }] : []),
        ...userMsgs.map(m => ({ role: m.role, content: m.content }))
      ]
    };
  } else {
    body = {
      model: model || 'unknown-model',
      messages,
      temperature,
      max_tokens: maxTokens
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();

  // Parse response based on provider
  if (providerKey === 'anthropic') {
    return data.content?.[0]?.text || '';
  } else {
    return data.choices?.[0]?.message?.content || '';
  }
}

/**
 * Call LLM and parse JSON response.
 * Tries to extract JSON from the text response (handles markdown-wrapped JSON).
 */
async function chatJSON(messages, opts = {}) {
  const text = await chat(messages, opts);
  console.log('[chatJSON] raw LLM response:', text.substring(0, 500));
  // Find the first { and match to its balanced }
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) throw new Error('No JSON found in LLM response');
  let depth = 0;
  let end = firstBrace;
  for (let i = firstBrace; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const jsonStr = text.substring(firstBrace, end);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('JSON parse error: ' + e.message + ' | snippet: ' + jsonStr.substring(0, 100));
  }
}

module.exports = { chat, chatJSON, getConfig, PROVIDERS };