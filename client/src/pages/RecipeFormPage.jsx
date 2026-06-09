import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getCategoryOptions, CATEGORY_KEYS, getCategoryLabel } from '../config/categories.js';
import { filterCommonIngredients } from '../config/commonIngredients.js';

const EMPTY_INGREDIENT = { item: '', amount: '', unit: '', category: 'produce' };
const CATEGORY_OPTIONS = getCategoryOptions();

// German ingredient categories (for zutaten)
const ING_CATEGORIES = ['produce', 'dairy', 'meat', 'bakery', 'pantry', 'frozen', 'beverages', 'snacks', 'sonstiges'];
const UNITS = ['', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stk', 'Prise', 'Bund', 'Dose', 'Glas', 'Päckchen'];

const STORE_EMOJI = {
  aldi: '🅰️', lidl: '🟠', netto: '🟡', penny: '🟢',
  norma: '🔵', rewe: '🔴', edeka: '🟤', real: '🟣', kaufland: '🟠', metro: '⚫'
};

export default function RecipeFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    title: '', description: '', image_url: '', category: '',
    servings: '', prep_time: '', cook_time: '', source_url: ''
  });
  const [ingredients, setIngredients] = useState([{ ...EMPTY_INGREDIENT }]);
  const [steps, setSteps] = useState(['']);
  const [tags, setTags] = useState('');
  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [importingVideo, setImportingVideo] = useState(false);
  const [videoImportStatus, setVideoImportStatus] = useState(null);
  const [videoImportProg, setVideoImportProg] = useState(null);
  const [activeJobId, setActiveJobId] = useState(() => sessionStorage.getItem('videoImportJobId') || null);

// Autocomplete for common ingredients
const [autocomplete, setAutocomplete] = useState({ items: [], activeRow: -1, activeIdx: -1 });
const ingInputRefs = useRef([]);

  const STAGE_LABELS = {
    start: 'Start', extract: 'Video extrahieren', download: 'Video herunterladen',
    transcribe: 'Transkribieren', recipe: 'Rezept extrahieren',
    done: 'Fertig', error: 'Fehler'
  };

  function ProgressBar({ progress }) {
    if (!progress) return null;
    const pct = typeof progress.progress === 'number' ? progress.progress : null;
    const stageLabel = STAGE_LABELS[progress.stage] || progress.stage;
    return (
      <div className="off-progress">
        <div className="off-progress-header">
          <span className="off-progress-stage">{stageLabel}</span>
          <span className="off-progress-message">{progress.message}</span>
        </div>
        {pct !== null ? (
          <div className="off-progress-bar-container">
            <div className="off-progress-bar" style={{ width: `${pct}%` }} />
          </div>
        ) : (
          <div className="off-progress-spinner">⏳</div>
        )}
        {pct !== null && <div className="off-progress-stats">{pct}%</div>}
      </div>
    );
  }

  // Resume an in-progress job after page reload / navigation
  useEffect(() => {
    if (!activeJobId || videoImportProg?.status !== 'running') return;
    const pollId = setInterval(async () => {
      try {
        const r = await fetch(`/recipe/api/recipes/import-video/progress?jobId=${activeJobId}`);
        const d = await r.json();
        if (!d.progress) { clearInterval(pollId); return; }
        setVideoImportProg(d.progress);
        if (d.progress.status === 'done' || d.progress.status === 'error') {
          clearInterval(pollId);
          if (d.progress.status === 'done') await fetchAndApplyResult(activeJobId);
          else setVideoImportStatus({ type: 'error', msg: d.progress.message });
        }
      } catch {}
    }, 2000);
    return () => clearInterval(pollId);
  }, [activeJobId]);

  async function fetchAndApplyResult(jobId) {
    const resR = await fetch(`/recipe/api/recipes/import-video/result/${jobId}`);
    const data = await resR.json();
    if (!resR.ok) throw new Error(data.error || 'Failed to fetch result');
    applyRecipeToForm(data);
    setVideoImportStatus({ type: 'success', msg: `✅ Rezept "${data.title}" importiert!` });
    sessionStorage.removeItem('videoImportJobId');
    setActiveJobId(null);
  }

  function applyRecipeToForm(data) {
    // For video imports: description falls back to the original TikTok/IG caption,
    // so the user has the full source text in the form for reference / manual edits.
    const caption = data.video_caption || '';
    setForm({
      title: data.title || '',
      description: data.description || caption,
      image_url: data.image_url || '',
      category: data.category || '',
      servings: data.servings || '',
      prep_time: data.prep_time || '',
      cook_time: data.cook_time || '',
      source_url: data.source_url || importUrl
    });
    if (data.image_url) setImagePreview(data.image_url);
    if (data.ingredients?.length) {
      const parsed = data.ingredients.map(i => ({ item: i, amount: '', unit: '', category: 'produce' }));
      setIngredients(parsed);
      matchIngredients(parsed);
    }
    if (data.steps?.length) setSteps(data.steps);
    setImportUrl('');
  }

  // Ingredient matching state (filled after import)
  const [ingredientMatches, setIngredientMatches] = useState({});
  const [matchingIngredients, setMatchingIngredients] = useState(false);

  useEffect(() => {
    if (id && id !== 'new') {
      fetch(`/recipe/api/recipes/${id}`)
        .then(r => r.json())
        .then(recipe => {
          setForm({
            title: recipe.title || '',
            description: recipe.description || '',
            image_url: recipe.image_url || '',
            category: recipe.category || '',
            servings: recipe.servings || '',
            prep_time: recipe.prep_time || '',
            cook_time: recipe.cook_time || '',
            source_url: recipe.source_url || ''
          });
          if (recipe.image_url) setImagePreview(recipe.image_url);
          try { setIngredients(JSON.parse(recipe.ingredients)); } catch { setIngredients([{ ...EMPTY_INGREDIENT }]); }
          try { setSteps(JSON.parse(recipe.steps)); } catch { setSteps(['']); }
          try { setTags(JSON.parse(recipe.tags).join(', ')); } catch { setTags(''); }
        })
        .catch(console.error);
    }
  }, [id]);

  async function handleImport() {
    if (!importUrl) return;
    setImporting(true);
    setIngredientMatches({});
    try {
      const res = await fetch('/recipe/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });
      const data = await res.json();
      setForm({
        title: data.title || '',
        description: data.description || '',
        image_url: data.image_url || '',
        category: data.category || '',
        servings: data.servings || '',
        prep_time: data.prep_time || '',
        cook_time: data.cook_time || '',
        source_url: data.source_url || importUrl
      });
      if (data.image_url) setImagePreview(data.image_url);
      if (data.ingredients?.length) {
        const parsed = data.ingredients.map(i => ({ item: i, amount: '', unit: '', category: 'produce' }));
        setIngredients(parsed);
        matchIngredients(parsed);
      }
      if (data.steps?.length) setSteps(data.steps);
      setImportUrl('');
    } catch (err) {
      alert('Import fehlgeschlagen: ' + err.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleVideoImport() {
    if (!importUrl) return;
    setImportingVideo(true);
    setVideoImportStatus(null);
    setVideoImportProg({ stage: 'start', status: 'running', message: 'Starte Import…', progress: 0 });
    setIngredientMatches({});
    let jobId = null;
    try {
      // Start job
      const res = await fetch('/recipe/api/recipes/import-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      jobId = data.jobId;
      sessionStorage.setItem('videoImportJobId', jobId);
      setActiveJobId(jobId);

      // Poll progress
      await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const r = await fetch(`/recipe/api/recipes/import-video/progress?jobId=${jobId}`);
            const d = await r.json();
            if (d.progress) {
              setVideoImportProg(d.progress);
              if (d.progress.status !== 'running') {
                clearInterval(poll);
                if (d.progress.status === 'done') resolve();
                else reject(new Error(d.progress.message || d.progress.error || 'Import fehlgeschlagen'));
              }
            }
          } catch {}
        }, 1500);
      });

      // Fetch & apply result
      const resR = await fetch(`/recipe/api/recipes/import-video/result/${jobId}`);
      const recipe = await resR.json();
      if (!resR.ok) throw new Error(recipe.error || 'Ergebnis nicht abrufbar');

      sessionStorage.removeItem('videoImportJobId');
      setActiveJobId(null);

      // Auto-saved on the server → navigate straight to the detail page
      if (recipe.recipe_id) {
        setVideoImportStatus({ type: 'success', msg: `✅ Rezept "${recipe.title}" gespeichert!` });
        navigate(`/recipe/${recipe.recipe_id}`);
        return;
      }

      // Fallback: no auto-save (older flow) — fill form for manual save
      applyRecipeToForm(recipe);
      setVideoImportStatus({ type: 'success', msg: `✅ Rezept "${recipe.title}" importiert! Bitte speichern.` });
    } catch (err) {
      setVideoImportStatus({ type: 'error', msg: err.message });
    } finally {
      setImportingVideo(false);
    }
  }

  async function cancelVideoImport() {
    if (!activeJobId) return;
    try {
      await fetch('/recipe/api/recipes/import-video/cancel', { method: 'POST' });
    } catch {}
  }

  function isVideoUrl(url) {
    return url && (url.includes('tiktok.com') || url.includes('instagram.com'));
  }


  async function matchIngredients(ings) {
    if (!ings || ings.length === 0) return;
    setMatchingIngredients(true);
    try {
      const res = await fetch('/recipe/api/ingredients/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients: ings })
      });
      const data = await res.json();
      const matchMap = {};
      data.results?.forEach(r => {
        if (r.matches && r.matches.length > 0) {
          matchMap[r.item_clean] = r.matches;
        }
      });
      setIngredientMatches(matchMap);
    } catch (e) {
      console.error('Ingredient matching failed:', e);
    }
    setMatchingIngredients(false);
  }

  function handleImageUrlChange(url) {
    setForm({ ...form, image_url: url });
    setImagePreview(url);
    setUploadedImageFile(null);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploadedImageFile(file);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
      setForm({ ...form, image_url: '' }); // Clear URL when file is selected
    };
    reader.readAsDataURL(file);
  }

  async function uploadImageFile(file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/recipe/api/uploads/image', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  }

  async function handleSubmit(e) {
    e.preventDefault();

    let finalImageUrl = form.image_url;

    // If a file is selected, upload it first via multipart
    if (uploadedImageFile) {
      try {
        const result = await uploadImageFile(uploadedImageFile);
        finalImageUrl = result.url;
      } catch (err) {
        alert('Bild-Upload fehlgeschlagen: ' + err.message);
        return;
      }
    }

    const payload = {
      ...form,
      image_url: finalImageUrl,
      servings: form.servings ? parseInt(form.servings) : null,
      prep_time: form.prep_time ? parseInt(form.prep_time) : null,
      cook_time: form.cook_time ? parseInt(form.cook_time) : null,
      ingredients,
      steps: steps.filter(s => s.trim()),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean)
    };

    try {
      const method = isEditing ? 'PUT' : 'POST';
      const url = isEditing ? `/recipe/api/recipes/${id}` : '/recipe/api/recipes';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      navigate(`/recipe/${result.id}`);
    } catch (err) {
      alert('Speichern fehlgeschlagen');
    }
  }

  function updateIngredient(i, field, val) {
    const updated = [...ingredients];
    updated[i] = { ...updated[i], [field]: val };
    setIngredients(updated);
    // Re-match when item changes
    if (field === 'item') {
      matchIngredients(updated);
    }
  }

  function addIngredient() { setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]); }
  function removeIngredient(i) { setIngredients(ingredients.filter((_, idx) => idx !== i)); }

function handleIngInputChange(i, value) {
  updateIngredient(i, 'item', value);
  if (value.length < 2) {
    setAutocomplete({ items: [], activeRow: -1, activeIdx: -1 });
    return;
  }
  const items = filterCommonIngredients(value, 8);
  setAutocomplete({ items, activeRow: i, activeIdx: -1 });
}

function selectAutocomplete(rowIdx, value) {
  updateIngredient(rowIdx, 'item', value);
  setAutocomplete({ items: [], activeRow: -1, activeIdx: -1 });
  ingInputRefs.current[rowIdx]?.focus();
}

function handleIngKeyDown(i, e) {
  const { items, activeRow, activeIdx } = autocomplete;
  if (activeRow !== i || items.length === 0) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setAutocomplete(a => ({ ...a, activeIdx: Math.min(a.activeIdx + 1, items.length - 1) }));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setAutocomplete(a => ({ ...a, activeIdx: Math.max(a.activeIdx - 1, -1) }));
  } else if (e.key === 'Enter' && activeIdx >= 0) {
    e.preventDefault();
    selectAutocomplete(i, items[activeIdx]);
  } else if (e.key === 'Escape') {
    setAutocomplete({ items: [], activeRow: -1, activeIdx: -1 });
  }
}

  function updateStep(i, val) {
    const updated = [...steps];
    updated[i] = val;
    setSteps(updated);
  }
  function addStep() { setSteps([...steps, '']); }
  function removeStep(i) { setSteps(steps.filter((_, idx) => idx !== i)); }

  return (
    <div className="recipe-form-page">
      <div className="form-header">
        <Link to="/" className="back-link">← Zurück</Link>
        <h1>{isEditing ? 'Rezept bearbeiten' : 'Neues Rezept'}</h1>
      </div>

      <div className="import-box">
        <h3>📥 Rezept importieren</h3>
        <div className="import-row">
          <input
            type="url"
            placeholder="Rezept-URL oder TikTok/Instagram-Video-Link"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
          />
          {isVideoUrl(importUrl) ? (
            <button className="btn btn-accent" onClick={handleVideoImport} disabled={importingVideo}>
              {importingVideo ? '🎬 Lädt Video...' : '▶️ Video-Rezept importieren'}
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importiere...' : 'Importieren'}
            </button>
          )}
        </div>
        {matchingIngredients && (
          <p className="import-matching-hint">🔍 Prüfe passende Produkte zu den Zutaten...</p>
        )}
        {videoImportProg && (
          <div style={{ marginTop: '0.5rem' }}>
            <ProgressBar progress={videoImportProg} />
            {videoImportProg.status === 'running' && (
              <button
                type="button"
                onClick={cancelVideoImport}
                className="btn btn-secondary btn-sm"
                style={{ marginTop: '0.5rem' }}
              >
                ✕ Abbrechen
              </button>
            )}
          </div>
        )}

        {videoImportStatus && (
          <p className={`import-status import-status-${videoImportStatus.type}`}>
            {videoImportStatus.msg}
          </p>
        )}
        <p className="import-hint">
          💡 TikTok & Instagram Reels werden automatisch transkribiert und als Rezept extrahiert.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="recipe-form">
        <div className="form-section">
          <label>Titel *</label>
          <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Rezeptname" />
        </div>

        <div className="form-section">
          <label>Beschreibung</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Kurze Beschreibung" rows={3} />
        </div>

        <div className="form-row">
          <div className="form-section">
            <label>Bild</label>
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Vorschau" />
                <button type="button" className="btn-remove" onClick={() => { setImagePreview(''); setUploadedImageFile(null); setForm({...form, image_url: ''}); }}>×</button>
              </div>
            )}
            <div className="image-input-row">
              <input 
                type="url" 
                value={form.image_url} 
                onChange={e => handleImageUrlChange(e.target.value)} 
                placeholder="Bild-URL einfügen" 
              />
              <span className="or-divider">oder</span>
              <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                📷 Hochladen
              </button>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={handleFileChange}
              />
            </div>
          </div>
          <div className="form-section">
            <label>Kategorie</label>
            <select 
              value={form.category} 
              onChange={e => setForm({ ...form, category: e.target.value })}
            >
              <option value="">— Kategorie wählen —</option>
              {CATEGORY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-section">
            <label>Portionen</label>
            <input type="number" value={form.servings} onChange={e => setForm({ ...form, servings: e.target.value })} placeholder="4" min="1" />
          </div>
          <div className="form-section">
            <label>Prep Zeit (Min.)</label>
            <input type="number" value={form.prep_time} onChange={e => setForm({ ...form, prep_time: e.target.value })} placeholder="15" />
          </div>
          <div className="form-section">
            <label>Cook Zeit (Min.)</label>
            <input type="number" value={form.cook_time} onChange={e => setForm({ ...form, cook_time: e.target.value })} placeholder="30" />
          </div>
        </div>

        <div className="form-section">
          <label>Tags (durch Komma getrennt)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vegetarisch, schnell, deutsch" />
        </div>

        <div className="form-section">
          <label>Zutaten</label>
          <div className="ingredients-editor">
            <div className="ing-header">
              <span>Menge</span><span>Einheit</span><span>Zutat</span><span>Kategorie</span><span></span>
            </div>
            {ingredients.map((ing, i) => {
              const matches = ingredientMatches[ing.item] || [];
              const bestMatch = matches[0];
              return (
                <div key={i} className="ing-row">
                  <input placeholder="200" value={ing.amount} onChange={e => updateIngredient(i, 'amount', e.target.value)} />
                  <select value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)}>
                    {UNITS.map(u => <option key={u} value={u}>{u || '-'}</option>)}
                  </select>
                  <div className="ing-input-wrapper">
                    <input
                      ref={el => { ingInputRefs.current[i] = el; }}
                      placeholder="Mehl"
                      value={ing.item}
                      onChange={e => handleIngInputChange(i, e.target.value)}
                      onKeyDown={e => handleIngKeyDown(i, e)}
                      onBlur={() => setTimeout(() => setAutocomplete(a => ({ ...a, activeRow: -1 })), 150)}
                    />
                    {autocomplete.items.length > 0 && autocomplete.activeRow === i && (
                      <div className="ing-autocomplete">
                        {autocomplete.items.map((item, idx) => (
                          <div
                            key={item}
                            className={`ing-autocomplete-item ${idx === autocomplete.activeIdx ? 'active' : ''}`}
                            onMouseDown={() => selectAutocomplete(i, item)}
                          >
                            {item}
                          </div>
                        ))}
                      </div>
                    )}
                    {matches.length > 0 && (
                      <div className="ing-match-hint">
                        <span className="ing-match-label">Passendes Produkt:</span>
                        {bestMatch.imageUrl && (
                          <img src={bestMatch.imageUrl} alt="" className="ing-match-thumb" />
                        )}
                        <span className="ing-match-name">{bestMatch.name}</span>
                        {bestMatch.brand && <span className="ing-match-brand">{bestMatch.brand}</span>}
                        {bestMatch.store && (
                          <span className="ing-match-store">{STORE_EMOJI[bestMatch.store] || ''} {bestMatch.store}</span>
                        )}
                        {bestMatch.isEigenmarke && <span className="ing-match-eigen">💰 Eigenmarke</span>}
                        {matches.length > 1 && (
                          <span className="ing-match-more">+{matches.length - 1} weitere</span>
                        )}
                      </div>
                    )}
                  </div>
                  <select value={ing.category} onChange={e => updateIngredient(i, 'category', e.target.value)}>
                    {ING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button type="button" className="btn-remove" onClick={() => removeIngredient(i)}>×</button>
                </div>
              );
            })}
            <button type="button" className="btn btn-add" onClick={addIngredient}>+ Zutat</button>
          </div>
        </div>

        <div className="form-section">
          <label>Schritte</label>
          <div className="steps-editor">
            {steps.map((step, i) => (
              <div key={i} className="step-row">
                <span className="step-num">{i + 1}.</span>
                <textarea placeholder={`Schritt ${i + 1}`} value={step} onChange={e => updateStep(i, e.target.value)} rows={2} />
                <button type="button" className="btn-remove" onClick={() => removeStep(i)}>×</button>
              </div>
            ))}
            <button type="button" className="btn btn-add" onClick={addStep}>+ Schritt</button>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary">{isEditing ? 'Speichern' : 'Erstellen'}</button>
          <Link to="/" className="btn btn-secondary">Abbrechen</Link>
        </div>
      </form>
    </div>
  );
}