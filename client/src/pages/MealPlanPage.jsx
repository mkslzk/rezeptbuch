import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'];

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
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

export default function MealPlanPage() {
  const [weekStart, setWeekStart] = useState(getWeekStart());
  const [plan, setPlan] = useState(null);
  const [entries, setEntries] = useState({});
  const [recipes, setRecipes] = useState([]);
  const [addingTo, setAddingTo] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetch('/recipe/api/recipes').then(r => r.json()).then(setRecipes).catch(console.error);
    loadPlan();
  }, [weekStart]);

  function loadPlan() {
    const weekStr = toDateStr(weekStart);
    fetch('/recipe/api/meal-plans?week=${weekStr}`)
      .then(r => r.json())
      .then(data => {
        if (data && !Array.isArray(data) && data.id) {
          setPlan(data);
          const byKey = {};
          (data.entries || []).forEach(e => {
            byKey[`${e.day_of_week}_${e.meal_type}`] = e;
          });
          setEntries(byKey);
        } else if (Array.isArray(data) && data.length > 0) {
          setPlan(data[0]);
          const byKey = {};
          (data[0].entries || []).forEach(e => {
            byKey[`${e.day_of_week}_${e.meal_type}`] = e;
          });
          setEntries(byKey);
        } else {
          setPlan(null);
          setEntries({});
        }
      })
      .catch(console.error);
  }

  async function copyFromLastWeek() {
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStr = lastWeekStart.toISOString().split('T')[0];
    
    try {
      const res = await fetch('/recipe/api/meal-plans?week=${lastWeekStr}`);
      const lastPlan = await res.json();
      
      if (!lastPlan || (Array.isArray(lastPlan) && lastPlan.length === 0)) {
        alert('Kein Essensplan für letzte Woche gefunden');
        return;
      }
      
      const planToCopy = Array.isArray(lastPlan) ? lastPlan[0] : lastPlan;
      
      const entriesRes = await fetch('/recipe/api/meal-plans/${planToCopy.id}/entries`);
      const entriesData = await entriesRes.json();
      const oldEntries = Array.isArray(entriesData) ? entriesData : [];
      
      const newPlanRes = await fetch('/recipe/api/meal-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: toDateStr(weekStart) })
      });
      const newPlan = await newPlanRes.json();
      
      const allEntries = oldEntries.map(e => ({
        day_of_week: e.day_of_week,
        meal_type: e.meal_type,
        recipe_id: e.recipe_id
      }));
      
      await fetch('/recipe/api/meal-plans/${newPlan.id}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: allEntries })
      });
      
      loadPlan();
    } catch (err) {
      alert('Kopieren fehlgeschlagen: ' + err.message);
    }
  }

  async function createPlan() {
    setIsCreating(true);
    const weekStr = toDateStr(weekStart);
    try {
      const res = await fetch('/recipe/api/meal-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_start: weekStr })
      });
      const newPlan = await res.json();
      setPlan(newPlan);
      loadPlan();
    } catch (err) {
      console.error('Failed to create plan:', err);
    }
    setIsCreating(false);
  }

  async function ensurePlan() {
    if (!plan) {
      await createPlan();
      return new Promise(resolve => setTimeout(() => resolve(plan), 500));
    }
    return plan;
  }

  async function addRecipe(recipeId) {
    const p = await ensurePlan();
    if (!p || !p.id) return;
    const key = addingTo;
    const newEntries = { ...entries };
    newEntries[`${key.day}_${key.meal}`] = { meal_plan_id: p.id, recipe_id: recipeId, day_of_week: key.day, meal_type: key.meal };

    const allEntries = Object.entries(newEntries).map(([k, v]) => {
      const [d, m] = k.split('_');
      return { day_of_week: parseInt(d), meal_type: m, recipe_id: v.recipe_id };
    });

    await fetch('/recipe/api/meal-plans/${p.id}/entries`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: allEntries })
    });
    setEntries(newEntries);
    setAddingTo(null);
    loadPlan();
  }

  function prevWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    setWeekStart(d);
  }

  function nextWeek() {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    setWeekStart(d);
  }

  async function removeEntry(day, meal) {
    const key = `${day}_${meal}`;
    const newEntries = { ...entries };
    delete newEntries[key];
    setEntries(newEntries);
    if (plan && plan.id) {
      const allEntries = Object.entries(newEntries).map(([k, v]) => {
        const [d, m] = k.split('_');
        return { day_of_week: parseInt(d), meal_type: m, recipe_id: v.recipe_id };
      });
      await fetch('/recipe/api/meal-plans/${plan.id}/entries`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: allEntries })
      });
      loadPlan();
    }
  }

  function getEntry(day, meal) {
    return entries[`${day}_${meal}`];
  }

  function getRecipe(recipeId) {
    return recipes.find(r => r.id === recipeId);
  }

  function formatWeekRange() {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const opts = { day: 'numeric', month: 'short', year: 'numeric' };
    const kw = getKW(weekStart);
    return `${weekStart.toLocaleDateString('de-DE', opts)} – ${end.toLocaleDateString('de-DE', opts)} (KW ${kw})`;
  }

  const hasAnyMeals = Object.keys(entries).length > 0;

  const shoppingListUrl = plan && plan.id 
    ? `/shopping-list?planId=${plan.id}` 
    : '/shopping-list';

  return (
    <div className="meal-plan-page">
      <div className="page-header">
        <h1>📅 Essensplan</h1>
        <Link to={shoppingListUrl} className="btn btn-primary">Einkaufsliste →</Link>
      </div>

      <div className="week-nav">
        <button onClick={prevWeek}>← Zurück</button>
        <span>{formatWeekRange()}</span>
        <button onClick={nextWeek}>Weiter →</button>
      </div>

      {!plan && !isCreating && (
        <div className="empty-plan-cta">
          <div className="empty-icon">📅</div>
          <h2>Noch kein Essensplan für diese Woche</h2>
          <p>Erstelle einen Plan und füge Rezepte hinzu!</p>
          <div className="cta-buttons">
            <button className="btn btn-primary btn-large" onClick={createPlan}>
              + Essensplan erstellen
            </button>
            <button className="btn btn-secondary btn-large" onClick={copyFromLastWeek}>
              📋 Von letzter Woche kopieren
            </button>
          </div>
        </div>
      )}

      {isCreating && (
        <div className="empty-plan-cta">
          <p>Plan wird erstellt...</p>
        </div>
      )}

      {plan && (
        <div className="week-grid">
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="day-column">
              <h3 className="day-header">{day}</h3>
              {MEAL_TYPES.map(meal => {
                const entry = getEntry(dayIdx, meal);
                const recipe = entry ? getRecipe(entry.recipe_id) : null;
                return (
                  <div key={meal} className={`meal-slot ${meal}`}>
                    <span className="meal-label">{meal === 'breakfast' ? '🌅 Frühstück' : meal === 'lunch' ? '🍽 Mittag' : '🍳 Abendbrot'}</span>
                    {recipe ? (
                      <div className="meal-recipe">
                        <Link to={`/recipe/${recipe.id}`}>{recipe.title}</Link>
                        <button className="btn-remove" onClick={() => removeEntry(dayIdx, meal)}>×</button>
                      </div>
                    ) : (
                      <button className="btn btn-add-meal" onClick={() => setAddingTo({ day: dayIdx, meal })}>+</button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {!plan && (
        <div className="no-plan-hint">
          <p>💡 Tipp: Du kannst auch unten ein Rezept auswählen und es einem Tag zuweisen.</p>
          <div className="quick-recipes">
            <h3>Schnell ein Rezept hinzufügen:</h3>
            <div className="recipe-quick-add">
              {recipes.slice(0, 5).map(r => (
                <button key={r.id} className="recipe-quick-btn" onClick={() => {
                  setAddingTo({ day: 0, meal: 'lunch' });
                  setTimeout(() => addRecipe(r.id), 100);
                }}>
                  {r.title}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {addingTo && (
        <div className="modal-overlay" onClick={() => setAddingTo(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Rezept auswählen</h3>
            <div className="recipe-picker">
              {recipes.map(r => (
                <button key={r.id} className="recipe-option" onClick={() => addRecipe(r.id)}>
                  {r.image_url && <img src={r.image_url} alt="" />}
                  <span>{r.title}</span>
                </button>
              ))}
              {recipes.length === 0 && <p>Keine Rezepte vorhanden.</p>}
            </div>
            <button className="btn btn-secondary" onClick={() => setAddingTo(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}