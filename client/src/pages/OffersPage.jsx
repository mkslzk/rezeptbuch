import { useEffect, useMemo, useRef, useState } from 'react';
import './OffersPage.css';

const STORE_COLORS = {
  lidl: '#0050aa', kaufland: '#e2001a', rewe: '#cc071e', edeka: '#1a7f37',
  penny: '#d40e1e', 'aldi-sued': '#0057a8', 'aldi-nord': '#0057a8',
  'netto-marken-discount': '#f7c600', 'netto-supermarkt': '#f7c600', norma: '#004b93',
  nahkauf: '#8a5a2b', marktkauf: '#c8102e', famila: '#6b3fa0', combi: '#2e7d32',
  'v-markt': '#1565c0', globus: '#b71c1c', tegut: '#2e7d32', 'e-center': '#ef6c00',
  metro: '#1c1c1c', 'denns-biomarkt': '#4c8c2b', rossmann: '#8d6e63',
  dm: '#0d47a1', mueller: '#f9a825', feneberg: '#00695c',
};

const DIET_META = {
  vegan: { label: 'vegan', short: 'vegan', icon: '🌱' },
  vegetarisch: { label: 'vegetarisch', short: 'vegetarisch', icon: '🥚' },
  fleisch: { label: 'Fleisch/Fisch', short: 'Fleisch', icon: '🥩' },
};

const NON_FOOD_CATEGORIES = new Set(['nonfood', 'drogerie-haushalt', 'aktion']);
const PAGE_SIZE = 120;
const STORAGE_KEY = 'moca.offers.filters.v1';

const EMPTY_FILTERS = {
  query: '',
  stores: [],
  categories: [],
  diet: 'all',
  onlyFood: true,
  onlyFavorites: false,
  sortBy: 'discount',
};

function loadFilters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_FILTERS,
      ...parsed,
      stores: Array.isArray(parsed.stores) ? parsed.stores : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

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

function oldPriceLabel(source) {
  switch (source) {
    case 'kaufda-uvp': return 'UVP';
    case 'api':
    case 'kaufda':
    case 'history': return null; // echter Streichpreis, keine Kennzeichnung nötig
    default: return null;
  }
}

function favKey(name, brand) {
  // Server vergleicht mit COLLATE NOCASE — der Client muss genauso normalisieren,
  // sonst zeigt das Herz „nicht gemerkt" und der POST läuft ins Leere.
  return `${String(name || '').trim().toLowerCase()}||${String(brand || '').trim().toLowerCase()}`;
}

// Mini-Verlauf der Wochen-Tiefstpreise (SVG, kein Chart-Paket nötig)
function Sparkline({ points }) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const values = points.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 100;
  const h = 22;
  const coords = points.map((p, i) => ({
    x: (i / (points.length - 1)) * (w - 3) + 1.5,
    y: h - 2 - ((p.price - min) / span) * (h - 4),
  }));
  const d = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1];
  const falling = values[values.length - 1] <= values[0];
  return (
    <svg
      className={`offer-spark${falling ? ' is-down' : ''}`}
      width="100%"
      height={28}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Preisverlauf, ${falling ? 'fallend' : 'steigend'}`}
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r="2" fill="currentColor" />
    </svg>
  );
}

function matchesQuery(offer, q) {
  if (!q) return true;
  return `${offer.name} ${offer.brand || ''} ${offer.category_label || ''} ${offer.description || ''}`
    .toLowerCase()
    .includes(q);
}

export default function OffersPage() {
  const [data, setData] = useState({ offers: {}, lastUpdated: null });
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(loadFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [priceStats, setPriceStats] = useState({});
  // Region: Marktguru liefert je PLZ unterschiedliche Prospekte
  const [region, setRegion] = useState({ plz: '' });
  const [regionInput, setRegionInput] = useState('');
  const [regionSaving, setRegionSaving] = useState(false);
  const [regionMsg, setRegionMsg] = useState('');
  const dialogRef = useRef(null);
  const priceTimer = useRef(null);

  const { query, stores: activeStores, categories: activeCats, diet, onlyFood, onlyFavorites, sortBy } = filters;

  function update(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setVisibleCount(PAGE_SIZE);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setVisibleCount(PAGE_SIZE);
  }

  async function load() {
    try {
      setLoading(true);
      const res = await fetch('/recipe/api/offers');
      if (!res.ok) throw new Error('Angebote konnten nicht geladen werden');
      const json = await res.json();
      setData({ offers: json.offers || {}, lastUpdated: json.lastUpdated || null });
      setVisibleCount(PAGE_SIZE);   // nach einem Re-Scrape wieder von vorn
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch('/recipe/api/favorites')
      .then((r) => r.json())
      .then((j) => setFavorites(j.favorites || []))
      .catch(() => {});
    fetch('/recipe/api/settings/stores')
      .then((r) => r.json())
      .then((j) => {
        const map = {};
        for (const s of j.stores || []) map[s.key] = s.label;
        setLabels(map);
      })
      .catch(() => {});
  }, []);

  // Filter merken (Einzelnutzer-App: localStorage reicht, URL-Params wären Overhead)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch { /* privater Modus o. Ä. */ }
  }, [filters]);

  // natives <dialog>: showModal/close je nach State
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (filterOpen && !el.open) el.showModal();
    if (!filterOpen && el.open) el.close();
  }, [filterOpen]);

  const favoriteKeys = useMemo(
    () => new Set(favorites.map((f) => favKey(f.name, f.brand))),
    [favorites]
  );

  async function toggleFavorite(offer) {
    const key = favKey(offer.name, offer.brand);
    const existing = favorites.find((f) => favKey(f.name, f.brand) === key);
    try {
      const res = existing
        ? await fetch(`/recipe/api/favorites/${existing.id}`, { method: 'DELETE' })
        : await fetch('/recipe/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: offer.name, brand: offer.brand || null }),
          });
      const json = await res.json();
      if (Array.isArray(json.favorites)) setFavorites(json.favorites);
    } catch { /* still ok */ }
  }

  const allOffers = useMemo(() => {
    const out = [];
    for (const [store, list] of Object.entries(data.offers)) {
      for (const o of list || []) out.push({ ...o, store });
    }
    return out;
  }, [data.offers]);

  const totals = useMemo(() => {
    const vegan = allOffers.filter((o) => o.diet_tag === 'vegan').length;
    return { count: allOffers.length, stores: Object.keys(data.offers).length, vegan };
  }, [allOffers, data.offers]);

  const dietCounts = useMemo(() => {
    const c = { all: allOffers.length, vegan: 0, vegetarisch: 0, fleisch: 0 };
    for (const o of allOffers) if (o.diet_tag && c[o.diet_tag] !== undefined) c[o.diet_tag]++;
    return c;
  }, [allOffers]);

  // Label-Nachschlagewerk für aktive Filter-Tags (auch wenn die Kategorie gerade 0 Treffer hat)
  const categoryLabels = useMemo(() => {
    const map = {};
    for (const o of allOffers) if (o.category) map[o.category] = o.category_label || o.category;
    return map;
  }, [allOffers]);

  // Basis-Filter ohne die jeweils eigene Dimension → für facettierte Zähler
  function applyBase(list, { skipStores = false, skipCats = false } = {}) {
    const q = query.trim().toLowerCase();
    let out = list;
    if (!skipStores && activeStores.length) out = out.filter((o) => activeStores.includes(o.store));
    if (!skipCats && activeCats.length) out = out.filter((o) => activeCats.includes(o.category));
    if (diet !== 'all') out = out.filter((o) => o.diet_tag === diet);
    if (onlyFood) out = out.filter((o) => !NON_FOOD_CATEGORIES.has(o.category));
    if (onlyFavorites) out = out.filter((o) => favoriteKeys.has(favKey(o.name, o.brand)));
    if (q) out = out.filter((o) => matchesQuery(o, q));
    return out;
  }

  const storeFacets = useMemo(() => {
    const base = applyBase(allOffers, { skipStores: true });
    const counts = new Map();
    for (const o of base) counts.set(o.store, (counts.get(o.store) || 0) + 1);
    return Object.keys(data.offers)
      .map((store) => ({
        key: store,
        label: labels[store] || store,
        count: counts.get(store) || 0,
        total: (data.offers[store] || []).length,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOffers, data.offers, labels, activeStores, activeCats, diet, onlyFood, onlyFavorites, favoriteKeys, query]);

  const categoryFacets = useMemo(() => {
    const base = applyBase(allOffers, { skipCats: true });
    const counts = new Map();
    for (const o of base) {
      if (!o.category) continue;
      const entry = counts.get(o.category) || { key: o.category, label: o.category_label || o.category, count: 0 };
      entry.count++;
      counts.set(o.category, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOffers, activeStores, activeCats, diet, onlyFood, onlyFavorites, favoriteKeys, query]);

  const visible = useMemo(() => {
    const list = applyBase(allOffers);
    const sorted = [...list];
    if (sortBy === 'discount') sorted.sort((a, b) => (b.discount_percent ?? -1) - (a.discount_percent ?? -1));
    else if (sortBy === 'price') sorted.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sortBy === 'store') {
      sorted.sort((a, b) => {
        const la = labels[a.store] || a.store;
        const lb = labels[b.store] || b.store;
        return la.localeCompare(lb) || (a.price ?? 0) - (b.price ?? 0);
      });
    }
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOffers, activeStores, activeCats, diet, onlyFood, onlyFavorites, favoriteKeys, query, sortBy, labels]);

  // Nur die tatsächlich gerenderten Karten abfragen (max. 120 pro Seite)
  const rendered = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);

  useEffect(() => {
    if (rendered.length === 0) return;
    const uniq = [];
    const seen = new Set();
    for (const o of rendered) {
      const k = favKey(o.name, o.brand);
      if (!seen.has(k)) { seen.add(k); uniq.push({ name: o.name, brand: o.brand || null }); }
    }
    const controller = new AbortController();
    if (priceTimer.current) clearTimeout(priceTimer.current);
    priceTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/recipe/api/offers/price-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: uniq.slice(0, 200), days: 365 }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (json.items) setPriceStats((prev) => ({ ...prev, ...json.items }));
      } catch (e) {
        // Abort ist kein Fehler; alles andere bleibt Beiwerk, Karten funktionieren weiter
        if (e?.name !== 'AbortError') { /* still */ }
      }
    }, 350);
    return () => {
      if (priceTimer.current) clearTimeout(priceTimer.current);
      controller.abort();          // verhindert, dass eine alte Antwort neuere Daten überschreibt
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

  // Zählt genau das, was auch als Tag in der Trefferzeile steht
  const activeFilterCount = activeStores.length + activeCats.length + (diet !== 'all' ? 1 : 0) + (onlyFavorites ? 1 : 0);

  function toggleIn(listName, key) {
    const current = filters[listName];
    update({ [listName]: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] });
  }

  useEffect(() => {
    fetch('/recipe/api/offers/region')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.plz) { setRegion(j); setRegionInput(j.plz); } })
      .catch(() => {});
  }, []);

  async function saveRegion() {
    const plz = regionInput.trim();
    if (!/^\d{5}$/.test(plz)) { setRegionMsg('Bitte eine fünfstellige PLZ eingeben.'); return; }
    setRegionSaving(true);
    setRegionMsg('');
    try {
      const res = await fetch('/recipe/api/offers/region', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plz }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setRegionMsg('Es läuft gerade ein Scrape — bitte kurz warten und erneut übernehmen.');
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Konnte PLZ nicht speichern');
      setRegion({ plz: json.plz });
      setRegionMsg('Gespeichert — Angebote werden neu eingelesen …');
      await startScrape();
      setRegionMsg(`Angebote gelten jetzt für PLZ ${json.plz}.`);
    } catch (e) {
      setRegionMsg(e.message);
    } finally {
      setRegionSaving(false);
    }
  }

  async function startScrape() {
    try {
      setScraping(true);
      const res = await fetch('/recipe/api/offers/scrape', { method: 'POST' });
      const json = await res.json();
      if (res.status === 409) { setProgress(json.progress || null); pollProgress(); return; }
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
    ? new Date(data.lastUpdated).toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }).replace(',', '')
    : '–';

  const shownStores = storeFacets.filter((s) =>
    !storeSearch.trim() ? s.count > 0 || activeStores.includes(s.key)
      : s.label.toLowerCase().includes(storeSearch.trim().toLowerCase()));

  return (
    <div className="offers-page">
      <header className="offers-head">
        <div>
          <h1 className="offers-title">🏷️ Angebote</h1>
          <p className="offers-stats">
            <strong>{totals.count.toLocaleString('de-DE')}</strong> Angebote
            <span className="offers-dot">·</span>
            Stand {lastUpdatedText}
            {region.plz && (
              <>
                <span className="offers-dot">·</span>
                <span className="offers-stats-region" title="Postleitzahl, für die die Angebote gelten">PLZ {region.plz}</span>
              </>
            )}
            {totals.vegan > 0 && (
              <>
                <span className="offers-dot">·</span>
                <span className="offers-stats-vegan">🌱 {totals.vegan.toLocaleString('de-DE')} vegan</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="offers-refresh"
          onClick={startScrape}
          disabled={scraping}
          aria-label="Angebote neu einlesen"
        >
          <span aria-hidden="true">↻</span> {scraping ? 'Läuft…' : 'Neu einlesen'}
        </button>
      </header>

      {progress && progress.status === 'running' && (
        <div className="offers-progress" role="status">
          <div className="offers-progress-bar" style={{ width: `${progress.progress || 0}%` }} />
          <span>{progress.message || 'Sammle Angebote…'}</span>
        </div>
      )}

      {error && (
        <div className="offers-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load}>Erneut versuchen</button>
        </div>
      )}

      <div className="offers-controls">
        <input
          className="offers-search"
          id="offers-search"
          type="search"
          aria-label="Produkt oder Marke suchen"
          placeholder="Produkt oder Marke suchen…"
          value={query}
          onChange={(e) => update({ query: e.target.value })}
        />

        <div className="offers-segment" role="group" aria-label="Ernährung filtern">
          {[
            { key: 'all', label: 'Alle' },
            { key: 'vegan', label: '🌱 Vegan' },
            { key: 'vegetarisch', label: '🥚 Vegetarisch' },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`offers-segment-btn${diet === opt.key ? ' is-active' : ''}`}
              aria-pressed={diet === opt.key}
              onClick={() => update({ diet: opt.key })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`offers-filterbtn${activeFilterCount > 0 ? ' has-filters' : ''}`}
          onClick={() => setFilterOpen(true)}
          aria-haspopup="dialog"
        >
          Filter
          {activeFilterCount > 0 && <span className="offers-filterbadge">{activeFilterCount}</span>}
        </button>
      </div>

      <div className="offers-resultbar">
        <span className="offers-resultcount" role="status" aria-live="polite">
          {visible.length.toLocaleString('de-DE')} Treffer
        </span>

        <div className="offers-activefilters">
          {activeStores.map((key) => (
            <button type="button" key={`s-${key}`} className="offers-tag" onClick={() => toggleIn('stores', key)}>
              {labels[key] || key} <span aria-hidden="true">×</span>
            </button>
          ))}
          {activeCats.map((key) => (
            <button type="button" key={`c-${key}`} className="offers-tag" onClick={() => toggleIn('categories', key)}>
              {categoryLabels[key] || key} <span aria-hidden="true">×</span>
            </button>
          ))}
          {onlyFavorites && (
            <button type="button" className="offers-tag" onClick={() => update({ onlyFavorites: false })}>
              ♥ Merkliste <span aria-hidden="true">×</span>
            </button>
          )}
          {onlyFood && (
            <button type="button" className="offers-tag" onClick={() => update({ onlyFood: false })}>
              nur Lebensmittel <span aria-hidden="true">×</span>
            </button>
          )}
          {(activeStores.length > 0 || activeCats.length > 0 || diet !== 'all' || !onlyFood || onlyFavorites || query) && (
            <button type="button" className="offers-resetall" onClick={resetFilters}>Alles zurücksetzen</button>
          )}
        </div>

        <label className="offers-sort">
          <span className="offers-visually-hidden">Sortierung</span>
          <select value={sortBy} onChange={(e) => update({ sortBy: e.target.value })}>
            <option value="discount">Ersparnis</option>
            <option value="price">Preis</option>
            <option value="store">Markt</option>
          </select>
        </label>
      </div>

      <dialog
        className="offers-sheet"
        ref={dialogRef}
        onClose={() => setFilterOpen(false)}
        onClick={(e) => { if (e.target === dialogRef.current) setFilterOpen(false); }}
      >
        <div className="offers-sheet-inner">
          <header className="offers-sheet-head">
            <h2>Filter</h2>
            <button type="button" className="offers-sheet-close" onClick={() => setFilterOpen(false)} aria-label="Filter schließen">×</button>
          </header>

          <div className="offers-sheet-body">
            <section className="offers-sheet-section">
              <h3>Kette</h3>
              {storeFacets.length > 8 && (
                <input
                  type="search"
                  className="offers-sheet-search"
                  placeholder="Kette suchen…"
                  aria-label="Kette suchen"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                />
              )}
              <div className="offers-sheet-chips">
                {shownStores.map((s) => (
                  <button
                    type="button"
                    key={s.key}
                    className={`offers-chip${activeStores.includes(s.key) ? ' is-active' : ''}${s.count === 0 ? ' is-empty' : ''}`}
                    aria-pressed={activeStores.includes(s.key)}
                    onClick={() => toggleIn('stores', s.key)}
                    disabled={s.count === 0 && !activeStores.includes(s.key)}
                  >
                    <span className="offers-dotcolor" style={{ background: STORE_COLORS[s.key] || '#8a7b6c' }} aria-hidden="true" />
                    {s.label}
                    <span className="offers-chip-count">{s.count}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="offers-sheet-section">
              <h3>Warengruppe</h3>
              <div className="offers-sheet-chips">
                {categoryFacets.map((c) => (
                  <button
                    type="button"
                    key={c.key}
                    className={`offers-chip${activeCats.includes(c.key) ? ' is-active' : ''}${c.count === 0 ? ' is-empty' : ''}`}
                    aria-pressed={activeCats.includes(c.key)}
                    onClick={() => toggleIn('categories', c.key)}
                    disabled={c.count === 0 && !activeCats.includes(c.key)}
                  >
                    {c.label}
                    <span className="offers-chip-count">{c.count}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="offers-sheet-section">
              <h3>Weitere</h3>
              <label className="offers-check">
                <input type="checkbox" checked={onlyFood} onChange={(e) => update({ onlyFood: e.target.checked })} />
                nur Lebensmittel (ohne Non-Food, Drogerie, Rabatt-Aktionen)
              </label>
              <label className="offers-check">
                <input
                  type="checkbox"
                  checked={onlyFavorites}
                  onChange={(e) => update({ onlyFavorites: e.target.checked })}
                />
                ♥ nur Merkliste ({favorites.length})
              </label>
            </section>

            <section className="offers-sheet-section">
              <h3>Region</h3>
              <p className="offers-sheet-hint">
                Angebote gelten für diese Postleitzahl — je nach Region unterscheiden sich die Prospekte.
              </p>
              <label className="offers-region-label" htmlFor="offers-region-input">Postleitzahl</label>
              <div className="offers-region">
                <input
                  id="offers-region-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  value={regionInput}
                  onChange={(e) => setRegionInput(e.target.value.replace(/\D/g, ''))}
                  aria-label="Postleitzahl"
                  placeholder="56377"
                />
                <button
                  type="button"
                  className="offers-region-save"
                  onClick={saveRegion}
                  disabled={regionSaving || regionInput === region.plz}
                >
                  {regionSaving ? 'Lädt …' : 'Übernehmen'}
                </button>
              </div>
              {region.plz && regionInput === region.plz && (
                <p className="offers-region-active">Aktiv: PLZ {region.plz}</p>
              )}
              {regionMsg && <p className="offers-region-msg" role="status">{regionMsg}</p>}
            </section>
          </div>

          <footer className="offers-sheet-foot">
            <button type="button" className="offers-sheet-clear" onClick={resetFilters}>Zurücksetzen</button>
            <button type="button" className="offers-sheet-apply" onClick={() => setFilterOpen(false)}>
              Fertig · {visible.length.toLocaleString('de-DE')} Treffer
            </button>
          </footer>
        </div>
      </dialog>

      {loading ? (
        <div className="offers-grid" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="offer-card offer-skeleton" key={i}>
              <div className="sk sk-top" />
              <div className="sk sk-line" />
              <div className="sk sk-line short" />
              <div className="sk sk-price" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="offers-empty">
          <p>Keine Angebote für diese Auswahl.</p>
          {totals.count === 0 ? (
            <p className="offers-empty-hint">Noch keine Daten — „Neu einlesen" starten.</p>
          ) : (
            <button type="button" className="offers-empty-reset" onClick={resetFilters}>Filter zurücksetzen</button>
          )}
        </div>
      ) : (
        <>
          <div className="offers-grid">
            {visible.slice(0, visibleCount).map((o, i) => {
              const validTo = formatValidTo(o.valid_to);
              const uvp = oldPriceLabel(o.old_price_source);
              const dietMeta = o.diet_tag ? DIET_META[o.diet_tag] : null;
              const stat = priceStats[favKey(o.name, o.brand)];
              const isFav = favoriteKeys.has(favKey(o.name, o.brand));
              // "Tiefstpreis" erst, wenn der Verlauf wirklich eine Zeitspanne abdeckt —
              // sonst wäre jede Karte aus dem heutigen Scrape ein "Tiefstpreis".
              const spanDays = stat && stat.firstAt && stat.lastAt
                ? (new Date(stat.lastAt) - new Date(stat.firstAt)) / 86400000
                : 0;
              const isLowest = Boolean(
                stat && stat.count >= 4 && spanDays >= 21 && stat.min != null
                && typeof o.price === 'number' && o.price <= stat.min + 0.005
              );
              return (
                <article className="offer-card" key={`${o.store}-${o.offer_id || o.name}-${i}`}>
                  <div className="offer-top">
                    <span className="offer-store">
                      <span className="offers-dotcolor" style={{ background: STORE_COLORS[o.store] || '#8a7b6c' }} aria-hidden="true" />
                      {labels[o.store] || o.store}
                    </span>
                    <span className="offer-actions">
                      {dietMeta && (
                        <span className={`offer-diet offer-diet-${o.diet_tag}`} aria-label={dietMeta.label} title={dietMeta.label}>
                          {dietMeta.icon}
                        </span>
                      )}
                      <button
                        type="button"
                        className={`offer-heart${isFav ? ' is-fav' : ''}`}
                        onClick={() => toggleFavorite(o)}
                        aria-pressed={isFav}
                        aria-label={isFav ? `${o.name} von der Merkliste entfernen` : `${o.name} zur Merkliste`}
                        title={isFav ? 'Von der Merkliste entfernen' : 'Zur Merkliste'}
                      >
                        {isFav ? '♥' : '♡'}
                      </button>
                    </span>
                  </div>

                  <h3 className="offer-name">{o.name}</h3>
                  {o.brand && <p className="offer-brand">{o.brand}</p>}

                  <div className="offer-bottom">
                    <div className="offer-price-row">
                      <span className="offer-price">{formatPrice(o.price)}</span>
                      {typeof o.original_price === 'number' && (
                        <span className="offer-old">
                          {formatPrice(o.original_price)}
                          {uvp && <span className="offer-uvp">{uvp}</span>}
                        </span>
                      )}
                      {typeof o.discount_percent === 'number' && (
                        <span className="offer-discount">−{Math.round(o.discount_percent)} %</span>
                      )}
                      {isLowest && <span className="offer-lowest">Tiefstpreis</span>}
                    </div>
                    <p className="offer-meta">
                      {stat && stat.weekly.length >= 2 && (
                        <span className="offer-trend" title={`Wochen-Tiefstpreise (${stat.count} Messungen, 365 Tage)`}>
                          <Sparkline points={stat.weekly} />
                          <span className="offer-trend-label">
                            {stat.min != null ? `Tief ${formatPrice(stat.min)}` : 'Verlauf'}
                          </span>
                        </span>
                      )}
                      {o.unit_price ? <span>{formatPrice(o.unit_price)}/{o.unit || 'Einh.'}</span> : null}
                      {validTo ? <span>bis {validTo}</span> : null}
                      {o.upcoming ? <span className="offer-upcoming">ab nächster Woche</span> : null}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          {visible.length > visibleCount && (
            <div className="offers-more">
              <button type="button" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Mehr anzeigen ({visible.length - visibleCount} weitere)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
