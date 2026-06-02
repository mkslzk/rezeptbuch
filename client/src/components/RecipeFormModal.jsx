import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCategoryOptions } from '../config/categories.js';
import Modal from './Modal.jsx';

const EMPTY_INGREDIENT = { item: '', amount: '', unit: '', category: 'produce' };
const CATEGORY_OPTIONS = getCategoryOptions();

const ING_CATEGORIES = ['produce', 'dairy', 'meat', 'bakery', 'pantry', 'frozen', 'beverages', 'snacks', 'sonstiges'];
const UNITS = ['', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Stk', 'Prise', 'Bund', 'Dose', 'Glas', 'Päckchen'];

export default function RecipeFormModal({ isOpen, onClose, onSaved, initialData }) {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const isEditing = initialData && initialData.id;

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

  useEffect(() => {
    if (initialData && initialData.id) {
      setForm({
        title: initialData.title || '',
        description: initialData.description || '',
        image_url: initialData.image_url || '',
        category: initialData.category || '',
        servings: initialData.servings || '',
        prep_time: initialData.prep_time || '',
        cook_time: initialData.cook_time || '',
        source_url: initialData.source_url || ''
      });
      if (initialData.image_url) setImagePreview(initialData.image_url);
      try { setIngredients(JSON.parse(initialData.ingredients)); } catch { setIngredients([{ ...EMPTY_INGREDIENT }]); }
      try { setSteps(JSON.parse(initialData.steps)); } catch { setSteps(['']); }
      try { setTags(JSON.parse(initialData.tags).join(', ')); } catch { setTags(''); }
    } else {
      // Reset form for new recipe
      setForm({ title: '', description: '', image_url: '', category: '', servings: '', prep_time: '', cook_time: '', source_url: '' });
      setIngredients([{ ...EMPTY_INGREDIENT }]);
      setSteps(['']);
      setTags('');
      setImagePreview('');
      setImportUrl('');
    }
  }, [initialData, isOpen]);

  async function handleImport() {
    if (!importUrl) return;
    setImporting(true);
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
        setIngredients(data.ingredients.map(i => ({ item: i, amount: '', unit: '', category: 'produce' })));
      }
      if (data.steps?.length) setSteps(data.steps);
      setImportUrl('');
    } catch (err) {
      alert('Import fehlgeschlagen: ' + err.message);
    } finally {
      setImporting(false);
    }
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target.result);
      setForm({ ...form, image_url: '' });
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    
    let finalImageUrl = form.image_url;
    if (uploadedImageFile) {
      const reader = new FileReader();
      finalImageUrl = await new Promise((resolve) => {
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(uploadedImageFile);
      });
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
      const url = isEditing ? `/recipe/api/recipes/${initialData.id}` : '/recipe/api/recipes';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      onSaved(result.id);
      onClose();
    } catch (err) {
      alert('Speichern fehlgeschlagen');
    }
  }

  function updateIngredient(i, field, val) {
    const updated = [...ingredients];
    updated[i] = { ...updated[i], [field]: val };
    setIngredients(updated);
  }

  function addIngredient() { setIngredients([...ingredients, { ...EMPTY_INGREDIENT }]); }
  function removeIngredient(i) { setIngredients(ingredients.filter((_, idx) => idx !== i)); }

  function updateStep(i, val) {
    const updated = [...steps];
    updated[i] = val;
    setSteps(updated);
  }
  function addStep() { setSteps([...steps, '']); }
  function removeStep(i) { setSteps(steps.filter((_, idx) => idx !== i)); }

  const formContent = (
    <form onSubmit={handleSubmit} className="recipe-form">
      <div className="form-section">
        <label>Titel *</label>
        <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Rezeptname" />
      </div>

      <div className="form-section">
        <label>Beschreibung</label>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Kurze Beschreibung" rows={2} />
      </div>

      <div className="import-box" style={{ marginBottom: '1rem' }}>
        <div className="import-row">
          <input
            type="url"
            placeholder="Rezept-URL importieren"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={handleImport} disabled={importing}>
            {importing ? '...' : '📥'}
          </button>
        </div>
      </div>

      <div className="form-row">
        <div className="form-section">
          <label>Bild</label>
          {imagePreview && (
            <div className="image-preview small">
              <img src={imagePreview} alt="Vorschau" />
              <button type="button" className="btn-remove" onClick={() => { setImagePreview(''); setUploadedImageFile(null); setForm({...form, image_url: ''}); }}>×</button>
            </div>
          )}
          <div className="image-input-row">
            <input type="url" value={form.image_url} onChange={e => handleImageUrlChange(e.target.value)} placeholder="URL" />
            <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>📷</button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        </div>
        <div className="form-section">
          <label>Kategorie</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="">— Kategorie —</option>
            {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      <div className="form-row three-col">
        <div className="form-section">
          <label>Portionen</label>
          <input type="number" value={form.servings} onChange={e => setForm({ ...form, servings: e.target.value })} placeholder="4" min="1" />
        </div>
        <div className="form-section">
          <label>Prep (Min.)</label>
          <input type="number" value={form.prep_time} onChange={e => setForm({ ...form, prep_time: e.target.value })} placeholder="15" />
        </div>
        <div className="form-section">
          <label>Cook (Min.)</label>
          <input type="number" value={form.cook_time} onChange={e => setForm({ ...form, cook_time: e.target.value })} placeholder="30" />
        </div>
      </div>

      <div className="form-section">
        <label>Tags</label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vegetarisch, schnell" />
      </div>

      <div className="form-section">
        <label>Zutaten</label>
        <div className="ingredients-editor compact">
          {ingredients.map((ing, i) => (
            <div key={i} className="ing-row compact">
              <input placeholder="Menge" value={ing.amount} onChange={e => updateIngredient(i, 'amount', e.target.value)} />
              <select value={ing.unit} onChange={e => updateIngredient(i, 'unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u || '-'}</option>)}
              </select>
              <input placeholder="Zutat" value={ing.item} onChange={e => updateIngredient(i, 'item', e.target.value)} />
              <button type="button" className="btn-remove sm" onClick={() => removeIngredient(i)}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add sm" onClick={addIngredient}>+</button>
        </div>
      </div>

      <div className="form-section">
        <label>Schritte</label>
        <div className="steps-editor compact">
          {steps.map((step, i) => (
            <div key={i} className="step-row compact">
              <span className="step-num">{i + 1}</span>
              <textarea placeholder={`Schritt ${i + 1}`} value={step} onChange={e => updateStep(i, e.target.value)} rows={2} />
              <button type="button" className="btn-remove sm" onClick={() => removeStep(i)}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-add sm" onClick={addStep}>+</button>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">{isEditing ? 'Speichern' : 'Erstellen'}</button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
      </div>
    </form>
  );

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "✏️ Rezept bearbeiten" : "🍳 Neues Rezept"} modalClass="recipe-form-modal">
      <div className="recipe-form-modal">
        {formContent}
      </div>
    </Modal>
  );
}