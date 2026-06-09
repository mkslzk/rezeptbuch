import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCategoryLabel } from '../config/categories.js';

export default function SharedRecipePage() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/recipe/api/recipes/shared/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Rezept nicht gefunden');
        return r.json();
      })
      .then(data => setRecipe(data))
      .catch(err => setError(err.message));
  }, [id]);

  if (error) return (
    <div className="shared-recipe-page">
      <div className="shared-recipe-card">
        <h1>😿 Rezept nicht gefunden</h1>
        <p>{error}</p>
        <Link to="/recipe" className="btn btn-primary">← Zurück zu MOCA</Link>
      </div>
    </div>
  );

  if (!recipe) return <div className="shared-recipe-page"><div className="shared-recipe-card loading">Lädt...</div></div>;

  let ingredients = [], steps = [], tags = [];
  try { ingredients = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : (recipe.ingredients || []); } catch {}
  try { steps = typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : (recipe.steps || []); } catch {}
  try { tags = typeof recipe.tags === 'string' ? JSON.parse(recipe.tags) : (recipe.tags || []); } catch {}

  return (
    <div className="shared-recipe-page">
      <div className="shared-recipe-card">
        <div className="shared-header">
          <Link to="/recipe" className="shared-logo">🍳 MOCA</Link>
        </div>

        {recipe.image_url && (
          <img src={recipe.image_url} alt={recipe.title} className="shared-image" onError={e => { e.target.style.display = 'none'; }} />
        )}

        <div className="shared-body">
          <h1>{recipe.title}</h1>

          {recipe.category && (
            <span className="shared-category">{getCategoryLabel(recipe.category) || recipe.category}</span>
          )}

          {recipe.description && <p className="shared-description">{recipe.description}</p>}

          <div className="shared-meta">
            {recipe.servings && <span>🍽 {recipe.servings} Portionen</span>}
            {recipe.prep_time && <span>⏱ Prep: {recipe.prep_time} Min.</span>}
            {recipe.cook_time && <span>🍳 Kochen: {recipe.cook_time} Min.</span>}
          </div>

          {tags.length > 0 && (
            <div className="shared-tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
          )}

          {ingredients.length > 0 && (
            <div className="shared-section">
              <h2>Zutaten</h2>
              <ul className="shared-ingredients">
                {ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.amount && <span className="ing-amount">{ing.amount} {ing.unit}</span>}
                    <span className="ing-item">{ing.item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div className="shared-section">
              <h2>Zubereitung</h2>
              <ol className="shared-steps">
                {steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}

          {recipe.source_url && (
            <div className="shared-source">
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">Quelle öffnen →</a>
            </div>
          )}
        </div>

        <div className="shared-footer">
          Erstellt mit <Link to="/recipe">🍳 MOCA</Link> – My Own Cooking App
        </div>
      </div>
    </div>
  );
}
