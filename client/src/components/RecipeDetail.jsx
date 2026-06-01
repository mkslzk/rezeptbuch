function RecipeDetail({ recipe, onEdit, onDelete }) {
  const ingredients = typeof recipe.ingredients === 'string' ? JSON.parse(recipe.ingredients) : recipe.ingredients || [];
  const steps = typeof recipe.steps === 'string' ? JSON.parse(recipe.steps) : recipe.steps || [];
  const tags = typeof recipe.tags === 'string' ? JSON.parse(recipe.tags) : recipe.tags || [];

  return (
    <div className="recipe-detail">
      <h2>{recipe.title}</h2>
      {recipe.description && <p className="description">{recipe.description}</p>}

      <div className="meta">
        {recipe.category && <span>📁 {recipe.category}</span>}
        {recipe.prep_time && <span>⏱️ {recipe.prep_time} min prep</span>}
        {recipe.cook_time && <span>🍳 {recipe.cook_time} min kochen</span>}
        {recipe.servings && <span>👤 {recipe.servings} Portionen</span>}
      </div>

      {tags.length > 0 && (
        <div className="tags">
          {tags.map(tag => (
            <span key={tag} style={{ background: '#eee', padding: '0.25rem 0.5rem', borderRadius: '4px', marginRight: '0.5rem', fontSize: '0.85rem' }}>
              #{tag}
            </span>
          ))}
        </div>
      )}

      {ingredients.length > 0 && (
        <>
          <h3>🛒 Zutaten</h3>
          <ul>
            {ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        </>
      )}

      {steps.length > 0 && (
        <>
          <h3>📝 Zubereitung</h3>
          <ol>
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </>
      )}

      <div className="actions">
        <button className="edit-btn" onClick={onEdit}>✏️ Bearbeiten</button>
        <button className="delete-btn" onClick={onDelete}>🗑️ Löschen</button>
      </div>
    </div>
  );
}

export default RecipeDetail;