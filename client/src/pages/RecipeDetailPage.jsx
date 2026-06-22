import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getCategoryLabel } from '../config/categories.js';
import RecipeFormModal from '../components/RecipeFormModal.jsx';
import { scaleAmount, scalingBadge } from '../utils/scaling.js';

export default function RecipeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [addingToMealPlan, setAddingToMealPlan] = useState(false);
  const [showAddToMealPlan, setShowAddToMealPlan] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [hoverRating, setHoverRating] = useState(0);

  useEffect(() => { fetchRecipe(); }, [id]);

  function fetchRecipe() {
    fetch(`/recipe/api/recipes/${id}`)
      .then(r => r.json())
      .then(data => { setRecipe(data); setIsFavorite(Boolean(data.is_favorite)); })
      .catch(console.error);
  }

  async function handleAddToMealPlan(day, meal) {
    setAddingToMealPlan(true);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekStr = weekStart.toISOString().split('T')[0];
    try {
      let res = await fetch(`/recipe/api/meal-plans?week=${weekStr}`);
      let plan = await res.json();
      if (!plan || (Array.isArray(plan) && plan.length === 0)) {
        res = await fetch('/recipe/api/meal-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ week_start: weekStr }) });
        plan = await res.json();
      } else if (Array.isArray(plan)) { plan = plan[0]; }
      res = await fetch(`/recipe/api/meal-plans?week=${weekStr}`);
      const planData = await res.json();
      const existingPlan = Array.isArray(planData) ? planData[0] : planData;
      const entriesRes = await fetch(`/recipe/api/meal-plans/${existingPlan.id}/entries`);
      const entriesData = await entriesRes.json();
      const entries = Array.isArray(entriesData) ? entriesData : [];
      entries.push({ day_of_week: day, meal_type: meal, recipe_id: parseInt(id) });
      await fetch(`/recipe/api/meal-plans/${existingPlan.id}/entries`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
      setShowAddToMealPlan(false);
      alert('Rezept zum Essensplan hinzugefügt! 🍳');
    } catch (err) { alert('Fehler: ' + err.message); }
    setAddingToMealPlan(false);
  }

  async function handleDelete() {
    if (!confirm('Rezept wirklich löschen?')) return;
    await fetch(`/recipe/api/recipes/${id}`, { method: 'DELETE' });
    navigate('/');
  }

  async function toggleFavorite() {
    try {
      const res = await fetch(`/recipe/api/recipes/${id}/favorite`, { method: 'PATCH' });
      const data = await res.json();
      setIsFavorite(Boolean(data.is_favorite));
    } catch (err) { console.error('Failed to toggle favorite:', err); }
  }

  async function setRating(value) {
    try {
      const res = await fetch(`/recipe/api/recipes/${id}/rating`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: value })
      });
      const data = await res.json();
      if (data.rating != null) {
        setRecipe(prev => ({ ...prev, rating: data.rating, rating_count: data.rating_count }));
      }
    } catch (err) { console.error('Failed to set rating:', err); }
  }

  function handleExportJson() {
    if (!recipe) return;
    const exportData = {
      title: recipe.title,
      description: recipe.description,
      image_url: recipe.image_url,
      category: recipe.category,
      servings: recipe.servings,
      prep_time: recipe.prep_time,
      cook_time: recipe.cook_time,
      source_url: recipe.source_url,
      ingredients: ingredients,
      steps: steps,
      tags: tags,
      exported_from: 'MOCA',
      exported_at: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    a.download = `${slug}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleShareLink() {
    const shareUrl = `${window.location.origin}/recipe/shared/${id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('Link kopiert! 📋');
      }).catch(() => {
        prompt('Link kopieren:', shareUrl);
      });
    } else {
      prompt('Link kopieren:', shareUrl);
    }
  }

  async function handleDuplicate() {
    if (!recipe) return;
    const payload = {
      title: recipe.title + ' (Kopie)', description: recipe.description, image_url: recipe.image_url,
      category: recipe.category, servings: recipe.servings, prep_time: recipe.prep_time,
      cook_time: recipe.cook_time, source_url: recipe.source_url,
      ingredients: typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients,
      steps: typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : recipe.steps,
      tags: typeof recipe.tags === 'string' ? JSON.parse(recipe.tags) : recipe.tags
    };
    try {
      const res = await fetch('/recipe/api/recipes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await res.json();
      navigate(`/recipe/${result.id}`);
    } catch (err) { alert('Duplizieren fehlgeschlagen'); }
  }

  if (!recipe) return <div className="loading">Lädt...</div>;
  let ingredients = [], steps = [], tags = [];
  try { ingredients = JSON.parse(recipe.ingredients); } catch {}
  try { steps = JSON.parse(recipe.steps); } catch {}
  try { tags = JSON.parse(recipe.tags); } catch {}
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  return (
    <div className="recipe-detail">
      <div className="detail-header">
        <Link to="/" className="back-link">← Zurück</Link>
        <div className="detail-actions">
          <button
            className={`btn btn-favorite ${isFavorite ? 'active' : ''}`}
            onClick={toggleFavorite}
            aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            aria-pressed={isFavorite}
          >{isFavorite ? '★' : '☆'}</button>
          <div
            className="rating-stars"
            onMouseLeave={() => setHoverRating(0)}
            role="radiogroup"
            aria-label={`Bewertung: ${recipe.rating ? Number(recipe.rating).toFixed(1) + ' von 5 Sternen' : 'noch nicht bewertet'}`}
          >
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                className={`star-btn ${(hoverRating || recipe.rating || 0) >= n ? 'active' : ''}`}
                onMouseEnter={() => setHoverRating(n)}
                onClick={() => setRating(n)}
                title={`${n} Stern${n > 1 ? 'e' : ''}`}
                role="radio"
                aria-checked={Math.round(recipe.rating || 0) === n}
                aria-label={`${n} von 5 Sternen`}
              >{(hoverRating || recipe.rating || 0) >= n ? '★' : '☆'}</button>
            ))}
            {recipe.rating_count > 0 && <span className="rating-count" title={`${recipe.rating_count} Bewertung${recipe.rating_count > 1 ? 'en' : ''}`}>({Number(recipe.rating).toFixed(1)} · {recipe.rating_count})</span>}
          </div>
          <button className="btn btn-accent" onClick={() => navigate(`/kitchen/${id}`)}>👨‍🍳 Kochmodus</button>
          <button className="btn btn-accent" onClick={() => setShowAddToMealPlan(!showAddToMealPlan)} aria-expanded={showAddToMealPlan}>📅 Zu Essensplan</button>
          <button className="btn btn-secondary" onClick={handleDuplicate}>📋 Duplizieren</button>
          <button className="btn btn-secondary" onClick={() => setShowEditModal(true)}>✏️ Bearbeiten</button>
          <button className="btn btn-secondary" onClick={handleExportJson} title="Als JSON exportieren" aria-label="Als JSON exportieren">📤 Export</button>
          <button className="btn btn-secondary" onClick={handleShareLink} title="Link teilen" aria-label="Rezept-Link teilen">🔗 Teilen</button>
          <button className="btn btn-danger" onClick={handleDelete} aria-label="Rezept löschen">🗑 Löschen</button>
        </div>
        {showAddToMealPlan && (
          <div className="add-to-plan-dropdown">
            <p className="dropdown-title">Zu welchem Tag hinzufügen?</p>
            {['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'].map((day, idx) => (
              <div key={day} className="dropdown-meal-row">
                <span className="dropdown-day">{day}</span>
                <button onClick={() => handleAddToMealPlan(idx, 'lunch')} disabled={addingToMealPlan}>🍽 Mittag</button>
                <button onClick={() => handleAddToMealPlan(idx, 'dinner')} disabled={addingToMealPlan}>🍳 Abend</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {recipe.image_url && <img src={recipe.image_url} alt={recipe.title} className="detail-image" />}
      <div className="detail-body">
        <h1>{recipe.title}</h1>
        {recipe.category && <span className="detail-category">{getCategoryLabel(recipe.category) || recipe.category}</span>}
        {recipe.description && <p className="detail-description">{recipe.description}</p>}
        {totalTime > 0 && (
          <div className="time-progress-section">
            <h3>⏱ Zeitaufwand</h3>
            <div className="time-progress-bar">
              <div className="time-bar-track">
                <div className="time-bar-fill prep" style={{width: `${(recipe.prep_time || 0) / totalTime * 100}%`}} />
                <div className="time-bar-fill cook" style={{width: `${(recipe.cook_time || 0) / totalTime * 100}%`}} />
              </div>
              <div className="time-bar-labels">
                <span className="time-label prep-label">⏱ Prep: {recipe.prep_time || 0} Min.</span>
                <span className="time-label cook-label">🍳 Kochen: {recipe.cook_time || 0} Min.</span>
                <span className="time-label total-label">⏰ Gesamt: {totalTime} Min.</span>
              </div>
            </div>
          </div>
        )}
        {recipe.servings && (
          <div className="servings-adjuster" role="group" aria-label="Portionen anpassen">
            <span className="servings-label">🍽 Portionen:</span>
            <button
              onClick={() => setServingMultiplier(Math.max(0.5, servingMultiplier - 0.5))}
              aria-label="Portionen verringern"
              title="Portionen verringern (½ Schritte)"
            >−</button>
            <span className="servings-count" aria-live="polite" aria-label={`${Math.round(recipe.servings * servingMultiplier)} Portionen`}>
              {Math.round(recipe.servings * servingMultiplier)}
            </span>
            <button
              onClick={() => setServingMultiplier(servingMultiplier + 0.5)}
              aria-label="Portionen erhöhen"
              title="Portionen erhöhen (½ Schritte)"
            >+</button>
            {servingMultiplier !== 1 && (
              <button
                className="reset-btn"
                onClick={() => setServingMultiplier(1)}
                aria-label="Portionen zurücksetzen"
                title="Auf Originalportionen zurücksetzen"
              >↺</button>
            )}
            {scalingBadge(servingMultiplier) && (
              <span className="scaling-badge" title="Zutaten werden automatisch skaliert">{scalingBadge(servingMultiplier)}</span>
            )}
          </div>
        )}
        {tags.length > 0 && <div className="detail-tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</div>}
        <div className="detail-sections">
          <div className="ingredients-section">
            <h2>Zutaten</h2>
            <ul className="ingredients-list">{ingredients.map((ing, i) => {
              const scaled = scaleAmount(ing.amount, ing.unit, servingMultiplier);
              const amount = scaled
                ? (scaled.unit ? `${scaled.amount} ${scaled.unit}` : scaled.amount)
                : (ing.amount ? `${ing.amount} ${ing.unit}`.trim() : '');
              return (
                <li key={i} className="ingredient-item">
                  {amount && <span className="ing-amount">{amount}</span>}
                  <span className="ing-item">{ing.item}</span>
                </li>
              );
            })}</ul>
          </div>
          <div className="steps-section">
            <h2>Zubereitung</h2>
            <ol className="steps-list">{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
          </div>
        </div>
        {recipe.source_url && <div className="source-link"><a href={recipe.source_url} target="_blank" rel="noopener noreferrer">Quelle: {recipe.source_url}</a></div>}
      </div>
      <RecipeFormModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} onSaved={() => { fetchRecipe(); setShowEditModal(false); }} initialData={recipe} />
    </div>
  );
}
