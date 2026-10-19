import { useEffect, useMemo, useState } from 'react';
import './OffersPage.css';

const STORE_EMOJI = {
  lidl: '🟡', kaufland: '🔴', rewe: '🟢', edeka: '🟤', penny: '🟠',
  'aldi-sued': '🔵', 'aldi-nord': '🔵', 'netto-marken-discount': '🟨',
  'netto-supermarkt': '🟡', norma: '🔷', nahkauf: '🟫', marktkauf: '🟥',
  familia: '🟪', famila2: '🟪', combo: '🟩', 'v-markt': '🟦', globus: '🟥',
  tegut: '🟩', 'e-center': '🟧', metro: '⚫', 'denns-biomarkt': '🌱',
  rossmann: '🟤', dm: '🟦', mueller: '🟨',
};

function formatPrice(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–';
  return value.toFixed(2).replace('.', ',') + ' €';
}

function formatValidTo(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

function sourceLabel(source) {
  switch (source) {
    case 'api': return 'Streichpreis (Marktguru)';
    case 'kaufda': return 'Streichpreis (Kaufda)';
    case 'kaufda-uvp': return 'UVP (Herstellerempfehlung)';
    case 'history': return 'eigener Vorpreis';
    default: return null;
  }
}

export default function OffersPage() {
  const [data, setData] = useState({ offers: {}, lastUpdated: null });
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [activeStores, setActiveStores] = useState([]);
  const [onlyDiscounts, setOnlyDiscounts] = useState(false);
  const [sortBy, setSortBy] = useState('discount');
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState(null);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch('/recipe/api/offers');
      if (!res.ok) throw new Error('Angebote konnten nicht geladen werden');
      const json = await res.json();
      setData({ offers: json.offers || {}, lastUpdated: json.lastUpdated || null });
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch('/recipe/api/settings/stores')
      .then((r) => r.json())
      .then((j) => {
        const map = {};
        for (const s of j.stores || []) map[s.key] = s.label;
        setLabels(map);
      })
      .catch(() => {});
  }, []);

  const stores = useMemo(() => Object.keys(data.offers), [data.offers]);

  const allOffers = useMemo(() => {
    const out = [];
    for (const [store, list] of Object.entries(data.offers)) {
      for (const o of list || []) out.push({ ...o, store });
    }
    return out;
  }, [data.offers]);

  const totals = useMemo(() => {
    const withDiscount = allOffers.filter((o) => typeof o.discount_percent === 'number');
    const avg = withDiscount.length
      ? Math.round(withDiscount.reduce((s, o) => s + o.discount_percent, 0) / withDiscount.length)
      : null;
    return { count: allOffers.length, withDiscount: withDiscount.length, avg, stores: stores.length };
  }, [allOffers, stores.length]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allOffers;
    if (activeStores.length) list = list.filter((o) => activeStores.includes(o.store));
    if (onlyDiscounts) list = list.filter((o) => typeof o.discount_percent === 'number');
    if (q) {
      list = list.filter((o) =>
        `${o.name} ${o.brand || ''} ${o.category || ''}`.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortBy === 'discount') sorted.sort((a, b) => (b.discount_percent ?? -1) - (a.discount_percent ?? -1));
    else if (sortBy === 'price') sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sortBy === 'store') sorted.sort((a, b) => a.store.localeCompare(b.store) || (a.price ?? 0) - (b.price ?? 0));
    return sorted;
  }, [allOffers, activeStores, onlyDiscounts, query, sortBy]);

  function toggleStore(store) {
    setActiveStores((prev) => prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]);
  }

  async function startScrape() {
    try {
      setScraping(true);
      const res = await fetch('/recipe/api/offers/scrape', { method: 'POST' });
      const json = await res.json();
      if (res.status === 409) { setProgress(json.progress || null); return; }
      pollProgress();
    } catch (e) {
      setError(e.message);
      setScraping(false);
    }
  }

  function pollProgress() {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/recipe/api/offers/scrape/progress');
        const { progress: p } = await res.json();
        setProgress(p);
        if (!p || p.status !== 'running') {
          clearInterval(timer);
          setScraping(false);
          load();
        }
      } catch {
        clearInterval(timer);
        setScraping(false);
      }
    }, 1500);
  }

  const lastUpdatedText = data.lastUpdated
    ? new Date(data.lastUpdated).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '–';

  return (
    <div className="offers-page">
      <div className="offers-head">
        <div>
          <h1 className="offers-title">🏷️ Angebote</h1>
          <p className="offers-sub">
            {totals.count.toLocaleString('de-DE')} Angebote aus {totals.stores} Ketten
            {totals.withDiscount > 0 && ` · ${totals.withDiscount.toLocaleString('de-DE')} mit Ersparnis (Ø ${totals.avg} %)`}
            {' · '}Stand {lastUpdatedText}
          </p>
        </div>
        <button className="btn btn-primary" onClick={startScrape} disabled={scraping}>
          {scraping ? 'Läuft…' : 'Angebote neu einlesen'}
        </button>
      </div>

      {progress && progress.status === 'running' && (
        <div className="offers-progress">
          <div className="offers-progress-bar" style={{ width: `${progress.progress || 0}%` }} />
          <span>{progress.message || 'Sammle Angebote…'}</span>
        </div>
      )}
      {error && <div className="offers-error">{error}</div>}

      <div className="offers-toolbar">
        <input
          className="offers-search"
          type="search"
          placeholder="Produkt oder Marke suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="offers-check">
          <input type="checkbox" checked={onlyDiscounts} onChange={(e) => setOnlyDiscounts(e.target.checked)} />
          nur mit Ersparnis
        </label>
        <select className="offers-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="discount">Sortierung: Ersparnis</option>
          <option value="price">Sortierung: Preis</option>
          <option value="store">Sortierung: Markt</option>
        </select>
      </div>

      <div className="offers-stores">
        {stores.map((store) => {
          const count = (data.offers[store] || []).length;
          const active = activeStores.includes(store);
          return (
            <button
              key={store}
              className={`offers-chip${active ? ' is-active' : ''}`}
              onClick={() => toggleStore(store)}
            >
              {STORE_EMOJI[store] || '🏪'} {labels[store] || store}
              <span className="offers-chip-count">{count}</span>
            </button>
          );
        })}
        {activeStores.length > 0 && (
          <button className="offers-chip offers-chip-reset" onClick={() => setActiveStores([])}>× Filter</button>
        )}
      </div>

      {loading ? (
        <p className="offers-empty">Lade Angebote…</p>
      ) : visible.length === 0 ? (
        <p className="offers-empty">
          Keine Angebote für diese Auswahl. {totals.count === 0 && 'Noch keine Daten — „Angebote neu einlesen“ starten.'}
        </p>
      ) : (
        <div className="offers-grid">
          {visible.slice(0, 600).map((o, i) => {
            const validTo = formatValidTo(o.valid_to);
            const source = sourceLabel(o.old_price_source);
            return (
              <article className="offer-card" key={`${o.store}-${o.offer_id || o.name}-${i}`}>
                <div className="offer-badge-row">
                  <span className="offer-store">{STORE_EMOJI[o.store] || '🏪'} {labels[o.store] || o.store}</span>
                  {typeof o.discount_percent === 'number' && (
                    <span className="offer-discount">−{Math.round(o.discount_percent)} %</span>
                  )}
                </div>
                <h3 className="offer-name">{o.name}</h3>
                {o.brand && <p className="offer-brand">{o.brand}</p>}
                <div className="offer-prices">
                  <span className="offer-price">{formatPrice(o.price)}</span>
                  {typeof o.original_price === 'number' && (
                    <span className="offer-old" title={source || ''}>{formatPrice(o.original_price)}</span>
                  )}
                </div>
                <div className="offer-meta">
                  {o.unit_price ? <span>{formatPrice(o.unit_price)} / {o.unit || 'Einheit'}</span> : null}
                  {validTo ? <span>bis {validTo}</span> : null}
                  {o.upcoming ? <span className="offer-upcoming">ab kommender Woche</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {visible.length > 600 && (
        <p className="offers-empty">Zeige die ersten 600 von {visible.length.toLocaleString('de-DE')} — Suche oder Filter eingrenzen.</p>
      )}
    </div>
  );
}
