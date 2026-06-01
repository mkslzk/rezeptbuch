import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { getThemeList } from '../config/themes.js';

export default function SettingsModal({ isOpen, onClose, settings, onSaveSettings }) {
  const { currentTheme, changeTheme } = useTheme();
  const [activeTab, setActiveTab] = useState('theme');
  const [plz, setPlz] = useState(settings?.plz || '');
  const [eigenmarken, setEigenmarken] = useState([]);
  const [newEigenmarken, setNewEigenmarken] = useState({ store: 'rewe', product_name: '', reference_price: '' });
  
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
      fetch('/recipe/recipe/api/settings/llm')
        .then(r => r.json())
        .then(data => setLlmConfig(data))
        .catch(() => {});
    }
  }, [activeTab]);

  const loadEigenmarken = () => {
    fetch('/recipe/recipe/api/offers/eigenmarken')
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
    fetch('/recipe/recipe/api/offers/eigenmarken', {
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
    fetch(`/recipe/recipe/api/offers/eigenmarken/${id}`, { method: 'DELETE' })
      .then(() => loadEigenmarken())
      .catch(() => {});
  }

  // LLM handlers
  async function handleSaveLlm() {
    try {
      const res = await fetch('/recipe/recipe/api/settings/llm', {
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
      const res = await fetch('/recipe/recipe/api/settings/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (data.success) {
        setLlmTestResult({
          type: 'success',
          msg: `✓ ${provider === 'ollama' ? `Ollama verbunden! ${data.modelCount} Modelle gefunden (${data.models?.join(', ')})` : 'MiniMax API funktioniert!'}`
        });
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
          <button className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')}>ℹ️ Über</button>
        </div>
        
        <div className="settings-content">
          {activeTab === 'theme' && (
            <div className="theme-settings">
              <p className="settings-description">Wähle ein Design-Theme für dein Rezeptbuch.</p>
              <div className="theme-swatches">
                {themes.map(theme => (
                  <button key={theme.id} className={`theme-swatch ${currentTheme === theme.id ? 'active' : ''}`} onClick={() => handleThemeSelect(theme.id)} title={theme.name}>
                    <div className="swatch-color" style={{background: theme.colors?.['--color-accent'] || theme.colors?.['--color-brown'] || '#888'}} />
                    {currentTheme === theme.id && <span className="swatch-check">✓</span>}
                  </button>
                ))}
              </div>
              <p className="theme-name-display">Aktuelles Theme: <strong>{themes.find(t => t.id === currentTheme)?.name || currentTheme}</strong></p>
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
              </p>
              
              {/* Provider Selection */}
              <div className="llm-provider-select">
                <label className="llm-provider-label">Anbieter:</label>
                <div className="llm-provider-buttons">
                  <button
                    className={`llm-provider-btn ${llmConfig.provider === 'ollama' ? 'active' : ''}`}
                    onClick={() => setLlmConfig({...llmConfig, provider: 'ollama'})}
                  >
                    🖥️ Ollama (Lokal)
                  </button>
                  <button
                    className={`llm-provider-btn ${llmConfig.provider === 'minimax' ? 'active' : ''}`}
                    onClick={() => setLlmConfig({...llmConfig, provider: 'minimax'})}
                  >
                    🌐 MiniMax (API)
                  </button>
                </div>
              </div>
              
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

          {activeTab === 'about' && (
            <div className="about-settings">
              <h3>📖 Rezeptbuch</h3>
              <p>Version 1.0.0</p>
              <p className="about-desc">Dein persönliches Rezeptbuch – digital und schön.</p>
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