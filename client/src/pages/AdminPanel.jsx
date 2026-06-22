import { useState, useEffect, useCallback } from 'react';
import './AdminPanel.css';

const API_BASE = '/recipe/api/offers/off-update';
const API_OFFERS = '/recipe/api/offers';

const STORE_LABELS = {
  'aldi': 'ALDI', 'lidl': 'LIDL', 'penny': 'PENNY', 'rewe': 'REWE',
  'edeka': 'EDEKA', 'netto': 'NETTO', 'netto-marken-discount': 'Netto Marken-Discount',
  'kaufland': 'KAUFLAND', 'nahkauf': 'Nahkauf', 'toom': 'Toom', 'hornbach': 'Hornbach',
  'obi': 'OBI', 'hellweg': 'Hellweg', 'xxx l': 'XXXLutz', 'norma': 'NORMA',
  'opti-megastore': 'Opti Megastore', 'opti-wohnwelt': 'Opti Wohnwelt',
  'sb-moebel-boss': 'SB-Möbel Boss', 'moebel-inhofer': 'Möbel Inhofer',
  'kabs': 'KABS', 'edeka-foodservice-handelshof': 'EDEKA Foodservice'
};

const STORE_EMOJI = {
  'aldi': '🇦🇱', 'lidl': '🇱🇮', 'penny': '💰', 'rewe': '🔴', 'edeka': '🟢',
  'netto': '🔵', 'netto-marken-discount': '💙', 'kaufland': '🟠', 'nahkauf': '🏪',
  'toom': '🛒', 'hornbach': '🔩', 'obi': '🔨', 'hellweg': '💡', 'xxx l': '🏠',
  'norma': '📦', 'opti-megastore': '🛋️', 'opti-wohnwelt': '🛋️',
  'sb-moebel-boss': '🛋️', 'moebel-inhofer': '🛋️', 'kabs': '🧴', 'edeka-foodservice-handelshof': '🟢'
};

const SOURCE_LABELS = {
  'direct': '🛒 Direkt',
  'marktguru': '📍 marktguru'
};

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

// Extracts the date from a revision identifier like "r001_2026-05-17" → "17.05.2026"
function formatRevisionDate(rev) {
  if (!rev || typeof rev !== 'string') return '-';
  const m = rev.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return rev;
  return new Date(m[1]).toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatPrice(price) {
  if (typeof price === 'string') price = parseFloat(price);
  return isNaN(price) ? '-' : `€${price.toFixed(2)}`;
}

const STAGE_LABELS = {
  start: 'Start', download: 'Download', filter: 'Filter',
  compare: 'Vergleich', backup: 'Backup', promote: 'Übernahme',
  done: 'Fertig', error: 'Fehler'
};

// Simple info-box style for scrape status
function ScrapeInfoBox({ progress, status }) {
  if (!progress && !status) return null;

  const isRunning = progress?.status === 'running';
  const isError = progress?.status === 'error';
  
  return (
    <div className={`scrape-info-box ${isRunning ? 'running' : ''} ${isError ? 'error' : ''} ${!isRunning && !isError ? 'done' : ''}`}>
      {isRunning && <span className="scrape-info-icon">⏳</span>}
      {isError && <span className="scrape-info-icon">❌</span>}
      {!isRunning && !isError && <span className="scrape-info-icon">✅</span>}
      <span className="scrape-info-text">{progress?.message || status?.msg || 'Bereit'}</span>
      {progress?.stats && <span className="scrape-info-stats">{progress.stats.activeStores}/{progress.stats.totalStores} Stores</span>}
    </div>
  );
}

function ChangeItem({ change }) {
  const [expanded, setExpanded] = useState(false);
  const actionIcons = { add: '➕', update: '✏️', delete: '❌' };
  // action colors come from theme via CSS classes — kept here as fallback only
  const actionColors = {
    add: 'var(--color-success)',
    update: 'var(--color-sepia)',
    delete: 'var(--color-danger)'
  };

  return (
    <div className="change-item" style={{ borderLeftColor: actionColors[change.action] }}>
      <div className="change-item-header" onClick={() => setExpanded(!expanded)}>
        <span className="change-action" style={{ color: actionColors[change.action] }}>
          {actionIcons[change.action]} {change.action}
        </span>
        <span className="change-name">{change.product_name || '(no name)'}</span>
        <span className="change-code">{change.code}</span>
        <span className="change-expand">{expanded ? '▲' : '▼'}</span>
      </div>
      {expanded && change.changes && (
        <div className="change-details">
          {Object.entries(change.changes).map(([field, { old: oldVal, new: newVal }]) => (
            <div key={field} className="change-field">
              <span className="field-name">{field}:</span>
              <span className="field-old">{oldVal || '-'}</span>
              <span className="field-arrow">→</span>
              <span className="field-new">{newVal || '-'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Collapsible section wrapper
function Section({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`admin-section ${open ? 'open' : 'closed'}`}>
      <h2 className="section-title" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        {icon} {title}
        <span className="section-toggle">{open ? '▲' : '▼'}</span>
      </h2>
      {open && <div className="section-content">{children}</div>}
    </section>
  );
}

//===============================================================
// OFFERS DATA VIEW (from OffersDataViewPage)
//===============================================================
function OffersDataView() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stores, setStores] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeProg, setScrapeProg] = useState(null);
  const [scrapePollId, setScrapePollId] = useState(null);
  const [marktguruLoading, setMarktguruLoading] = useState(false);
  const [showStoreSelect, setShowStoreSelect] = useState(false);
  const [selectedStores, setSelectedStores] = useState(['lidl', 'penny', 'rewe', 'kaufland', 'netto-marken-discount', 'nahkauf', 'toom', 'hornbach', 'obi', 'hellweg', 'kabs']);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [priceHistory, setPriceHistory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState(null);

  const ALL_SCRAPE_STORES = [
    { key: 'lidl', label: 'Lidl' }, { key: 'kaufland', label: 'Kaufland' },
    { key: 'netto-marken-discount', label: 'Netto Marken-Discount' },
    { key: 'penny', label: 'PENNY' }, { key: 'rewe', label: 'REWE' },
    { key: 'nahkauf', label: 'Nahkauf' }, { key: 'toom', label: 'Toom' },
    { key: 'hornbach', label: 'Hornbach' }, { key: 'obi', label: 'OBI' },
    { key: 'hellweg', label: 'Hellweg' }, { key: 'kabs', label: 'KABS' },
  ];

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_OFFERS}/overview`).then(r => r.json()),
      fetch(`${API_OFFERS}/stores`).then(r => r.json())
    ]).then(([ov, st]) => {
      setOverview(ov);
      setStores(st.stores || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleScrape = async () => {
    setScrapeLoading(true);
    setScrapeProg({ stage: 'start', status: 'running', message: 'Starte Scrape...', progress: 0 });
    // Start polling for progress
    const pollId = setInterval(async () => {
      try {
        const r = await fetch(`${API_OFFERS}/scrape/progress`);
        const d = await r.json();
        if (d.progress) {
          setScrapeProg(d.progress);
          if (d.progress.status !== 'running') {
            clearInterval(pollId);
            setScrapeProg(null);
            const isError = d.progress.status === 'error';
            const stats = d.progress.stats || {};
            const msg = d.progress.message || (isError ? 'Fehler beim Scrape' : 'Fertig');
            setScrapeStatus({
              type: isError ? 'error' : 'success',
              msg: isError
                ? `❌ ${msg}`
                : `✅ ${msg} (${stats.activeStores ?? '?'}/${stats.totalStores ?? '?'} Stores aktiv)`
            });
            setTimeout(() => setScrapeStatus(null), 8000);
            loadData();
          }
        }
      } catch {}
    }, 500);
    setScrapePollId(pollId);
    setScrapeStatus({ type: 'loading', msg: '🛒 Direkt-Scrape läuft…' });
    try { await fetch(`${API_OFFERS}/scrape`, { method: 'POST' }); }
    catch (e) {
      setScrapeStatus({ type: 'error', msg: '❌ Scrape-Request fehlgeschlagen: ' + e.message });
      setTimeout(() => setScrapeStatus(null), 8000);
    }
    finally { setScrapeLoading(false); }
  };

  const handleMarktguruScrape = async () => {
    setMarktguruLoading(true);
    setScrapeProg({ stage: 'start', status: 'running', message: 'Starte Marktguru...', progress: 0 });
    const pollId = setInterval(async () => {
      try {
        const r = await fetch(`${API_OFFERS}/scrape/progress`);
        const d = await r.json();
        if (d.progress) {
          setScrapeProg(d.progress);
          if (d.progress.status !== 'running') {
            clearInterval(pollId);
            setScrapeProg(null);
            loadData();
          }
        }
      } catch {}
    }, 500);
    setScrapePollId(pollId);
    setScrapeStatus({ type: 'loading', msg: '📍 Marktguru-Scrape läuft…' });
    try {
      await fetch(`${API_OFFERS}/config`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marktguruStores: selectedStores })
      });
      await fetch(`${API_OFFERS}/scrape/marktguru`, { method: 'POST' });
    } catch (e) {
      setScrapeStatus({ type: 'error', msg: '❌ Marktguru-Request fehlgeschlagen: ' + e.message });
      setTimeout(() => setScrapeStatus(null), 8000);
    }
    finally { setMarktguruLoading(false); }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQ.trim()) return;
    fetch(`${API_OFFERS}/search?q=${encodeURIComponent(searchQ)}&limit=20`)
      .then(r => r.json()).then(data => setSearchResults(data.results || [])).catch(() => {});
  };

  if (loading) return <div className="loading-text">Lädt Daten...</div>;

  return (
    <div className="admin-offers">
      <div className="admin-offers-header">
        <div className="offers-header-row">
          <div className="header-cell">
            <span className="cell-value">{overview?.totalOffers?.toLocaleString('de-DE') ?? '-'}</span>
            <span className="cell-label">Angebote</span>
          </div>
          <div className="header-cell">
            <span className="cell-value">{overview?.uniqueProducts?.toLocaleString('de-DE') ?? '-'}</span>
            <span className="cell-label">Eindeutige Produkte</span>
          </div>
          <div className="header-cell">
            <span className="cell-value">{overview?.lastScrape ? new Date(overview.lastScrape.scraped_at).toLocaleDateString('de-DE') : '-'}</span>
            <span className="cell-label">Letzter Scrape</span>
          </div>
        </div>

        <div className="offers-header-actions">
          <button className="admin-btn admin-btn-secondary" onClick={() => setShowStoreSelect(!showStoreSelect)}>
            🏪 Marktguru ({selectedStores.length})
          </button>
          <button className="admin-btn admin-btn-secondary" onClick={handleScrape} disabled={scrapeLoading}>
            {scrapeLoading ? '⏳' : '🛒'} Direkt
          </button>
          <button className="admin-btn admin-btn-primary" onClick={handleMarktguruScrape} disabled={marktguruLoading}>
            {marktguruLoading ? '⏳' : '📍'} Marktguru
          </button>
        </div>
      </div>

      {scrapeProg && (
        <div style={{ marginBottom: '1rem' }}>
          <ScrapeInfoBox progress={scrapeProg} status={scrapeStatus} />
        </div>
      )}

      {scrapeStatus && (
        <div className={`status-message ${scrapeStatus.type}`} style={{ marginBottom: '1rem' }}>
          {scrapeStatus.msg}
        </div>
      )}

      {showStoreSelect && (
        <div className="admin-store-select">
          <div className="store-select-actions">
            <button className="admin-btn admin-btn-sm" onClick={() => setSelectedStores(ALL_SCRAPE_STORES.map(s => s.key))}>Alle</button>
            <button className="admin-btn admin-btn-sm" onClick={() => setSelectedStores([])}>Keine</button>
          </div>
          <div className="store-checkboxes">
            {ALL_SCRAPE_STORES.map(store => (
              <label key={store.key} className="store-checkbox-label">
                <input type="checkbox" checked={selectedStores.includes(store.key)}
                  onChange={e => {
                    if (e.target.checked) setSelectedStores([...selectedStores, store.key]);
                    else setSelectedStores(selectedStores.filter(s => s !== store.key));
                  }}
                />
                {store.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>📈 Übersicht</button>
        <button className={`admin-tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>📋 Preis-Historie</button>
        <button className={`admin-tab ${activeTab === 'chart' ? 'active' : ''}`} onClick={() => setActiveTab('chart')}>📉 Charts</button>
        <button className={`admin-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>📋 Alle</button>
        <button className={`admin-tab ${activeTab === 'stores' ? 'active' : ''}`} onClick={() => setActiveTab('stores')}>🏪 Stores</button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="admin-tab-content">
          {overview?.sourceSummary?.length > 0 && (
            <div className="source-cards">
              {overview.sourceSummary.map(s => (
                <div key={s.source} className="source-card">
                  <div className="source-label">{SOURCE_LABELS[s.source] || s.source}</div>
                  <div className="source-value">{s.total_offers?.toLocaleString()} Angebote</div>
                  <div className="source-meta">{s.scrape_count} Scrapes</div>
                </div>
              ))}
            </div>
          )}
          {overview?.storeCounts?.length > 0 && (
            <div className="store-overview-grid">
              {overview.storeCounts.map(sc => (
                <div key={`${sc.store}-${sc.source}`} className="store-overview-card">
                  <div className="store-name">{STORE_LABELS[sc.store] || sc.store}</div>
                  <span className="source-badge store-source-badge" title={`Quelle: ${SOURCE_LABELS[sc.source] || sc.source}`}>
                    {SOURCE_LABELS[sc.source] || sc.source}
                  </span>
                  <div className="store-stats">{sc.scrape_count} Scrapes · {sc.total_offers?.toLocaleString()} Angebote</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="admin-tab-content">
          <form onSubmit={handleSearch} className="admin-search-form">
            <input type="text" className="admin-search-input" placeholder="z.B. Nutella, Butter, Milch..."
              value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            <button type="submit" className="admin-btn admin-btn-primary">Suchen</button>
          </form>
          {searchResults !== null && (
            <div className="results-list">
              {searchResults.length > 0 ? searchResults.map((r, i) => (
                <div key={i} className="result-item">
                  <span className="result-name">{r.product_name}</span>
                  <span className="store-badge">{STORE_LABELS[r.store] || r.store}</span>
                  <span className="price-range">{formatPrice(r.min_price)} - {formatPrice(r.max_price)}</span>
                  <span className="seen-count">{r.seen_count}×</span>
                </div>
              )) : <p className="empty-text">Keine Ergebnisse</p>}
            </div>
          )}
        </div>
      )}

      {/* Stores Tab */}
      {activeTab === 'stores' && (
        <div className="admin-tab-content">
          <div className="stores-grid">
            {stores.map((s, i) => (
              <div key={i} className="store-card">
                <div className="store-card-header">
                  <span className="store-emoji">{STORE_EMOJI[s.store] || '🏪'}</span>
                  <div>
                    <div className="store-name">{STORE_LABELS[s.store] || s.store}</div>
                    <span className="source-badge">{SOURCE_LABELS[s.source] || s.source}</span>
                  </div>
                </div>
                <div className="store-card-stats">
                  <span>{s.offer_count?.toLocaleString()} Angebote</span>
                  <span>·</span>
                  <span>{s.unique_products?.toLocaleString()} eindeutig</span>
                </div>
                <div className="store-card-dates">
                  {new Date(s.first_seen).toLocaleDateString('de-DE')} - {new Date(s.last_seen).toLocaleDateString('de-DE')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'all' && <AllOffersView />}
      {activeTab === 'chart' && <ChartView />}
    </div>
  );
}

function AllOffersView() {
  const [allOffers, setAllOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStore, setFilterStore] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  useEffect(() => {
    fetch(`${API_OFFERS}/all`).then(r => r.json()).then(d => { setAllOffers(d.offers || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-text">Lade...</div>;

  const stores = [...new Set(allOffers.map(o => o.store))].sort();
  let filtered = allOffers;
  if (filterStore) filtered = filtered.filter(o => o.store === filterStore);
  if (filterSearch) filtered = filtered.filter(o => o.product_name.toLowerCase().includes(filterSearch.toLowerCase()));

  return (
    <div className="admin-tab-content">
      <div className="filter-bar">
        <input type="text" placeholder="Filtern..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="admin-search-input" />
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)}>
          <option value="">Alle Stores</option>
          {stores.map(s => <option key={s} value={s}>{STORE_LABELS[s] || s}</option>)}
        </select>
      </div>
      <div className="offers-count">{filtered.length} von {allOffers.length}</div>
      <div className="offers-table-wrap">
        <table className="offers-table">
          <thead><tr><th>Produkt</th><th>Store</th><th>Preis</th><th>URL</th><th>Scraped</th></tr></thead>
          <tbody>
            {filtered.slice(0, 500).map((o, i) => (
              <tr key={i}>
                <td><span className="product-name-cell">{o.product_name}</span>{o.brand && <span className="product-brand">{o.brand}</span>}</td>
                <td><span className="store-badge">{STORE_LABELS[o.store] || o.store}</span></td>
                <td className="price-cell">{formatPrice(o.price)}</td>
                <td>{o.url ? <a href={o.url} target="_blank" rel="noopener">🔗</a> : '-'}</td>
                <td>{new Date(o.scraped_at).toLocaleDateString('de-DE')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChartView() {
  const [productName, setProductName] = useState('');
  const [chartData, setChartData] = useState(null);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!productName.trim()) return;
    fetch(`${API_OFFERS}/price-chart/${encodeURIComponent(productName)}`).then(r => r.json()).then(d => setChartData(d)).catch(() => {});
  };

  if (!chartData) {
    return (
      <div className="admin-tab-content">
        <form onSubmit={handleSearch} className="admin-search-form">
          <input type="text" className="admin-search-input" placeholder="Produktname für Chart..."
            value={productName} onChange={e => setProductName(e.target.value)} />
          <button type="submit" className="admin-btn admin-btn-primary">Laden</button>
        </form>
      </div>
    );
  }

  const data = chartData.chartData || [];
  if (data.length === 0) return <div className="empty-text">Keine Chart-Daten</div>;

  const stores = [...new Set(data.map(d => d.store))];
  const maxP = Math.max(...data.map(d => d.max_price || 0));

  return (
    <div className="admin-tab-content">
      <h3 className="chart-title">📈 {productName}</h3>
      <div className="price-chart">
        {stores.map(store => {
          const storeData = data.filter(d => d.store === store);
          return (
            <div key={store} className="store-chart-row">
              <div className="store-chart-label">{STORE_LABELS[store] || store}</div>
              <div className="store-chart-bars">
                {storeData.map((d, i) => (
                  <div key={i} className="chart-bar"
                    style={{ height: `${Math.max(10, (d.avg_price / maxP) * 100)}%` }}
                    title={`${formatPrice(d.min_price)} - ${formatPrice(d.max_price)}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

//===============================================================
// OFFERS HISTORY (from OffersHistoryPage)
//===============================================================
function OffersHistoryView() {
  const [overview, setOverview] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [recordOffers, setRecordOffers] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const loadOverview = useCallback(() => {
    fetch(`${API_OFFERS}/overview`).then(r => r.json()).then(d => setOverview(d)).catch(() => {});
  }, []);

  const loadRecords = useCallback(() => {
    fetch(`${API_OFFERS}/history?page=${page}&limit=${PAGE_SIZE}`).then(r => r.json()).then(d => {
      setRecords(d.records || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [page]);

  useEffect(() => { loadOverview(); loadRecords(); }, [loadOverview, loadRecords]);

  const handleScrape = async () => {
    setScrapeLoading(true);
    try { await fetch(`${API_OFFERS}/scrape`, { method: 'POST' }); loadOverview(); loadRecords(); }
    finally { setScrapeLoading(false); }
  };

  const loadRecordDetail = (record) => {
    setSelectedRecord(record);
    setDetailLoading(true);
    fetch(`${API_OFFERS}/history/${record.id}`).then(r => r.json()).then(d => {
      setRecordOffers(d.offers || []);
      setDetailLoading(false);
    }).catch(() => setDetailLoading(false));
  };

  if (loading) return <div className="loading-text">Lädt...</div>;

  return (
    <div className="admin-offers">
      <div className="admin-offers-header">
        <div className="offers-header-row">
          <div className="header-cell">
            <span className="cell-value">{overview?.totalRecords ?? '-'}</span>
            <span className="cell-label">Scrapes gesamt</span>
          </div>
          <div className="header-cell">
            <span className="cell-value">{overview?.totalOffers?.toLocaleString('de-DE') ?? '-'}</span>
            <span className="cell-label">Angebote</span>
          </div>
        </div>
        <div className="offers-header-actions">
          <button className="admin-btn admin-btn-primary" onClick={handleScrape} disabled={scrapeLoading}>
            {scrapeLoading ? '⏳' : '🔄'} Neuer Scrape
          </button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${!selectedRecord ? 'active' : ''}`} onClick={() => setSelectedRecord(null)}>
          📋 Scrapes ({overview?.totalRecords ?? 0})
        </button>
        {selectedRecord && (
          <button className="admin-tab active">
            📦 {new Date(selectedRecord.scraped_at).toLocaleDateString('de-DE')}
          </button>
        )}
      </div>

      {!selectedRecord ? (
        <div className="admin-tab-content">
          <div className="records-list">
            {records.map(r => (
              <div key={r.id} className="record-item" onClick={() => loadRecordDetail(r)}>
                <div className="record-date">{formatDate(r.scraped_at)}</div>
                <div className="record-stats">
                  <span>{r.total_offers?.toLocaleString()} Angebote</span>
                  {r.source && <span className="source-badge">{SOURCE_LABELS[r.source] || r.source}</span>}
                </div>
                <div className="record-expand">▼</div>
              </div>
            ))}
          </div>
          {records.length > 0 && (
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span>Seite {page}</span>
              <button disabled={records.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-tab-content">
          <button className="admin-btn admin-btn-secondary" onClick={() => setSelectedRecord(null)} style={{ marginBottom: '1rem' }}>
            ← Zurück
          </button>
          {detailLoading ? <div className="loading-text">Lädt...</div> : (
            <div className="record-offers">
              <div className="record-offers-header">
                <strong>{recordOffers.length} Angebote</strong> vom {formatDate(selectedRecord.scraped_at)}
              </div>
              <div className="offers-table-wrap">
                <table className="offers-table">
                  <thead><tr><th>Produkt</th><th>Store</th><th>Preis</th><th>URL</th></tr></thead>
                  <tbody>
                    {recordOffers.slice(0, 200).map((o, i) => (
                      <tr key={i}>
                        <td><span className="product-name-cell">{o.product_name}</span></td>
                        <td><span className="store-badge">{STORE_LABELS[o.store] || o.store}</span></td>
                        <td className="price-cell">{formatPrice(o.price)}</td>
                        <td>{o.url ? <a href={o.url} target="_blank" rel="noopener">🔗</a> : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

//===============================================================
// MAIN ADMIN PANEL
//===============================================================
export default function AdminPanel() {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState('');
  const [revisions, setRevisions] = useState([]);
  const [selectedRev, setSelectedRev] = useState(null);
  const [changes, setChanges] = useState(null);
  const [changesPage, setChangesPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [pollInterval, setPollInterval] = useState(null);

  // Top action bar state (for OFF + scrape buttons)
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeProg, setScrapeProg] = useState(null);
  const [scrapeStatus, setScrapeStatus] = useState(null);

  const handleScrape = async () => {
    setScrapeLoading(true);
    setScrapeProg({ stage: 'start', status: 'running', message: 'Starte Scrape...', progress: 0 });
    const pollId = setInterval(async () => {
      try {
        const r = await fetch(`${API_OFFERS}/scrape/progress`);
        const d = await r.json();
        if (d.progress) {
          setScrapeProg(d.progress);
          if (d.progress.status !== 'running') {
            clearInterval(pollId);
            setScrapeProg(null);
            const isError = d.progress.status === 'error';
            const msg = d.progress.message || (isError ? 'Fehler beim Scrape' : 'Fertig');
            setScrapeStatus({ type: isError ? 'error' : 'success', msg: isError ? `❌ ${msg}` : `✅ ${msg} (${d.progress.stats?.activeStores ?? '?'}/${d.progress.stats?.totalStores ?? '?'} Stores aktiv)` });
            setTimeout(() => setScrapeStatus(null), 8000);
          }
        }
      } catch {}
    }, 500);
    setScrapeStatus({ type: 'loading', msg: '🛒 Direkt-Scrape läuft…' });
    try { await fetch(`${API_OFFERS}/scrape`, { method: 'POST' }); }
    catch (e) { setScrapeStatus({ type: 'error', msg: '❌ Scrape-Request fehlgeschlagen: ' + e.message }); setTimeout(() => setScrapeStatus(null), 8000); }
    finally { setScrapeLoading(false); }
  };

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/status`);
      const d = await r.json();
      setStatus(d);
      if (d.progress) setProgress(d.progress);
    } catch (e) { console.error(e); }
  }, []);

  const loadRevisions = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/revisions`);
      const d = await r.json();
      setRevisions(d.revisions || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/logs`);
      const d = await r.json();
      setLogs(d.logs || '');
    } catch (e) { console.error(e); }
  }, []);

  const loadChanges = useCallback(async (revName, page = 1) => {
    try {
      const r = await fetch(`${API_BASE}/revisions/${revName}/changes?page=${page}&limit=20`);
      const d = await r.json();
      setChanges(d);
      setChangesPage(page);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadStatus(); loadRevisions(); loadLogs(); }, [loadStatus, loadRevisions, loadLogs]);

  useEffect(() => {
    if (progress?.status === 'running') {
      const interval = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/progress`);
          const d = await r.json();
          setProgress(d.progress);
        } catch (e) {}
      }, 1500);
      setPollInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (pollInterval) clearInterval(pollInterval);
      if (progress?.status === 'done') { loadStatus(); loadRevisions(); loadLogs(); }
      if (progress?.status === 'cancelled') { setProgress(null); loadStatus(); loadRevisions(); }
    }
  }, [progress?.status]);

  const handleTriggerUpdate = async (full = false) => {
    setProgress({ stage: 'start', status: 'running', message: 'Triggering update...' });
    try {
      const res = await fetch(`${API_BASE}/trigger`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full })
      });
      const data = await res.json();
      if (data.error === 'Update already in progress') {
        return;
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancel = async () => {
    try {
      await fetch(`${API_BASE}/cancel`, { method: 'POST' });
      // Reload progress to reflect cancelled state
      const res = await fetch(`${API_BASE}/progress`);
      const data = await res.json();
      setProgress(data.progress);
    } catch (e) { console.error(e); }
  };

  const isRunning = progress?.status === 'running';

  return (
    <div className="admin-panel">
      <h1 className="admin-title">🔧 Admin Panel</h1>

      {/* Top Action Bar */}
      <div className="admin-top-actions">
        <div className="admin-top-actions-row">
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => handleTriggerUpdate(false)}
            disabled={loading}
            title="OpenFoodFacts Datenbank aktualisieren"
          >
            📦 OFF aktualisieren
          </button>
          <button
            className="admin-btn admin-btn-secondary"
            onClick={handleScrape}
            disabled={scrapeLoading}
            title="Angebote direkt scrapen"
          >
            {scrapeLoading ? '⏳' : '🛒'} Angebote scrapen
          </button>
        </div>
        {scrapeStatus && (
          <div className={`status-message ${scrapeStatus.type}`} style={{ marginTop: '0.5rem' }}>
            {scrapeStatus.msg}
          </div>
        )}
      </div>

      {/* Section 1: OFF Update */}
      <Section title="📦 OpenFoodFacts Datenbank" icon="📦" defaultOpen={true}>
        <div className="off-status-grid">
          <div className="off-status-card">
            <div className="off-status-value">{status?.currentProducts?.toLocaleString('de-DE') ?? '-'}</div>
            <div className="off-status-label">Deutsche Produkte</div>
          </div>
          <div className="off-status-card">
            <div className="off-status-value">{formatRevisionDate(status?.currentRevision)}</div>
            <div className="off-status-label">Letztes Update</div>
          </div>
          <div className="off-status-card">
            <div className="off-status-value">{status?.totalRevisions ?? 0}</div>
            <div className="off-status-label">Revisions</div>
          </div>
          {status?.latestStats && (
            <>
              <div className="off-status-card">
                <div className="off-status-value" style={{ color: 'var(--color-success)' }}>+{status.latestStats.new}</div>
                <div className="off-status-label">Neue</div>
              </div>
              <div className="off-status-card">
                <div className="off-status-value" style={{ color: 'var(--color-sepia)' }}>±{status.latestStats.updated}</div>
                <div className="off-status-label">Aktualisiert</div>
              </div>
            </>
          )}
        </div>

        {progress && (progress.status === 'running' || progress.stage === 'start') && (
          <ScrapeInfoBox progress={progress} />
        )}

        {progress?.status === 'done' && (
          <div className="off-success-msg">
            ✅ Letztes Update: {formatRevisionDate(progress.revision)} - {progress.message}
          </div>
        )}

        <div className="off-actions">
          {isRunning ? (
            <>
              <span className="off-running-indicator">⏳ Läuft...</span>
              <button className="off-btn off-btn-danger" onClick={handleCancel}>
                ✕ Abbrechen
              </button>
            </>
          ) : (
            <>
              <button className="off-btn off-btn-primary" onClick={() => handleTriggerUpdate(false)} disabled={loading}>
                🔄 Update starten
              </button>
              <button className="off-btn off-btn-secondary" onClick={() => handleTriggerUpdate(true)} disabled={loading}>
                🔄 Vollständiger DL
              </button>
            </>
          )}
          <button className="off-btn off-btn-text" onClick={() => setLogsOpen(!logsOpen)}>
            📋 Logs {logsOpen ? '▲' : '▼'}
          </button>
        </div>

        {logsOpen && <pre className="off-logs-content">{logs || 'Noch keine Logs'}</pre>}

        {/* Revisions */}
        <div className="revisions-list" style={{ marginTop: '1rem' }}>
          {revisions.map((rev) => (
            <div key={rev.name} className={`revision-item ${selectedRev?.name === rev.name ? 'selected' : ''}`}
              onClick={() => { setSelectedRev(rev); loadChanges(rev.name, 1); }}>
              <div className="revision-name">{rev.name}</div>
              {rev.changelog && (
                <div className="revision-stats">
                  <span className="stat-add">+{rev.changelog.stats?.new ?? 0}</span>
                  <span className="stat-upd">±{rev.changelog.stats?.updated ?? 0}</span>
                  <span className="stat-del">−{rev.changelog.stats?.deleted ?? 0}</span>
                </div>
              )}
              <div className="revision-date">{formatDate(rev.changelog?.date)}</div>
            </div>
          ))}
        </div>

        {/* Changes */}
        {selectedRev && changes && (
          <div className="changes-section">
            <div className="changes-pagination">
              <button disabled={changes.page <= 1} onClick={() => loadChanges(selectedRev.name, changes.page - 1)}>←</button>
              <span>Seite {changes.page} von {changes.totalPages}</span>
              <button disabled={changes.page >= changes.totalPages} onClick={() => loadChanges(selectedRev.name, changes.page + 1)}>→</button>
            </div>
            <div className="changes-list">
              {changes.changes?.map((change, i) => <ChangeItem key={`${change.code}-${i}`} change={change} />)}
            </div>
          </div>
        )}
      </Section>

      {/* Section 2: Angebote Daten */}
      <Section title="🏷️ Angebote-Daten" icon="🏷️" defaultOpen={false}>
        <OffersDataView />
      </Section>

      {/* Section 3: Angebote Historie */}
      <Section title="📋 Angebote-Historie" icon="📋" defaultOpen={false}>
        <OffersHistoryView />
      </Section>
    </div>
  );
}