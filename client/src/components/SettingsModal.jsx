import { useState, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { getThemeList } from '../config/themes.js';


const PROVIDER_TYPES = [
  { id: 'ollama',     name: 'Ollama (Lokal)',  icon: '🖥️', desc: 'Lokal, kostenlos, privat',    needsKey: false, isLocal: true,  defaultEndpoint: 'http://localhost:11434',              defaultModel: 'llama3.2:1b' },
  { id: 'openrouter', name: 'OpenRouter',     icon: '🌐', desc: '100+ Modelle, API-Key',       needsKey: true,  isLocal: false, defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'openai/gpt-4o-mini' },
  { id: 'openai',     name: 'OpenAI',          icon: '🤖', desc: 'GPT-4o, GPT-4o-mini',          needsKey: true,  isLocal: false, defaultEndpoint: 'https://api.openai.com/v1/chat/completions',   defaultModel: 'gpt-4o-mini' },
  { id: 'anthropic',  name: 'Anthropic',       icon: '🧠', desc: 'Claude Sonnet, Opus',          needsKey: true,  isLocal: false, defaultEndpoint: 'https://api.anthropic.com/v1/messages',         defaultModel: 'claude-sonnet-4-20250514' },
  { id: 'gemini',     name: 'Google Gemini',   icon: '✨', desc: 'Gemini Flash, Pro',           needsKey: true,  isLocal: false, defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', defaultModel: 'gemini-2.0-flash' },
  { id: 'minimax',    name: 'MiniMax',         icon: '🌏', desc: 'MiniMax Text-01',              needsKey: true,  isLocal: false, defaultEndpoint: 'https://api.minimax.chat/v1/chat/completions', defaultModel: 'MiniMax-Text-01' },
  { id: 'custom',      name: 'Custom Endpoint',icon: '⚙️', desc: 'Beliebig, OpenAI-kompatibel', needsKey: false, isLocal: true,  defaultEndpoint: '',                                              defaultModel: '' },
];

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
  const [llmConfig, setLlmConfig] = useState({ provider: 'ollama', configuredProviders: {} });
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showEditProvider, setShowEditProvider] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);
  const [editForm, setEditForm] = useState({ apiKey: '', endpoint: '', model: '' });
  const [newProvider, setNewProvider] = useState({ type: '', label: '', apiKey: '', endpoint: '', model: '', hasKey: false, isLocal: false });
  const [saving, setSaving] = useState(false);

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
        .then(data => {
          const configured = {};
          const info = {
            ollama:     { icon: '🖥️', label: 'Ollama (Lokal)', isLocal: true,  needsKey: false },
            openrouter: { icon: '🌐', label: 'OpenRouter',     isLocal: false, needsKey: true  },
            openai:     { icon: '🤖', label: 'OpenAI',          isLocal: false, needsKey: true  },
            anthropic:  { icon: '🧠', label: 'Anthropic',       isLocal: false, needsKey: true  },
            gemini:     { icon: '✨', label: 'Google Gemini',   isLocal: false, needsKey: true  },
            minimax:    { icon: '🌏', label: 'MiniMax',         isLocal: false, needsKey: true  },
            custom:     { icon: '⚙️', label: 'Custom Endpoint',isLocal: true,  needsKey: false },
          };
          for (const [key, inf] of Object.entries(info)) {
            const cfg = data[key];
            if (cfg && (cfg.apiKey || cfg.endpoint || cfg.model)) {
              configured[key] = { ...cfg, label: inf.label, icon: inf.icon, isLocal: inf.isLocal, hasKey: inf.needsKey && !!cfg.apiKey };
            }
          }
          setLlmConfig({ provider: data.provider || 'ollama', configuredProviders: configured });
        })
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
    setSaving(true);
    try {
      const flat = { provider: llmConfig.provider };
      for (const [key, p] of Object.entries(llmConfig.configuredProviders || {})) {
        flat[key] = { apiKey: p.apiKey || '', endpoint: p.endpoint || '', model: p.model || '' };
      }
      const res = await fetch('/recipe/api/settings/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(flat)
      });
      const data = await res.json();
      if (data.success) {
        setLlmTestResult({ type: 'success', msg: '✓ KI-Einstellungen gespeichert!' });
      } else {
        setLlmTestResult({ type: 'error', msg: '✗ ' + (data.error || 'Fehler beim Speichern') });
      }
    } catch (e) {
      setLlmTestResult({ type: 'error', msg: '✗ ' + e.message });
    }
    setSaving(false);
    setTimeout(() => setLlmTestResult(null), 4000);
  }

  function doAddProvider() {
    const t = newProvider.type;
    const info = PROVIDER_TYPES.find(x => x.id === t) || {};
    const p = {
      label: newProvider.label || info.name || t,
      icon: newProvider.icon || info.icon || '🤖',
      apiKey: newProvider.apiKey || '',
      endpoint: newProvider.endpoint || info.defaultEndpoint || '',
      model: newProvider.model || info.defaultModel || '',
      hasKey: info.needsKey || false,
      isLocal: info.isLocal || false,
    };
    setLlmConfig(prev => ({
      ...prev,
      configuredProviders: { ...prev.configuredProviders, [t]: p },
      provider: prev.provider || t,
    }));
    setShowAddProvider(false);
    setNewProvider({ type: '', label: '', apiKey: '', endpoint: '', model: '', hasKey: false, isLocal: false });
  }

  function openProviderEditor(key) {
    const p = llmConfig.configuredProviders[key];
    setEditingProvider(p);
    setEditForm({ apiKey: '', endpoint: p.endpoint || '', model: p.model || '' });
    setShowEditProvider(true);
  }

  function doSaveProviderEdit() {
    if (!editingProvider) return;
    const key = Object.keys(llmConfig.configuredProviders).find(k => llmConfig.configuredProviders[k] === editingProvider);
    if (!key) return;
    setLlmConfig(prev => ({
      ...prev,
      configuredProviders: {
        ...prev.configuredProviders,
        [key]: { ...prev.configuredProviders[key], endpoint: editForm.endpoint, model: editForm.model, apiKey: editForm.apiKey || prev.configuredProviders[key].apiKey }
      }
    }));
    setShowEditProvider(false);
  }

  function removeProvider(key) {
    const name = llmConfig.configuredProviders[key]?.label || key;
    if (!window.confirm(`Provider "${name}" wirklich entfernen?`)) return;
    const updated = { ...llmConfig.configuredProviders };
    delete updated[key];
    setLlmConfig({ ...llmConfig, configuredProviders: updated, provider: llmConfig.provider === key ? (Object.keys(updated)[0] || 'ollama') : llmConfig.provider });
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
          <button className="modal-close" onClick={onClose} aria-label="Einstellungen schließen">×</button>
        </div>
        
        <div className="settings-tabs" role="tablist" aria-label="Einstellungs-Kategorien">
          <button className={`tab-btn ${activeTab === 'theme' ? 'active' : ''}`} onClick={() => setActiveTab('theme')} role="tab" aria-selected={activeTab === 'theme'}>🎨 Theme</button>
          <button className={`tab-btn ${activeTab === 'location' ? 'active' : ''}`} onClick={() => setActiveTab('location')} role="tab" aria-selected={activeTab === 'location'}>📍 Standort</button>
          <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')} role="tab" aria-selected={activeTab === 'ai'}>🤖 KI</button>
          <button className={`tab-btn ${activeTab === 'eigenmarken' ? 'active' : ''}`} onClick={() => setActiveTab('eigenmarken')} role="tab" aria-selected={activeTab === 'eigenmarken'}>🏷️ Eigenmarken</button>
          <button className={`tab-btn ${activeTab === 'stores' ? 'active' : ''}`} onClick={() => setActiveTab('stores')} role="tab" aria-selected={activeTab === 'stores'}>🛒 Stores</button>
          <button className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`} onClick={() => setActiveTab('about')} role="tab" aria-selected={activeTab === 'about'}>ℹ️ Über</button>
        </div>
        
        <div className="settings-content">
          {activeTab === 'theme' && (
            <div className="theme-settings">
              <p className="settings-description">Wähle ein Design-Theme für dein MOCA.</p>
              <div className="theme-swatches" role="radiogroup" aria-label="Theme auswählen">
                {themes.map(theme => (
                  <button
                    key={theme.id}
                    className={`theme-swatch ${currentTheme === theme.id ? 'active' : ''}`}
                    onClick={() => handleThemeSelect(theme.id)}
                    title={theme.name}
                    role="radio"
                    aria-checked={currentTheme === theme.id}
                    aria-label={`Theme: ${theme.name}`}
                  >
                    <div className="swatch-color" style={{background: theme.colors?.['--color-accent'] || theme.colors?.['--color-brown'] || '#888'}} />
                    {currentTheme === theme.id && <span className="swatch-check">✓</span>}
                  </button>
                ))}
              </div>
              <p className="theme-name-display">Aktuelles Theme: <strong>{themes.find(t => t.id === currentTheme)?.name || currentTheme}</strong></p>
              
              {/* Dark Mode Toggle */}
              <div className="dark-mode-section" style={{marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)'}}>
                <h4 style={{margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--color-text-light)'}}>🌓 Farbmodus</h4>
                <div className="dark-mode-toggle" role="radiogroup" aria-label="Farbmodus" style={{display: 'flex', gap: '0.5rem'}}>
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
                      role="radio"
                      aria-checked={colorMode === opt.value}
                      aria-label={opt.desc}
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
                Verwalte deine LLM-Provider für Rezept-Extraktion und andere KI-Funktionen.
                Der primäre Anbieter wird zuerst verwendet — Fallbacks automatisch bei Ausfällen.
              </p>

              {/* Provider Table */}
              {Object.keys(llmConfig.configuredProviders || {}).length > 0 ? (
                <div className="ai-provider-table-wrap">
                  <table className="ai-provider-table">
                    <thead>
                      <tr>
                        <th style={{width:'40px'}}>Primär</th>
                        <th>Provider</th>
                        <th>Modell</th>
                        <th>Endpoint / Status</th>
                        <th style={{width:'70px'}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(llmConfig.configuredProviders || {}).map(([key, p]) => (
                        <tr key={key} className={llmConfig.provider === key ? 'row-primary' : ''}>
                          <td style={{textAlign:'center'}}>
                            <input
                              type="radio"
                              name="primaryProvider"
                              checked={llmConfig.provider === key}
                              onChange={() => setLlmConfig({ ...llmConfig, provider: key })}
                              title="Als primären Provider setzen"
                              aria-label={`${p.label || key} als primären Provider setzen`}
                            />
                          </td>
                          <td>
                            <span className="provider-badge">{p.icon || '🤖'} {p.label || key}</span>
                            {p.isLocal && <span className="provider-local-tag">lokal</span>}
                          </td>
                          <td>
                            <span style={{fontFamily:'monospace', fontSize:'0.8rem'}}>{p.model || <span className="text-muted">—</span>}</span>
                          </td>
                          <td>
                            {p.endpoint ? (
                              <span className="provider-endpoint" title={p.endpoint}>{p.endpoint}</span>
                            ) : p.hasKey ? (
                              <span className="provider-status-ok">✓ API Key</span>
                            ) : (
                              <span className="text-muted">nicht konfiguriert</span>
                            )}
                          </td>
                          <td>
                            <button className="btn-icon btn-edit" onClick={() => openProviderEditor(key)} title="Bearbeiten" aria-label={`Provider ${p.label || key} bearbeiten`}>✏️</button>
                            <button className="btn-icon btn-delete" onClick={() => removeProvider(key)} title="Entfernen" aria-label={`Provider ${p.label || key} entfernen`}>🗑️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ai-empty-state">
                  <span style={{fontSize:'2rem'}}>🤖</span>
                  <p>Keine Provider konfiguriert. Füge unten einen Provider hinzu.</p>
                </div>
              )}

              {/* Add Provider */}
              <div className="ai-add-provider">
                <button className="btn btn-secondary" onClick={() => { setEditingProvider(null); setNewProvider({ type: '', label: '', apiKey: '', endpoint: '', model: '', hasKey: false, isLocal: false }); setShowAddProvider(true); }}>
                  ➕ Provider hinzufügen
                </button>
              </div>

              {/* Add Provider Dialog */}
              {showAddProvider && (
                <div className="provider-editor-overlay" onClick={() => setShowAddProvider(false)}>
                  <div className="provider-editor" onClick={e => e.stopPropagation()}>
                    <div className="provider-editor-header">
                      <h3>Provider hinzufügen</h3>
                      <button className="modal-close" onClick={() => setShowAddProvider(false)} aria-label="Hinzufügen-Dialog schließen">×</button>
                    </div>
                    {!newProvider.type ? (
                      <div className="provider-type-grid">
                        {PROVIDER_TYPES.map(t => (
                          <button key={t.id} className="provider-type-btn" onClick={() => setNewProvider({ ...newProvider, type: t.id, label: t.name, icon: t.icon, hasKey: t.needsKey, isLocal: t.isLocal, endpoint: t.defaultEndpoint || '', model: t.defaultModel || '' })}>
                            <span className="pt-icon">{t.icon}</span>
                            <span className="pt-name">{t.name}</span>
                            <span className="pt-desc">{t.desc}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="provider-config-form">
                        <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem',padding:'0.5rem',background:'var(--color-sepia)',borderRadius:'var(--radius)'}}>
                          <span style={{fontSize:'1.3rem'}}>{newProvider.icon}</span>
                          <span style={{fontWeight:600}}>{newProvider.label || PROVIDER_TYPES.find(t=>t.id===newProvider.type)?.name}</span>
                          <button style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',fontSize:'0.8rem',color:'var(--color-text-light)'}} onClick={() => setNewProvider({type:'', label:'', apiKey:'', endpoint:'', model:'', hasKey:false, isLocal:false})}>ändern</button>
                        </div>
                        {newProvider.isLocal && (
                          <div className="config-field">
                            <label>Endpoint URL:</label>
                            <input type="url" value={newProvider.endpoint} onChange={e => setNewProvider({...newProvider, endpoint: e.target.value})} placeholder="http://localhost:11434" />
                          </div>
                        )}
                        {newProvider.hasKey && (
                          <div className="config-field">
                            <label>API Key:</label>
                            <input type="password" value={newProvider.apiKey} onChange={e => setNewProvider({...newProvider, apiKey: e.target.value})} placeholder={newProvider.type === 'openrouter' ? 'sk-or-v1-…' : newProvider.type === 'openai' ? 'sk-…' : 'API Key'} />
                          </div>
                        )}
                        <div className="config-field">
                          <label>Modell:</label>
                          <input type="text" value={newProvider.model} onChange={e => setNewProvider({...newProvider, model: e.target.value})} placeholder={PROVIDER_TYPES.find(t=>t.id===newProvider.type)?.defaultModel || 'Modellname'} />
                        </div>
                        <div style={{display:'flex',gap:'0.5rem',marginTop:'1rem',justifyContent:'flex-end'}}>
                          <button className="btn btn-secondary" onClick={() => setShowAddProvider(false)}>Abbrechen</button>
                          <button className="btn btn-primary" onClick={doAddProvider} disabled={!newProvider.model || (!newProvider.isLocal && newProvider.hasKey && !newProvider.apiKey)}>➕ Hinzufügen</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Edit Provider Dialog */}
              {showEditProvider && editingProvider && (
                <div className="provider-editor-overlay" onClick={() => setShowEditProvider(false)}>
                  <div className="provider-editor" onClick={e => e.stopPropagation()}>
                    <div className="provider-editor-header">
                      <h3>✏️ Provider bearbeiten</h3>
                      <button className="modal-close" onClick={() => setShowEditProvider(false)} aria-label="Bearbeiten-Dialog schließen">×</button>
                    </div>
                    <div className="provider-config-form">
                      <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem',padding:'0.5rem',background:'var(--color-sepia)',borderRadius:'var(--radius)'}}>
                        <span style={{fontSize:'1.3rem'}}>{editingProvider.icon}</span>
                        <span style={{fontWeight:600}}>{editingProvider.label}</span>
                      </div>
                      {editingProvider.isLocal && (
                        <div className="config-field">
                          <label>Endpoint URL:</label>
                          <input type="url" value={editForm.endpoint} onChange={e => setEditForm({...editForm, endpoint: e.target.value})} />
                        </div>
                      )}
                      {editingProvider.hasKey && (
                        <div className="config-field">
                          <label>API Key:</label>
                          <input type="password" value={editForm.apiKey} onChange={e => setEditForm({...editForm, apiKey: e.target.value})} placeholder="Nicht ändern wenn leer" />
                        </div>
                      )}
                      <div className="config-field">
                        <label>Modell:</label>
                        <input type="text" value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} />
                      </div>
                      <div style={{display:'flex',gap:'0.5rem',marginTop:'1rem',justifyContent:'flex-end'}}>
                        <button className="btn btn-secondary" onClick={() => setShowEditProvider(false)}>Abbrechen</button>
                        <button className="btn btn-primary" onClick={doSaveProviderEdit} disabled={!editForm.model}>💾 Speichern</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {llmTestResult && (
                <div className={`llm-test-result ${llmTestResult.type}`}>{llmTestResult.msg}</div>
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