import { useState, useEffect, useRef } from 'react';

export default function ProductSearch({ 
  onSelect,        // Callback(product) when user selects an OFF product
  onFreeText,      // Callback(item) when user chooses free-text instead
  placeholder = "Produkt suchen...",
  disabled = false
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState(null);
  
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search with server-side learning
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (query.trim().length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch learned products from server
        const learnedRes = await fetch('/recipe/api/learning?q=${encodeURIComponent(query)}&limit=15`);
        let learnedProducts = [];
        if (learnedRes.ok) {
          const learnedData = await learnedRes.json();
          learnedProducts = learnedData.products || [];
        }
        
        // Fetch from OFF API
        const offRes = await fetch('/recipe/api/products/search?q=${encodeURIComponent(query)}&limit=15`);
        if (!offRes.ok) throw new Error('OFF search failed');
        const offData = await offRes.json();
        const offProducts = offData.products || [];
        
        // Merge: learned first (they score higher), then OFF results
        const merged = [];
        const seenCodes = new Set();
        
        // Add learned items first
        for (const item of learnedProducts) {
          if (!seenCodes.has(item.off_product_code)) {
            merged.push({
              off_product_code: item.off_product_code,
              off_product_name: item.off_product_name || item.item,
              off_brand: item.off_brand,
              off_quantity: item.off_quantity,
              off_image_url: item.off_image_url || '',
              isLearned: true,
              code: item.off_product_code,
              name: item.off_product_name || item.item,
              brand: item.off_brand,
              quantity: item.off_quantity,
              imageUrl: item.off_image_url || ''
            });
            seenCodes.add(item.off_product_code);
          }
        }
        
        // Add OFF products that aren't already learned
        for (const p of offProducts) {
          if (!seenCodes.has(p.code)) {
            merged.push({
              ...p,
              isLearned: false
            });
            seenCodes.add(p.code);
          }
        }
        
        setResults(merged);
        setShowDropdown(true);
        setSelectedIndex(-1);
      } catch (err) {
        console.error('Product search error:', err);
        setError('Suche fehlgeschlagen');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  function handleKeyDown(e) {
    if (!showDropdown || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          selectProduct(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        break;
    }
  }

  function selectProduct(product) {
    // Enrich product on the backend (parses quantity, detects store, guesses category)
    setEnriching(true);
    fetch('/recipe/api/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    })
      .then(r => r.json())
      .then(enriched => {
        applyEnrichedSelection(product, enriched);
      })
      .catch(err => {
        console.error('Enrich failed, using raw product:', err);
        applyEnrichedSelection(product, {
          item: product.name,
          amount: '', unit: '', category: 'sonstiges', store: ''
        });
      });
  }

  function applyEnrichedSelection(product, enriched) {
    setEnriching(false);
    const shoppingItem = {
      item: enriched.item || product.name,
      amount: enriched.amount || '',
      unit: enriched.unit || '',
      category: enriched.category || 'sonstiges',
      store: enriched.store || '',
      off_product_name: product.name,
      off_product_code: product.code,
      off_brand: product.brand,
      off_quantity: product.quantity
    };
    
    // Learn this selection on server (use enriched category)
    fetch('/recipe/api/learning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        off_product_code: product.code,
        off_product_name: product.name,
        off_brand: product.brand,
        off_quantity: product.quantity,
        item: shoppingItem.item,
        category: shoppingItem.category
      })
    }).catch(err => console.error('Failed to learn product:', err));
    
    onSelect(shoppingItem);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  }

  function handleFreeText() {
    if (query.trim() && onFreeText) {
      onFreeText({ item: query.trim() });
      setQuery('');
      setResults([]);
      setShowDropdown(false);
    }
  }



  return (
    <div className="product-search" ref={dropdownRef}>
      <div className="product-search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="product-search-input"
          autoComplete="off"
        />
        {loading && <span className="search-loading">⏳</span>}
        {query.trim().length > 0 && !loading && (
          <button 
            className="search-clear-btn"
            onClick={() => { setQuery(''); setResults([]); setShowDropdown(false); inputRef.current?.focus(); }}
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {error && <div className="search-error">{error}</div>}

      {showDropdown && results.length > 0 && (
        <ul className="product-search-dropdown">
          {results.map((product, idx) => (
            <li 
              key={product.code}
              className={`product-result ${idx === selectedIndex ? 'selected' : ''} ${product.isLearned ? 'learned' : ''}`}
              onClick={() => selectProduct(product)}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              {product.imageUrl ? (
                <img 
                  src={product.imageUrl} 
                  alt="" 
                  className="product-thumb"
                  loading="lazy"
                />
              ) : (
                <span className="product-thumb-placeholder">{product.isLearned ? '📚' : '📦'}</span>
              )}
              <div className="product-info">
                <span className="product-name">{product.name}</span>
                {product.brand && <span className="product-brand">{product.brand}</span>}
                {product.quantity && <span className="product-quantity">{product.quantity}</span>}
                {product.isLearned && <span className="product-learned-badge">✨ Gelernt</span>}
              </div>
              {product.code && (
                <span className="product-barcode" title={`Barcode: ${product.code}`}>
                  📊
                </span>
              )}
            </li>
          ))}
          
          {query.trim().length >= 2 && (
            <li className="product-result freetext-result" onClick={handleFreeText}>
              <span className="product-thumb-placeholder">✏️</span>
              <div className="product-info">
                <span className="product-name">Freitext: "{query.trim()}"</span>
                <span className="product-brand">Manuell eingeben</span>
              </div>
            </li>
          )}
        </ul>
      )}

      {showDropdown && results.length === 0 && query.trim().length >= 2 && !loading && (
        <div className="search-no-results">
          <span>Keine Produkte gefunden für "{query}"</span>
          <button className="freetext-btn" onClick={handleFreeText}>
            Als Freitext anlegen
          </button>
        </div>
      )}

      <style>{`
        .product-search {
          position: relative;
          width: 100%;
        }
        
        .product-search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        
        .search-icon {
          position: absolute;
          left: 10px;
          font-size: 0.9rem;
          pointer-events: none;
        }
        
        .product-search-input {
          width: 100%;
          padding: 0.6rem 2.5rem 0.6rem 2.2rem;
          border: 2px solid var(--color-border, #ddd);
          border-radius: var(--radius, 8px);
          font-size: 0.95rem;
          font-family: var(--font-body);
          transition: border-color 0.2s;
        }
        
        .product-search-input:focus {
          outline: none;
          border-color: var(--color-accent, #B85C38);
        }
        
        .search-loading {
          position: absolute;
          right: 10px;
          font-size: 0.9rem;
        }
        
        .search-clear-btn {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          font-size: 0.8rem;
          opacity: 0.5;
        }
        
        .search-clear-btn:hover {
          opacity: 1;
        }
        
        .search-error {
          color: #b53a3a;
          font-size: 0.8rem;
          padding: 0.3rem 0;
        }
        
        .product-search-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1px solid var(--color-border, #ddd);
          border-radius: var(--radius, 8px);
          margin-top: 4px;
          padding: 4px 0;
          list-style: none;
          max-height: 320px;
          overflow-y: auto;
          z-index: 1000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .product-result {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.5rem 0.8rem;
          cursor: pointer;
          transition: background 0.1s;
        }
        
        .product-result:hover,
        .product-result.selected {
          background: var(--color-sepia, #f5f0e8);
        }
        
        .product-result.learned {
          background: linear-gradient(90deg, rgba(184, 92, 56, 0.08) 0%, transparent 100%);
        }
        
        .product-thumb {
          width: 36px;
          height: 36px;
          object-fit: contain;
          border-radius: 4px;
          background: #f0f0f0;
        }
        
        .product-thumb-placeholder {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          background: var(--color-sepia, #f5f0e8);
          border-radius: 4px;
        }
        
        .product-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        
        .product-name {
          font-weight: 500;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .product-brand {
          font-size: 0.75rem;
          color: var(--color-text-light, #666);
        }
        
        .product-quantity {
          font-size: 0.7rem;
          color: var(--color-text-light, #888);
        }
        
        .product-learned-badge {
          font-size: 0.65rem;
          color: var(--color-accent, #B85C38);
          font-weight: 600;
        }
        
        .product-barcode {
          font-size: 0.8rem;
          opacity: 0.4;
        }
        
        .freetext-result {
          border-top: 1px dashed var(--color-border, #ddd);
          margin-top: 4px;
          padding-top: 0.6rem;
        }
        
        .freetext-result .product-name {
          color: var(--color-accent, #B85C38);
        }
        
        .search-no-results {
          padding: 1rem;
          text-align: center;
          color: var(--color-text-light, #666);
          font-size: 0.85rem;
        }
        
        .freetext-btn {
          display: inline-block;
          margin-top: 0.5rem;
          padding: 0.4rem 1rem;
          background: var(--color-accent, #B85C38);
          color: white;
          border: none;
          border-radius: var(--radius, 8px);
          cursor: pointer;
          font-size: 0.85rem;
        }
        
        .freetext-btn:hover {
          background: var(--color-accent-light, #9a4d2f);
        }
      `}</style>
    </div>
  );
}