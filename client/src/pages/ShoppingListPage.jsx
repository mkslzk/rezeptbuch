import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Modal from '../components/Modal.jsx';
import ProductSearch from '../components/ProductSearch.jsx';

const STORE_LABELS = {
  aldi: '🅰️ ALDI',
  lidl: '🟠 LIDL',
  netto: '🟡 Netto',
  penny: '🟢 PENNY',
  norma: '🔵 NORMA',
  rewe: '🔴 REWE',
  edeka: '🟤 EDEKA',
  real: '🟣 real',
  kaufland: '🟠 Kaufland',
  metro: '⚫ METRO'
};

const STORE_ORDER = ['rewe', 'edeka', 'aldi', 'lidl', 'netto', 'penny', 'kaufland', 'metro', 'real', ''];

const CATEGORY_ORDER = ['produce', 'meat', 'dairy', 'plant', 'bakery', 'pantry', 'frozen', 'beverages', 'snacks', 'sonstiges'];
const CATEGORY_LABELS = {
  produce: '🥬 Obst & Gemüse',
  meat: '🥩 Fleisch & Fisch',
  dairy: '🧈 Milchprodukte',
  plant: '🌱 Plant-based',
  bakery: '🍞 Brot & Brötchen',
  pantry: '🫙 Vorrat',
  frozen: '❄️ Tiefkühl',
  beverages: '🥤 Getränke',
  snacks: '🍫 Snacks',
  sonstiges: '📦 Sonstiges'
};

const SESSION_KEY = 'moca-last-plan';

// ============================================================
// FUZZY MATCHING
// ============================================================
const STOPWORDS = new Set(['der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'mit', 'von', 'für', 'zu', 'am', 'im', 'an', 'auf', 'bis', 'nach', 'über', 'aus', 'bei', 'ist', 'sind', 'war', 'waren']);

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\bkg\b/g, 'kilogramm').replace(/\bl\b/g, 'liter').replace(/\bstück\b/g, 'stueck')
    .replace(/\bpkg\b/g, 'packung').replace(/\bg\b/g, 'gramm')
    .replace(/\d+/g, '#')
    .split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w)).join(' ');
}

function levenshteinSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lenA = a.length, lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;
  const matrix = Array(lenA + 1).fill(null).map(() => Array(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i-1][j] + 1, matrix[i][j-1] + 1, matrix[i-1][j-1] + cost);
    }
  }
  return 1 - matrix[lenA][lenB] / Math.max(lenA, lenB);
}

function fuzzyMatch(itemName, offerName) {
  const normItem = normalizeText(itemName);
  const normOffer = normalizeText(offerName);
  if (!normItem || !normOffer) return 0;
  
  const itemWords = normItem.split(/\s+/).filter(w => w.length > 2);
  const offerWords = normOffer.split(/\s+/).filter(w => w.length > 2);
  if (itemWords.length === 0 || offerWords.length === 0) return 0;
  
  let score = 0;
  for (const iw of itemWords) {
    let best = 0;
    for (const ow of offerWords) {
      if (ow.includes(iw) || iw.includes(ow)) {
        best = Math.max(best, 2);
      } else {
        best = Math.max(best, levenshteinSimilarity(iw, ow));
      }
    }
    score += best;
  }
  return score / itemWords.length;
}

function isEigenmarkenDeal(store, productName, price, eigenmarkenPrices) {
  if (!productName || !price) return false;
  const key = store + ':' + productName.toLowerCase();
  const refPrice = eigenmarkenPrices[key];
  return !!(refPrice && price < refPrice);
}

function getEigenmarkenSavings(store, productName, price, eigenmarkenPrices) {
  if (!productName || !price) return null;
  const key = store + ':' + productName.toLowerCase();
  const refPrice = eigenmarkenPrices[key];
  if (!refPrice || price >= refPrice) return null;
  return ((refPrice - price) / refPrice * 100).toFixed(0);
}

function matchItemToOffers(itemName, offers) {
  if (!offers) return [];
  const matches = [];
  for (const [store, storeOffers] of Object.entries(offers)) {
    for (const offer of storeOffers) {
      const score = fuzzyMatch(itemName, offer.name);
      if (score > 0.3) {
        matches.push({
          store,
          name: offer.name,
          price: offer.price,
          matchScore: score
        });
      }
    }
  }
  matches.sort((a, b) => b.matchScore - a.matchScore || a.price - b.price);
  return matches.slice(0, 3);
}

function getKW(date) {
  if (!date) return '';
  let d;
  if (typeof date === 'string') {
    d = new Date(date + 'T00:00:00');
  } else {
    d = new Date(date);
    d.setHours(0, 0, 0, 0);
  }
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - yearStart) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + yearStart.getDay() + 1) / 7);
}

export default function ShoppingListPage() {
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ item: '', amount: '', unit: '', category: 'sonstiges', store: '', off_product_code: '' });
  const [searchParams] = useSearchParams();
  
  // Offers state
  const [offersData, setOffersData] = useState(null);
  const [eigenmarkenPrices, setEigenmarkenPrices] = useState({});
  const [offersLoading, setOffersLoading] = useState(false);
  const [showOffers, setShowOffers] = useState(true);
  const [scrapeStatus, setScrapeStatus] = useState(null);
  const [scrapeLoading, setScrapeLoading] = useState(false);

  // Sort state: 'category' (default) or 'store'
  const [sortMode, setSortMode] = useState('category');

  // Check-off behavior: removing the item from the active list with undo
  const [purchasedCount, setPurchasedCount] = useState(0);
  const [removingId, setRemovingId] = useState(null);
  const [undoItem, setUndoItem] = useState(null); // { item, listId, timeoutId }
  const undoTimerRef = useRef(null);

  useEffect(() => {
    fetchMealPlans();
    
    const planIdParam = searchParams.get('planId');
    if (planIdParam) {
      sessionStorage.setItem(SESSION_KEY, planIdParam);
      loadListForPlan(planIdParam);
    } else {
      const savedPlanId = sessionStorage.getItem(SESSION_KEY);
      if (savedPlanId) {
        loadListForPlan(savedPlanId);
      } else {
        autoLoadNewest();
      }
    }
    
    fetchOffers();
  }, []);

  async function fetchOffers() {
    setOffersLoading(true);
    try {
      const res = await fetch('/recipe/api/offers');
      const data = await res.json();
      setOffersData(data);
    } catch (e) {
      console.error('Failed to fetch offers:', e);
    }
    setOffersLoading(false);
  }

  async function handleRefreshOffers() {
    setScrapeLoading(true);
    setScrapeStatus({ type: 'loading', msg: 'Lädt...' });
    try {
      const res = await fetch('/recipe/api/offers/scrape', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScrapeStatus({ type: 'success', msg: `${data.totalOffers} Angebote von ${data.storesScraped} Läden aktualisiert` });
        fetchOffers();
      } else {
        setScrapeStatus({ type: 'error', msg: 'Fehler beim Aktualisieren' });
      }
    } catch (e) {
      setScrapeStatus({ type: 'error', msg: 'Fehler: ' + e.message });
    }
    setScrapeLoading(false);
    setTimeout(() => setScrapeStatus(null), 5000);
  }

  async function autoLoadNewest() {
    try {
      const listsRes = await fetch('/recipe/api/shopping-lists');
      const lists = await listsRes.json();
      if (Array.isArray(lists) && lists.length > 0) {
        const newest = lists[0];
        if (newest.meal_plan_id) {
          await loadListForPlan(newest.meal_plan_id);
        } else {
          await loadList(newest.id);
        }
        return;
      }
    } catch {}
    
    try {
      const plansRes = await fetch('/recipe/api/meal-plans');
      const plans = await plansRes.json();
      if (Array.isArray(plans) && plans.length > 0) {
        await loadListForPlan(plans[0].id);
        return;
      }
    } catch {}
  }

  async function fetchMealPlans() {
    try {
      const res = await fetch('/recipe/api/meal-plans');
      const plans = await res.json();
      setMealPlans(Array.isArray(plans) ? plans : []);
    } catch {}
  }

  async function loadListForPlan(planId) {
    if (!planId) {
      loadOrCreateList();
      return;
    }

    setSelectedPlanId(planId);
    
    try {
      const res = await fetch(`/recipe/api/shopping-lists?meal_plan_id=${planId}`);
      const existingList = await res.json();
      if (existingList && existingList.id) {
        setList(existingList);
        setItems(existingList.items || []);
        return;
      }
    } catch {}

    try {
      const res = await fetch('/recipe/api/shopping-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meal_plan_id: planId })
      });
      const newList = await res.json();
      setList(newList);
      setItems([]);
    } catch {}
  }

  async function loadList(id) {
    if (!id) {
      setList(null);
      setItems([]);
      setSelectedPlanId('');
      return;
    }
    try {
      const res = await fetch(`/recipe/api/shopping-lists?meal_plan_id=${id}`);
      const data = await res.json();
      if (data) {
        setList(data);
        setItems(data.items || []);
        setSelectedPlanId(data.meal_plan_id || id);
      }
    } catch (err) {
      console.error('loadList error:', err);
    }
  }

  function loadOrCreateList() {
    setList(null);
    setItems([]);
    setSelectedPlanId('');
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function handleGenerate() {
    if (!selectedPlanId || !list) return;
    try {
      const res = await fetch(`/recipe/api/shopping-lists/${list.id}/generate`, { method: 'POST' });
      const updated = await res.json();
      setItems(updated.items || []);
    } catch {}
  }

  async function handlePlanSelect(planId) {
    if (!planId) {
      loadOrCreateList();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, planId);
    await loadListForPlan(planId);
  }

  async function toggleItem(itemId, checked) {
    if (!list) return;

    if (checked) {
      // Mark as purchased → DELETE from list with fade-out + undo
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      // Clear any previous undo timer
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }

      // Start fade-out animation
      setRemovingId(itemId);

      // After 300ms (animation duration), actually remove from state + DELETE on server
      setTimeout(async () => {
        try {
          await fetch(`/recipe/api/shopping-lists/${list.id}/items/${itemId}`, { method: 'DELETE' });
        } catch (err) {
          console.error('Failed to delete item:', err);
        }
        setItems(prev => prev.filter(i => i.id !== itemId));
        setRemovingId(null);
        setPurchasedCount(c => c + 1);

        // Setup undo (4 seconds)
        const timeoutId = setTimeout(() => {
          setUndoItem(null);
          undoTimerRef.current = null;
        }, 4000);
        undoTimerRef.current = timeoutId;
        setUndoItem({ item: { ...item }, listId: list.id, timeoutId });
      }, 300);
    } else {
      // Uncheck (legacy path; not used now since checked items are deleted)
      try {
        await fetch(`/recipe/api/shopping-lists/${list.id}/items/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checked: 0 })
        });
        setItems(items.map(i => i.id === itemId ? { ...i, checked: 0 } : i));
      } catch {}
    }
  }

  async function undoLastRemoval() {
    if (!undoItem) return;
    const { item, listId, timeoutId } = undoItem;

    // Cancel timeout
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoItem(null);

    // Re-add the item via POST
    try {
      const res = await fetch(`/recipe/api/shopping-lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: item.item,
          amount: item.amount || '',
          unit: item.unit || '',
          category: item.category || 'sonstiges',
          store: item.store || '',
          off_product_name: item.off_product_name || null,
          off_product_code: item.off_product_code || null,
          off_brand: item.off_brand || null,
          off_quantity: item.off_quantity || null
        })
      });
      const restored = await res.json();
      setItems(prev => [...prev, restored]);
      setPurchasedCount(c => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to restore item:', err);
    }
  }

  function dismissUndo() {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoItem(null);
  }

  async function deleteItem(itemId) {
    if (!list) return;
    if (!window.confirm('Eintrag löschen?')) return;
    try {
      await fetch(`/recipe/api/shopping-lists/${list.id}/items/${itemId}`, { method: 'DELETE' });
      setItems(items.filter(i => i.id !== itemId));
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  }

  async function updateItem(itemId, updates) {
    if (!list) return;
    try {
      const res = await fetch(`/recipe/api/shopping-lists/${list.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const updated = await res.json();
      setItems(items.map(i => i.id === itemId ? { ...i, ...updated } : i));
    } catch (err) {
      console.error('Failed to update item:', err);
    }
  }

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItem.item.trim()) return;
    try {
      const res = await fetch(`/recipe/api/shopping-lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      const added = await res.json();
      setItems([...items, added]);
      setNewItem({ item: '', amount: '', unit: '', category: 'sonstiges', store: '', off_product_code: '' });
      setShowAddModal(false);
    } catch {}
  }

  async function handleClearAll() {
    if (!list || items.length === 0) return;
    if (!window.confirm(`Alle ${items.length} Einträge löschen?`)) return;
    setScrapeStatus({ type: 'loading', msg: `Leere ${items.length} Einträge...` });
    try {
      const results = await Promise.allSettled(items.map(item =>
        fetch(`/recipe/api/shopping-lists/${list.id}/items/${item.id}`, { method: 'DELETE' })
      ));
      const failed = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok));
      setItems([]);
      if (failed.length > 0) {
        setScrapeStatus({ type: 'error', msg: `${items.length - failed.length} gelöscht, ${failed.length} fehlgeschlagen` });
      } else {
        setScrapeStatus({ type: 'success', msg: `${items.length} Einträge gelöscht` });
      }
    } catch (err) {
      console.error('Failed to clear items:', err);
      setScrapeStatus({ type: 'error', msg: 'Fehler beim Leeren' });
    }
    setTimeout(() => setScrapeStatus(null), 4000);
  }

  // ============================================================
  // GROUPING: by category OR by store
  // ============================================================
  
  // Pre-compute offers for all unchecked items
  const itemsWithOffers = items
    .filter(i => !i.checked)
    .map(item => ({
      ...item,
      matchedOffers: offersData?.offers 
        ? matchItemToOffers(item.item, offersData.offers)
        : []
    }));

  // Calculate total price from all matched offers
  const totalPrice = itemsWithOffers.reduce((sum, item) => {
    if (item.matchedOffers && item.matchedOffers.length > 0) {
      return sum + (item.matchedOffers[0].price || 0);
    }
    return sum;
  }, 0);

  // Group by category (default)
  function groupByCategory(itemList) {
    const groups = {};
    for (const item of itemList) {
      const cat = item.category || 'sonstiges';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    // Sort categories by CATEGORY_ORDER
    return Object.entries(groups).sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  // Group by store
  function groupByStore(itemList) {
    const groups = {};
    for (const item of itemList) {
      const store = item.store || '';
      if (!groups[store]) groups[store] = [];
      groups[store].push(item);
    }
    // Sort stores by STORE_ORDER
    return Object.entries(groups).sort(([a], [b]) => {
      const ia = STORE_ORDER.indexOf(a);
      const ib = STORE_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }

  const grouped = sortMode === 'category' 
    ? groupByCategory(items)
    : groupByStore(items);

  const checkedCount = items.filter(i => i.checked).length;
  const uncheckedItems = items.filter(i => !i.checked);

  // ============================================================
  // ITEM ROW: new layout
  // ============================================================
  function ItemRow({ item }) {
    const itemWithOffers = itemsWithOffers.find(i => i.id === item.id) || item;
    const matchedOffers = itemWithOffers.matchedOffers || [];
    const bestOffer = matchedOffers[0];
    
    // Store label from STORE_LABELS
    const storeLabel = item.store ? (STORE_LABELS[item.store] || item.store) : (bestOffer ? (STORE_LABELS[bestOffer.store] || bestOffer.store) : '');

    return (
      <li className={`shopping-item ${item.checked ? 'checked' : ''} ${removingId === item.id ? 'removing' : ''}`}>
        <div className="item-row-label">
          <div className="item-text">
            <span className="item-name">{item.item}</span>
            {item.off_brand && <span className="item-brand">{item.off_brand}</span>}
          </div>
          
          <div className="item-right">
            {bestOffer ? (
              <span className="item-price-badge">
                {storeLabel} · {bestOffer.price.toFixed(2)}€
              </span>
            ) : storeLabel ? (
              <span className="item-store-badge">{storeLabel}</span>
            ) : null}
          </div>
                </div>
        
        <div className="item-actions-row">
          <input
            type="checkbox"
            className="item-row-checkbox"
            checked={Boolean(item.checked)}
            onChange={e => toggleItem(item.id, e.target.checked)}
            title="Erledigt"
          />
          <input
            type="text"
            className="item-amount-input"
            value={item.amount || ''}
            onChange={e => updateItem(item.id, { amount: e.target.value })}
            placeholder="Menge"
          />
          <input
            type="text"
            className="item-unit-input"
            value={item.unit || ''}
            onChange={e => updateItem(item.id, { unit: e.target.value })}
            placeholder="Einheit"
          />
          <select 
            value={item.store || ''} 
            onChange={e => updateItem(item.id, { store: e.target.value })}
            className="item-store-select"
          >
            <option value="">— Laden —</option>
            {Object.entries(STORE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button 
            className="btn-icon btn-delete" 
            onClick={() => deleteItem(item.id)}
            title="Löschen"
          >🗑️</button>
        </div>
        
        {/* Inline Angebote */}
        {showOffers && matchedOffers.length > 1 && (
          <div className="item-offers-inline">
            {matchedOffers.slice(1).map((offer, idx) => (
              <span key={idx} className={`offer-chip-inline ${isEigenmarkenDeal(offer.store, item.item, offer.price, eigenmarkenPrices) ? 'eigenmarken-deal' : ''}`}>
                <span className="offer-store-badge">{STORE_LABELS[offer.store] || offer.store}</span>
                <span className="offer-price">{offer.price?.toFixed(2)}€</span>
              </span>
            ))}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="shopping-list-page">
      <div className="page-header">
        <h1>🛒 Einkaufsliste</h1>
        <Link to="/meal-plan" className="btn btn-secondary">← Essensplan</Link>
      </div>

      <div className="list-controls">
        <select value={selectedPlanId} onChange={e => handlePlanSelect(e.target.value)}>
          <option value="">— Essensplan wählen —</option>
          {mealPlans.map(p => (
            <option key={p.id} value={p.id}>KW {getKW(p.week_start)} – {p.week_start}</option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={!list}>
          Generieren
        </button>
        <button className="btn btn-secondary" onClick={() => {
          sessionStorage.removeItem(SESSION_KEY);
          handlePlanSelect('');
        }}>+ Neue Liste</button>
      </div>

      <div className="sort-toggle-row">
        <span className="sort-label">Sortierung:</span>
        <button 
          className={`sort-btn ${sortMode === 'category' ? 'active' : ''}`}
          onClick={() => setSortMode('category')}
        >
          Nach Kategorie
        </button>
        <button 
          className={`sort-btn ${sortMode === 'store' ? 'active' : ''}`}
          onClick={() => setSortMode('store')}
        >
          Nach Laden
        </button>
        {totalPrice > 0 && (
          <span className="total-price-badge">
            💰 Summe: {totalPrice.toFixed(2)}€
          </span>
        )}
      </div>

      {scrapeStatus && (
        <div className={`status-message ${scrapeStatus.type}`}>
          {scrapeStatus.msg}
        </div>
      )}

      {items.length > 0 && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${items.length > 0 ? Math.min(100, (purchasedCount / (items.length + purchasedCount)) * 100) : 0}%` }} />
          <span>{items.length} offen{purchasedCount > 0 ? ` · ${purchasedCount} erledigt` : ''}</span>
        </div>
      )}

      {undoItem && (
        <div className="undo-toast" role="status" aria-live="polite">
          <span className="undo-icon">✓</span>
          <span className="undo-text">
            <strong>{undoItem.item.item}</strong> erledigt
          </span>
          <button className="undo-btn" onClick={undoLastRemoval}>
            ↶ Rückgängig
          </button>
          <button className="undo-dismiss" onClick={dismissUndo} title="Schließen">✕</button>
        </div>
      )}

      <div className="shopping-groups">
        {grouped.map(([groupKey, groupItems]) => {
          const groupLabel = sortMode === 'category' 
            ? (CATEGORY_LABELS[groupKey] || groupKey)
            : (STORE_LABELS[groupKey] || (groupKey === '' ? 'Ohne Laden' : groupKey));
          
          return (
            <div key={groupKey} className="shopping-group">
              <h4 className="group-header">{groupLabel}</h4>
              <ul className="shopping-items">
                {groupItems.map(item => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="empty-state">
            <p>Keine Einträge. Generiere eine Liste aus dem Essensplan oder füge manuell hinzu.</p>
          </div>
        )}
      </div>

      <div className="list-actions">
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Eintrag hinzufügen</button>
        {items.length > 0 && (
          <button className="btn btn-danger" onClick={handleClearAll}>🗑️ Leeren</button>
        )}
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="🛒 Neuer Eintrag">
        <form className="add-item-form" onSubmit={handleAddItem}>
          <ProductSearch 
            onSelect={(product) => {
              fetch('/recipe/api/learning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  off_product_code: product.off_product_code,
                  off_product_name: product.off_product_name,
                  off_brand: product.off_brand,
                  off_quantity: product.off_quantity || product.quantity,
                  item: product.item || product.off_product_name,
                  category: product.category || 'sonstiges'
                })
              }).catch(err => console.error('Failed to learn:', err));
              
              setNewItem({
                item: product.item || product.off_product_name,
                amount: product.amount || '',
                unit: product.unit || '',
                category: product.category || 'sonstiges',
                store: product.store || product.off_store || '',
                off_product_name: product.off_product_name,
                off_product_code: product.off_product_code || '',
                off_brand: product.off_brand,
                off_quantity: product.off_quantity
              });
            }}
            onFreeText={(data) => {
              setNewItem({ ...newItem, item: data.item });
            }}
            placeholder="Produkt suchen..."
            disabled={!list}
          />
          <div className="add-item-manual-toggle" onClick={() => setShowAddModal(false)}>
            <span>oder manuell eingeben</span>
          </div>
          <input placeholder="Zutat (manuell)" value={newItem.item} onChange={e => setNewItem({ ...newItem, item: e.target.value })} />
          <input placeholder="Menge" value={newItem.amount} onChange={e => setNewItem({ ...newItem, amount: e.target.value })} />
          <input placeholder="Einheit" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} />
          <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })}>
            {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <select value={newItem.store} onChange={e => setNewItem({ ...newItem, store: e.target.value })}>
            <option value="">— Laden —</option>
            {Object.entries(STORE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Hinzufügen</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Abbrechen</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}