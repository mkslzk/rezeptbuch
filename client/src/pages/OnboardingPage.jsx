import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './OnboardingPage.css';

const THEMES = [
  { id: 'default', name: 'Classic', primary: '#5c6bc0', bg: '#f5f5f5', accent: '#7986cb' },
  { id: 'forest', name: 'Forest', primary: '#2e7d32', bg: '#e8f5e9', accent: '#66bb6a' },
  { id: 'sunset', name: 'Sunset', primary: '#e65100', bg: '#fff3e0', accent: '#ff9800' },
  { id: 'ocean', name: 'Ocean', primary: '#0277bd', bg: '#e1f5fe', accent: '#29b6f6' },
  { id: 'berry', name: 'Berry', primary: '#7b1fa2', bg: '#f3e5f5', accent: '#ab47bc' },
  { id: 'monochrome', name: 'Mono', primary: '#37474f', bg: '#eceff1', accent: '#78909c' },
];

const PROVIDERS = [
  { id: 'ollama', name: '🖥️ Ollama (Lokal)', desc: 'Kostenlos, lokal, privacy-first', icon: '💻', needsKey: false },
  { id: 'openrouter', name: '🌐 OpenRouter', desc: '100+ Modelle, einfacher API-Zugang', icon: '🌍', needsKey: true },
  { id: 'openai', name: '🤖 OpenAI', desc: 'GPT-4o, GPT-4o-mini', icon: '🤖', needsKey: true },
  { id: 'anthropic', name: '🧠 Anthropic', desc: 'Claude Sonnet, Claude Opus', icon: '🧠', needsKey: true },
  { id: 'gemini', name: '✨ Google Gemini', desc: 'Gemini Flash, Gemini Pro', icon: '✨', needsKey: true },
  { id: 'minimax', name: '🌏 MiniMax', desc: 'MiniMax Text-01', icon: '🌏', needsKey: true },
  { id: 'custom', name: '⚙️ Custom', desc: 'Beliebiger OpenAI-kompatibler Endpunkt', icon: '⚙️', needsKey: false },
];

const OFF_STORES = [
  { key: 'lidl', label: 'Lidl' },
  { key: 'penny', label: 'PENNY' },
  { key: 'rewe', label: 'REWE' },
  { key: 'kaufland', label: 'Kaufland' },
  { key: 'netto', label: 'Netto' },
  { key: 'aldi', label: 'ALDI' },
  { key: 'edeka', label: 'EDEKA' },
  { key: 'real', label: 'real' },
  { key: 'metro', label: 'METRO' },
  { key: 'toom', label: 'Toom Baumarkt' },
  { key: 'hornbuch', label: 'Hornbach' },
];

export default function OnboardingPage({ onComplete }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedTheme, setSelectedTheme] = useState('default');
  const [provider, setProvider] = useState('ollama');
  const [apiKey, setApiKey] = useState('');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [plz, setPlz] = useState('');
  const [excludedStores, setExcludedStores] = useState([]);
  const [saving, setSaving] = useState(false);

  // Load existing LLM config
  useEffect(() => {
    fetch('/recipe/api/settings/llm')
      .then(r => r.json())
      .then(cfg => {
        if (cfg.provider) setProvider(cfg.provider);
      })
      .catch(() => {});
  }, []);

  async function testConnection() {
    setTestLoading(true);
    setTestResult(null);
    try {
      const body = { provider };
      if (provider === 'custom') {
        body.custom = { endpoint: customEndpoint, model: customModel, apiKey };
      } else if (provider !== 'ollama') {
        body[provider] = { apiKey };
      }
      const res = await fetch('/recipe/api/settings/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setTestResult(data.success
        ? { type: 'success', msg: `✓ ${data.response || 'Verbindung erfolgreich!'}` }
        : { type: 'error', msg: `✗ ${data.error || 'Verbindung fehlgeschlagen'}` }
      );
    } catch (e) {
      setTestResult({ type: 'error', msg: '✗ Netzwerkfehler' });
    }
    setTestLoading(false);
  }

  async function saveAll() {
    setSaving(true);
    try {
      // Save LLM config
      const llmCfg = { provider };
      if (provider === 'ollama') {
        llmCfg.ollama = { endpoint: 'http://localhost:11434', model: 'llama3.2', temperature: 0.1 };
      } else if (provider === 'custom') {
        llmCfg.custom = { endpoint: customEndpoint, apiKey, model: customModel };
      } else if (provider === 'minimax') {
        llmCfg.minimax = { apiKey, model: 'MiniMax-Text-01', baseUrl: 'https://api.minimax.chat/v1' };
      } else {
        llmCfg[provider] = { apiKey };
      }
      await fetch('/recipe/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmCfg)
      });

      // Save offers config (PLZ + stores)
      await fetch('/recipe/api/settings/stores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plz, excludedStores })
      });

      // Save theme
      const theme = THEMES.find(t => t.id === selectedTheme);
      localStorage.setItem('moca_theme', selectedTheme);
      if (theme) {
        document.documentElement.style.setProperty('--primary', theme.primary);
        document.documentElement.style.setProperty('--bg', theme.bg);
        document.documentElement.style.setProperty('--accent', theme.accent);
      }

      // Mark onboarding complete
      localStorage.setItem('moca_onboarding_done', 'true');

      onComplete();
    } catch (e) {
      console.error('Save failed:', e);
    }
    setSaving(false);
  }

  function toggleStore(key) {
    setExcludedStores(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  const totalSteps = 4;

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        <div className="onboarding-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(step / totalSteps) * 100}%` }} />
          </div>
          <span className="progress-text">Schritt {step} von {totalSteps}</span>
        </div>

        {/* STEP 1: Welcome + Theme */}
        {step === 1 && (
          <div className="onboarding-step">
            <div className="step-header">
              <div className="step-icon">🍳</div>
              <h1>Willkommen bei MOCA</h1>
              <p>Dein persönliches Rezeptbuch – erstelle dein Setup.</p>
            </div>
            <div className="theme-grid">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={`theme-swatch ${selectedTheme === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedTheme(t.id)}
                  title={t.name}
                >
                  <div className="swatch-color" style={{ background: t.primary }} />
                  <span className="swatch-name">{t.name}</span>
                </button>
              ))}
            </div>
            <div className="step-actions">
              <button className="btn btn-primary" onClick={() => setStep(2)}>
                Weiter →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: LLM Provider */}
        {step === 2 && (
          <div className="onboarding-step">
            <div className="step-header">
              <div className="step-icon">🤖</div>
              <h1>KI-Provider wählen</h1>
              <p>Wer extrahiert Rezepte aus TikTok & Instagram?</p>
            </div>
            <div className="provider-list">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  className={`provider-option ${provider === p.id ? 'active' : ''}`}
                  onClick={() => setProvider(p.id)}
                >
                  <span className="provider-icon">{p.icon}</span>
                  <div className="provider-info">
                    <span className="provider-name">{p.name}</span>
                    <span className="provider-desc">{p.desc}</span>
                  </div>
                  {provider === p.id && <span className="check">✓</span>}
                </button>
              ))}
            </div>
            <div className="provider-config">
              {provider !== 'ollama' && (
                <div className="config-field">
                  <label>API Key:</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={provider === 'openrouter' ? 'sk-or-v1-...' : provider === 'openai' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : 'API Key'}
                  />
                </div>
              )}
              {provider === 'custom' && (
                <>
                  <div className="config-field">
                    <label>Endpoint URL:</label>
                    <input
                      type="url"
                      value={customEndpoint}
                      onChange={e => setCustomEndpoint(e.target.value)}
                      placeholder="http://localhost:11434/v1/chat/completions"
                    />
                  </div>
                  <div className="config-field">
                    <label>Modell:</label>
                    <input
                      type="text"
                      value={customModel}
                      onChange={e => setCustomModel(e.target.value)}
                      placeholder="Modellname"
                    />
                  </div>
                </>
              )}
              <button
                className="btn btn-secondary test-btn"
                onClick={testConnection}
                disabled={testLoading || (provider !== 'ollama' && provider !== 'custom' && !apiKey) || (provider === 'custom' && !customEndpoint)}
              >
                {testLoading ? '⏳ Teste...' : '🔗 Verbindung testen'}
              </button>
              {testResult && (
                <div className={`test-result ${testResult.type}`}>{testResult.msg}</div>
              )}
            </div>
            <div className="step-actions">
              <button className="btn btn-secondary" onClick={() => setStep(1)}>← Zurück</button>
              <button className="btn btn-primary" onClick={() => setStep(3)}>Weiter →</button>
            </div>
          </div>
        )}

        {/* STEP 3: PLZ + Stores */}
        {step === 3 && (
          <div className="onboarding-step">
            <div className="step-header">
              <div className="step-icon">📦</div>
              <h1>Angebots-Scraper</h1>
              <p>Finde aktuelle Preise für deine Zutaten.</p>
            </div>
            <div className="config-field">
              <label>Deine Postleitzahl:</label>
              <input
                type="text"
                value={plz}
                onChange={e => setPlz(e.target.value)}
                placeholder="z.B. 80331"
                maxLength={5}
              />
            </div>
            <div className="stores-section">
              <label>Läden (welche interessieren dich?):</label>
              <div className="stores-grid">
                {OFF_STORES.map(s => (
                  <label key={s.key} className={`store-toggle ${excludedStores.includes(s.key) ? 'excluded' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!excludedStores.includes(s.key)}
                      onChange={() => toggleStore(s.key)}
                    />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="step-actions">
              <button className="btn btn-secondary" onClick={() => setStep(2)}>← Zurück</button>
              <button className="btn btn-primary" onClick={() => setStep(4)}>Weiter →</button>
            </div>
          </div>
        )}

        {/* STEP 4: Done */}
        {step === 4 && (
          <div className="onboarding-step">
            <div className="step-header">
              <div className="step-icon">🎉</div>
              <h1>Fast fertig!</h1>
              <p>Dein MOCA ist startklar. Noch ein Klick und du kannst loslegen.</p>
            </div>
            <div className="summary">
              <div className="summary-row">
                <span>🍳 Theme</span>
                <span>{THEMES.find(t => t.id === selectedTheme)?.name}</span>
              </div>
              <div className="summary-row">
                <span>🤖 KI-Provider</span>
                <span>{PROVIDERS.find(p => p.id === provider)?.name?.replace(/^[^\s]+\s/, '')}</span>
              </div>
              <div className="summary-row">
                <span>📍 PLZ</span>
                <span>{plz || 'Nicht gesetzt'}</span>
              </div>
              <div className="summary-row">
                <span>🛒 Läden</span>
                <span>{OFF_STORES.length - excludedStores.length} aktiv</span>
              </div>
            </div>
            <div className="step-actions">
              <button className="btn btn-secondary" onClick={() => setStep(3)}>← Zurück</button>
              <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
                {saving ? '⏳ Speichern...' : '✅ MOCA starten'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}