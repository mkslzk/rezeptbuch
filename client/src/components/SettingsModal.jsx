import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { getThemeList } from '../config/themes.js';

export default function SettingsModal({ isOpen, onClose, settings, onSaveSettings }) {
  const { currentTheme, changeTheme, colorMode, changeColorMode, effectiveColorMode } = useTheme();
  const [activeTab, setActiveTab] = useState('theme');
  const [plz, setPlz] = useState(settings?.plz || '');
  const [eigenmarken, setEigenmarken] = useState([]);
  const [newEigenmarken, setNewEigenmarken] = useState({ store: 'rewe', product_name: '', reference_price: '' });
  
  // Store Exclusions state
  const [stores, setStores] = useState([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesSaving, setStoresSaving] = useState(false);
  const [storesStatus, setStoresStatus] = useState(null);

  // LLM Settings state
  const [llmConfig, setLlmConfig] = useState({
    provider: 'ollama',
    ollama: { endpoint: 'http://localhost:11434', model: 'llama3.2', temperature: 0.1 },
    minimax: { apiKey: '', model: 'MiniMax-Text-01', baseUrl: 'https://api.minimax.chat/v1' }
  });
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState(null);

  // Update PLZ when settings prop changes
  useEffect(() => {
    if (settings?.plz !== undefined) {
      setPlz(settings.plz);
    }
  }, [settings]);

  // Load LLM config when AI tab opens
  useEffect(() => {
    if (activeTab === 'ai') {
      fetch('/recipe/api/settings/llm')
        .then(r => r.json())
        .then(data => setLlmConfig(data))
        .catch(() => {});
    }
  }, [activeTab]);

  // Load stores when Stores tab opens
  const loadStores = () => {
    setStoresLoading(true);
    fetch('/recipe/api/settings/stores')
      .then(r => r.json())
      .then(data => {
        setStores(data.stores || []);
        setStoresStatus({ type: 'info', msg: `${data.activeCount} aktiv · ${data.excludedCount} ausgeblendet` });
      })
      .catch(err => setStoresStatus({ type: 'error', msg: 'Fehler: ' + err.message }))
      .finally(() => setStoresLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'stores') loadStores();
  }, [activeTab]);

  async function handleToggleStore(storeKey, currentlyExcluded) {
    const newExcluded = !currentlyExcluded;
    // Optimistic update
    setStores(prev => prev.map(s => s.key === storeKey ? { ...s, excluded: newExcluded } : s));
    
    const newList = stores
      .map(s => s.key === storeKey ? (newExcluded ? s.key : null) : (s.excluded ? s.key : null))
      .filter(Boolean);
    
    setStoresSaving(true);
    try {
      const res = await fetch('/recipe/api/settings/stores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedStores: newList })
      });
      const data = await res.json();
      if (data.success) {
        setStoresStatus({ 
          type: 'success', 
          msg: `${newList.length} ${newList.length === 1 ? 'Store' : 'Stores'} ausgeblendet · nächster Scrape berücksichtigt es` 
        });
      } else {
        // Rollback
        setStores(prev => prev.map(s => s.key === storeKey ? { ...s, excluded: currentlyExcluded } : s));
        setStoresStatus({ type: 'error', msg: 'Fehler beim Speichern' });
      }
    } catch (err) {
      setStores(prev => prev.map(s => s.key === storeKey ? { ...s, excluded: currentlyExcluded } : s));
      setStoresStatus({ type: 'error', msg: 'Fehler: ' + err.message });
    }
    setStoresSaving(false);
    setTimeout(() => setStoresStatus(null), 4000);
  }

  async function handleResetStores() {
    if (!window.confirm('Alle Store-Ausblendungen zurücksetzen?')) return;
    setStoresSaving(true);
    try {
      await fetch('/recipe/api/settings/stores/reset', { method: 'POST' });
      setStores(prev => prev.map(s => ({ ...s, excluded: false })));
      setStoresStatus({ type: 'success', msg: 'Alle Stores wieder aktiv' });
    } catch (err) {
      setStoresStatus({ type: 'error', msg: 'Fehler: ' + err.message });
    }
    setStoresSaving(false);
    setTimeout(() => setStoresStatus(null), 3000);
  }

  const loadEigenmarken = () => {
    fetch('/recipe/api/offers/eigenmarken')
      .then(r => r.json())
      .then(data => setEigenmarken(data.eigenmarken || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (activeTab === 'eigenmarken') loadEigenmarken();
  }, [activeTab]);
  
  if (!isOpen) return null;
  
  const themes = getThemeList();
  
  function handleThemeSelect(themeId) {
    changeTheme(themeId);
  }
  
  function handlePlzSave() {
    const cleaned = plz.replace(/\D/g, '').slice(0, 5);
    setPlz(cleaned);
    if (onSaveSettings) {
      onSaveSettings({ plz: cleaned });
    }
  }

  function handleAddEigenmarken() {
    if (!newEigenmarken.product_name || !newEigenmarken.reference_price) return;
    fetch('/recipe/api/offers/eigenmarken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store: newEigenmarken.store,
        product_name: newEigenmarken.product_name,
        reference_price: parseFloat(newEigenmarken.reference_price)
      })
    }).then(r => r.json()).then(() => {
      setNewEigenmarken({ store: 'rewe', product_name: '', reference_price: '' });
      loadEigenmarken();
    }).catch(() => {});
  }

  function handleDeleteEigenmarken(id) {
    fetch(`/recipe/api/offers/eigenmarken/${id}`, { method: 'DELETE' })
      .then(() => loadEigenmarken())
      .catch(() => {});
  }

  // LLM handlers
  async function handleSaveLlm() {
    try {
      const res = await fetch('/recipe/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmConfig)
      });
      const data = await res.json();
      if (data.success) {
        setLlmTestResult({ type: 'success', msg: '✓ Konfiguration gespeichert' });
      }
    } catch (e) {
      setLlmTestResult({ type: 'error', msg: 'Fehler: ' + e.message });
    }
  }

  async function handleTestLlm(provider) {
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const res = await fetch('/recipe/api/settings/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (data.success) {
        const msg = data.response
          ? `✓ ${provider} funktioniert! Response: ${data.response}`
          : (data.modelCount !== undefined
            ? `✓ ${provider} verbunden! ${data.modelCount} Modelle (${(data.models || []).slice(0, 5).join(', ')})`
            : `✓ ${provider} funktioniert!`);
        setLlmTestResult({ type: 'success', msg });
      } else {
        setLlmTestResult({ type: 'error', msg: '✗ ' + (data.error || 'Connection failed') });
      }
    } catch (e) {
      setLlmTestResult({ type: 'error', msg: '✗ ' + e.message });
    }
    setLlmTesting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ Einstellungen</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-tabs">
          <button className={`tab-btn ${activeTab === 'theme' ? 'active' : ''}`} onClick={() => setActiveTab('theme')}>🎨 Theme</button>
          <button className={`tab-btn ${activeTab === 'location' ? 'active' : ''}`} onClick={() => setActiveTab('location')}>📍 Standort</button>
          <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>🤖 KI</button>
          <button className={`tab-btn ${activeTab === 'eigenmarken' ? 'active' : ''}`} onClick={() => setActiveTab('eigenmarken')}>🏷️ Eigenmarken</button>
          <button className={`tab-btn ${activeTab === 'stores' ? 'active' : ''}`} onClick={() => setActiveTab('stores')}>🛒 Stores</button>
          <button className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>ℹ️ Über</button>
        </div>
        
        <div className="settings-content">
          {activeTab === 'theme' && (
            <div className="theme-settings">
              <p className="settings-description">Wähle ein Design-Theme für dein MOCA.</p>
              <div className="theme-swatches">
                {themes.map(theme => (
                  <button key={theme.id} className={`theme-swatch ${currentTheme === theme.id ? 'active' : ''}`} onClick={() => handleThemeSelect(theme.id)} title={theme.name}>
                    <div className="swatch-color" style={{background: theme.colors?.['--color-accent'] || theme.colors?.['--color-brown'] || '#888'}} />
                    {currentTheme === theme.id && <span className="swatch-check">✓</span>}
                  </button>
                ))}
              </div>
              <p className="theme-name-display">Aktuelles Theme: <strong>{themes.find(t => t.id === currentTheme)?.name || currentTheme}</strong></p>
              
              {/* Dark Mode Toggle */}
              <div className="dark-mode-section" style={{marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)'}}>
                <h4 style={{margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--color-text-light)'}}>🌓 Farbmodus</h4>
                <div className="dark-mode-toggle" style={{display: 'flex', gap: '0.5rem'}}>
                  {[
                    { value: 'light', label: '☀️ Hell', desc: 'Immer hell' },
                    { value: 'system', label: '🔄 Auto', desc: 'Folgt System' },
                    { value: 'dark', label: '🌙 Dunkel', desc: 'Immer dunkel' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      className={`dark-mode-btn ${colorMode === opt.value ? 'active' : ''}`}
                      onClick={() => changeColorMode(opt.value)}
                      title={opt.desc}
                      style={{
                        flex: 1,
                        padding: '0.6rem 0.8rem',
                        borderRadius: 'var(--radius)',
                        border: colorMode === opt.value ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                        background: colorMode === opt.value ? 'var(--color-accent-light)' : 'var(--color-paper)',
                        color: colorMode === opt.value ? 'var(--color-brown-dark)' : 'var(--color-text)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: colorMode === opt.value ? '600' : '400',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p style={{margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--color-text-light)'}}>
                  {effectiveColorMode === 'dark' ? '🌙 Dunkelmodus aktiv' : '☀️ Hellmodus aktiv'}
                  {colorMode === 'system' && ' (Systemeinstellung)'}
                </p>
              </div>
            </div>
          )}
          
          {activeTab === 'location' && (
            <div className="location-settings">
              <p className="settings-description">Deine Postleitzahl für standortspezifische Angebote.</p>
              <div className="plz-input-group">
                <label htmlFor="plz-input">Postleitzahl</label>
                <div className="plz-input-row">
                  <input id="plz-input" type="text" value={plz} onChange={e => setPlz(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="80331" maxLength={5} className="plz-input" />
                  <button className="plz-save-btn" onClick={handlePlzSave} disabled={plz.length !== 5}>Speichern</button>
                </div>
                {plz.length === 5 && <span className="plz-hint">✓ PLZ gespeichert</span>}
              </div>
            </div>
          )}
          
          {activeTab === 'ai' && (
            <div className="ai-settings">
              <p className="settings-description">
                Wähle, welches LLM du für Rezept-Extraktion und andere KI-Funktionen verwenden möchtest.
                Alle Anbieter nutzen das OpenAI-kompatible Format.
              </p>

              {/* Provider Dropdown */}
              <div className="llm-field">
                <label>Anbieter:</label>
                <select
                  value={llmConfig.provider || 'ollama'}
                  onChange={e => setLlmConfig({ ...llmConfig, provider: e.target.value })}
                  className="llm-provider-select"
                >
                  <option value="ollama">🖥️ Ollama (Lokal)</option>
                  <option value="openrouter">🌐 OpenRouter</option>
                  <option value="openai">🤖 OpenAI</option>
                  <option value="anthropic">🧠 Anthropic</option>
                  <option value="gemini">✨ Google Gemini</option>
                  <option value="minimax">🌏 MiniMax</option>
                  <option value="custom">⚙️ Custom Endpoint</option>
                </select>
              </div>

              {/* Ollama Config */}
              {llmConfig.provider === 'ollama' && (
                <div className="llm-config-section">
                  <h4>🖥️ Ollama (Lokal)</h4>
                  <p className="llm-hint">Ollama muss auf deinem Rechner laufen. <a href="https://ollama.com" target="_blank" rel="noopener">Download →</a></p>
                  <div className="llm-field">
                    <label>Endpoint:</label>
                    <input type="url" value={llmConfig.ollama?.endpoint || 'http://localhost:11434'} onChange={e => setLlmConfig({ ...llmConfig, ollama: { ...llmConfig.ollama, endpoint: e.target.value } })} placeholder="http://localhost:11434" />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.ollama?.model || 'llama3.2'} onChange={e => setLlmConfig({ ...llmConfig, ollama: { ...llmConfig.ollama, model: e.target.value } })} placeholder="llama3.2" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('ollama')} disabled={llmTesting}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}

              {/* OpenRouter Config */}
              {llmConfig.provider === 'openrouter' && (
                <div className="llm-config-section">
                  <h4>🌐 OpenRouter</h4>
                  <p className="llm-hint"><a href="https://openrouter.ai/keys" target="_blank" rel="noopener">API Key holen →</a> – Zugriff auf viele Modelle über eine API.</p>
                  <div className="llm-field">
                    <label>API Key:</label>
                    <input type="password" value={llmConfig.openrouter?.apiKey || ''} onChange={e => setLlmConfig({ ...llmConfig, openrouter: { ...llmConfig.openrouter, apiKey: e.target.value } })} placeholder="sk-or-v1-..." />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.openrouter?.model || 'openai/gpt-4o-mini'} onChange={e => setLlmConfig({ ...llmConfig, openrouter: { ...llmConfig.openrouter, model: e.target.value } })} placeholder="openai/gpt-4o-mini" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('openrouter')} disabled={llmTesting || !llmConfig.openrouter?.apiKey}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}

              {/* OpenAI Config */}
              {llmConfig.provider === 'openai' && (
                <div className="llm-config-section">
                  <h4>🤖 OpenAI</h4>
                  <p className="llm-hint"><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">API Key holen →</a></p>
                  <div className="llm-field">
                    <label>API Key:</label>
                    <input type="password" value={llmConfig.openai?.apiKey || ''} onChange={e => setLlmConfig({ ...llmConfig, openai: { ...llmConfig.openai, apiKey: e.target.value } })} placeholder="sk-..." />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.openai?.model || 'gpt-4o-mini'} onChange={e => setLlmConfig({ ...llmConfig, openai: { ...llmConfig.openai, model: e.target.value } })} placeholder="gpt-4o-mini" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('openai')} disabled={llmTesting || !llmConfig.openai?.apiKey}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}

              {/* Anthropic Config */}
              {llmConfig.provider === 'anthropic' && (
                <div className="llm-config-section">
                  <h4>🧠 Anthropic (Claude)</h4>
                  <p className="llm-hint"><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">API Key holen →</a></p>
                  <div className="llm-field">
                    <label>API Key:</label>
                    <input type="password" value={llmConfig.anthropic?.apiKey || ''} onChange={e => setLlmConfig({ ...llmConfig, anthropic: { ...llmConfig.anthropic, apiKey: e.target.value } })} placeholder="sk-ant-..." />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.anthropic?.model || 'claude-sonnet-4-20250514'} onChange={e => setLlmConfig({ ...llmConfig, anthropic: { ...llmConfig.anthropic, model: e.target.value } })} placeholder="claude-sonnet-4-20250514" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('anthropic')} disabled={llmTesting || !llmConfig.anthropic?.apiKey}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}

              {/* Gemini Config */}
              {llmConfig.provider === 'gemini' && (
                <div className="llm-config-section">
                  <h4>✨ Google Gemini</h4>
                  <p className="llm-hint"><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">API Key holen →</a></p>
                  <div className="llm-field">
                    <label>API Key:</label>
                    <input type="password" value={llmConfig.gemini?.apiKey || ''} onChange={e => setLlmConfig({ ...llmConfig, gemini: { ...llmConfig.gemini, apiKey: e.target.value } })} placeholder="AIza..." />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.gemini?.model || 'gemini-2.0-flash'} onChange={e => setLlmConfig({ ...llmConfig, gemini: { ...llmConfig.gemini, model: e.target.value } })} placeholder="gemini-2.0-flash" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('gemini')} disabled={llmTesting || !llmConfig.gemini?.apiKey}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}

              {/* MiniMax Config */}
              {llmConfig.provider === 'minimax' && (
                <div className="llm-config-section">
                  <h4>🌏 MiniMax API</h4>
                  <p className="llm-hint"><a href="https://platform.minimax.io" target="_blank" rel="noopener">API Key holen →</a></p>
                  <div className="llm-field">
                    <label>API Key:</label>
                    <input type="password" value={llmConfig.minimax?.apiKey || ''} onChange={e => setLlmConfig({ ...llmConfig, minimax: { ...llmConfig.minimax, apiKey: e.target.value } })} placeholder="Dein MiniMax API Key" />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.minimax?.model || 'MiniMax-Text-01'} onChange={e => setLlmConfig({ ...llmConfig, minimax: { ...llmConfig.minimax, model: e.target.value } })} placeholder="MiniMax-Text-01" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('minimax')} disabled={llmTesting || !llmConfig.minimax?.apiKey}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}

              {/* Custom Config */}
              {llmConfig.provider === 'custom' && (
                <div className="llm-config-section">
                  <h4>⚙️ Custom Endpoint</h4>
                  <p className="llm-hint">Trage einen beliebigen OpenAI-kompatiblen Endpunkt ein (z.B. LocalAI, LM Studio, ollama remote).</p>
                  <div className="llm-field">
                    <label>Endpoint URL:</label>
                    <input type="url" value={llmConfig.custom?.endpoint || ''} onChange={e => setLlmConfig({ ...llmConfig, custom: { ...llmConfig.custom, endpoint: e.target.value } })} placeholder="http://localhost:11434/v1/chat/completions" />
                  </div>
                  <div className="llm-field">
                    <label>API Key (optional):</label>
                    <input type="password" value={llmConfig.custom?.apiKey || ''} onChange={e => setLlmConfig({ ...llmConfig, custom: { ...llmConfig.custom, apiKey: e.target.value } })} placeholder="Leer für lokale Endpunkte" />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input type="text" value={llmConfig.custom?.model || ''} onChange={e => setLlmConfig({ ...llmConfig, custom: { ...llmConfig.custom, model: e.target.value } })} placeholder="Modellname" />
                  </div>
                  <button className="btn btn-secondary" onClick={() => handleTestLlm('custom')} disabled={llmTesting || !llmConfig.custom?.endpoint}>{llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}</button>
                </div>
              )}
              
              {/* Ollama Config */}
              {llmConfig.provider === 'ollama' && (
                <div className="llm-config-section">
                  <h4>🖥️ Ollama (Lokal)</h4>
                  <p className="llm-hint">Ollama muss auf deinem Rechner laufen. <a href="https://ollama.com" target="_blank" rel="noopener">Download →</a></p>
                  <div className="llm-field">
                    <label>Endpoint:</label>
                    <input
                      type="url"
                      value={llmConfig.ollama?.endpoint || 'http://localhost:11434'}
                      onChange={e => setLlmConfig({...llmConfig, ollama: {...llmConfig.ollama, endpoint: e.target.value}})}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input
                      type="text"
                      value={llmConfig.ollama?.model || 'llama3.2'}
                      onChange={e => setLlmConfig({...llmConfig, ollama: {...llmConfig.ollama, model: e.target.value}})}
                      placeholder="llama3.2"
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTestLlm('ollama')}
                    disabled={llmTesting}
                  >
                    {llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}
                  </button>
                </div>
              )}
              
              {/* MiniMax Config */}
              {llmConfig.provider === 'minimax' && (
                <div className="llm-config-section">
                  <h4>🌐 MiniMax API</h4>
                  <p className="llm-hint">Du brauchst einen MiniMax API Key. <a href="https://platform.minimax.io" target="_blank" rel="noopener">API Key holen →</a></p>
                  <div className="llm-field">
                    <label>API Key:</label>
                    <input
                      type="password"
                      value={llmConfig.minimax?.apiKey || ''}
                      onChange={e => setLlmConfig({...llmConfig, minimax: {...llmConfig.minimax, apiKey: e.target.value}})}
                      placeholder="Dein MiniMax API Key"
                    />
                  </div>
                  <div className="llm-field">
                    <label>Modell:</label>
                    <input
                      type="text"
                      value={llmConfig.minimax?.model || 'MiniMax-Text-01'}
                      onChange={e => setLlmConfig({...llmConfig, minimax: {...llmConfig.minimax, model: e.target.value}})}
                      placeholder="MiniMax-Text-01"
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleTestLlm('minimax')}
                    disabled={llmTesting || !llmConfig.minimax?.apiKey}
                  >
                    {llmTesting ? '⏳ Teste...' : '🔗 Verbindung testen'}
                  </button>
                </div>
              )}
              
              {/* Test Result */}
              {llmTestResult && (
                <div className={`llm-test-result ${llmTestResult.type}`}>
                  {llmTestResult.msg}
                </div>
              )}
              
              <div className="llm-actions">
                <button className="btn btn-primary" onClick={handleSaveLlm}>💾 Konfiguration speichern</button>
              </div>
              
              <div className="llm-info">
                <h4>📋 Verwendungszweck</h4>
                <ul>
                  <li>🤖 Rezept-Extraktion aus TikTok/Instagram Videos</li>
                  <li>🔗 URL-Analyse beim Rezept-Import</li>
                  <li>🔍 Semantisches Matching von Zutaten</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'eigenmarken' && (
            <div className="eigenmarken-settings">
              <p className="settings-description">Referenzpreise für Eigenmarken-Produkte.</p>
              <div className="eigenmarken-add-form">
                <h4>➕ Neuen Referenzpreis</h4>
                <div className="eigenmarken-form-row">
                  <select value={newEigenmarken.store} onChange={e => setNewEigenmarken({...newEigenmarken, store: e.target.value})} className="eigenmarken-store-select">
                    <option value="rewe">REWE</option><option value="lidl">LIDL</option><option value="kaufland">KAUFLAND</option>
                    <option value="penny">PENNY</option><option value="netto">NETTO</option><option value="aldi">ALDI</option><option value="norma">NORMA</option>
                  </select>
                  <input type="text" placeholder="Produktname" value={newEigenmarken.product_name} onChange={e => setNewEigenmarken({...newEigenmarken, product_name: e.target.value})} className="eigenmarken-name-input" />
                  <input type="number" step="0.01" placeholder="€" value={newEigenmarken.reference_price} onChange={e => setNewEigenmarken({...newEigenmarken, reference_price: e.target.value})} className="eigenmarken-price-input" />
                  <button className="btn btn-primary" onClick={handleAddEigenmarken} disabled={!newEigenmarken.product_name || !newEigenmarken.reference_price}>Speichern</button>
                </div>
              </div>
              <div className="eigenmarken-list">
                <h4>📋 Gespeicherte Referenzpreise ({eigenmarken.length})</h4>
                {eigenmarken.length === 0 ? <p className="empty-text">Keine Referenzpreise gespeichert</p> : (
                  <div className="eigenmarken-grid">
                    {eigenmarken.map(em => (
                      <div key={em.id} className="eigenmarken-card">
                        <div className="eigenmarken-card-header">
                          <span className="eigenmarken-store">{em.store.toUpperCase()}</span>
                          <button className="btn-remove" onClick={() => handleDeleteEigenmarken(em.id)}>×</button>
                        </div>
                        <div className="eigenmarken-product">{em.product_name}</div>
                        <div className="eigenmarken-price">€{em.reference_price.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'stores' && (
            <div className="stores-settings">
              <p className="settings-description">
                Wähle aus, welche Stores beim Angebote-Scrape ignoriert werden sollen. 
                Nützlich wenn du z.B. nie bei ALDI einkaufst oder ein Store technisch nicht funktioniert.
              </p>

              {storesStatus && (
                <div className={`status-message ${storesStatus.type}`} style={{ marginBottom: '1rem' }}>
                  {storesStatus.msg}
                </div>
              )}

              {storesLoading ? (
                <div className="stores-loading">⏳ Lade Stores...</div>
              ) : (
                <>
                  <div className="stores-grid">
                    {stores.map(s => (
                      <label key={s.key} className={`store-toggle ${s.excluded ? 'excluded' : ''}`}>
                        <input
                          type="checkbox"
                          checked={!s.excluded}
                          disabled={storesSaving}
                          onChange={() => handleToggleStore(s.key, s.excluded)}
                        />
                        <span className="store-toggle-label">
                          <span className="store-name">{s.label}</span>
                          <span className="store-key">{s.key}</span>
                        </span>
                        <span className="store-toggle-status">
                          {s.excluded ? '⏭️ aus' : '✓ aktiv'}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="stores-actions">
                    <button 
                      className="btn btn-secondary"
                      onClick={handleResetStores}
                      disabled={storesSaving || !stores.some(s => s.excluded)}
                    >
                      ↻ Alle zurücksetzen
                    </button>
                    <span className="stores-hint">
                      💡 Beim nächsten Scrape werden ausgeblendete Stores übersprungen
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="about-settings">
              <h3>📖 MOCA</h3>
              <p>Version 1.0.0</p>
              <p className="about-desc">Dein persönliches MOCA – digital und schön.</p>
              <div className="about-tech">
                <span>React + Vite</span><span>Express.js</span><span>SQLite</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}