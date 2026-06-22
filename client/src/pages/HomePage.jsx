import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCategoryLabel, getCategoryEmoji } from '../config/categories.js';
import RecipeFormModal from '../components/RecipeFormModal.jsx';

export default function HomePage() {
  const [recipes, setRecipes] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'name' | 'category'
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);

  useEffect(() => {
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    try {
      const res = await fetch('/recipe/api/recipes');
      const data = await res.json();
      setRecipes(data);
      const cats = [...new Set(data.map(r => r.category).filter(Boolean))];
      setCategories(cats);
    } catch (err) {
      console.error('Failed to fetch:', err);
    }
  }

  async function handleSearch(query) {
    setSearchQuery(query);
    if (!query && !selectedCategory) {
      fetchRecipes();
      return;
    }
    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      const res = await fetch(`/recipe/api/search?${params}`);
      let data = await res.json();
      if (selectedCategory) {
        data = data.filter(r => r.category === selectedCategory);
      }
      setRecipes(data);
    } catch (err) {
      console.error('Search failed:', err);
    }
  }

  function handleCategoryFilter(cat) {
    setSelectedCategory(cat);
    if (!cat) {
      fetchRecipes();
      return;
    }
    fetch(`/recipe/api/search?q=${encodeURIComponent(cat)}`)
      .then(r => r.json())
      .then(data => setRecipes(data));
  }

  function handleSortChange(sort) {
    setSortBy(sort);
  }

  function handleRecipeSaved(recipeId) {
    fetchRecipes();
  }

  // Filter recipes (favorites filter, doesn't mutate state)
  const filteredRecipes = showFavoritesOnly
    ? recipes.filter(r => r.is_favorite)
    : recipes;

  // Sort recipes
  const sortedRecipes = [...filteredRecipes].sort((a, b) => {
    if (sortBy === 'name') return a.title.localeCompare(b.title);
    if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
    // Default: date (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>📖 Rezepte</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link to="/batch" className="btn btn-secondary">📥 Import</Link>
          <button className="btn btn-primary" onClick={() => { setEditingRecipe(null); setShowRecipeModal(true); }}>+ Neues Rezept</button>
        </div>
      </div>

      <div className="controls">
        <div className="search-bar">
          <label htmlFor="recipe-search" className="visually-hidden">Rezepte durchsuchen</label>
          <input
            id="recipe-search"
            type="text"
            placeholder="Rezepte durchsuchen..."
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <div className="control-row">
          <div className="view-toggle" role="group" aria-label="Ansicht wechseln">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              aria-label="Raster-Ansicht"
              aria-pressed={viewMode === 'grid'}
            >▦</button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              aria-label="Listen-Ansicht"
              aria-pressed={viewMode === 'list'}
            >☰</button>
          </div>
          <div className="sort-control">
            <label htmlFor="sort-select">Sortieren:</label>
            <select id="sort-select" value={sortBy} onChange={e => handleSortChange(e.target.value)}>
              <option value="date">Datum</option>
              <option value="name">Name</option>
              <option value="category">Kategorie</option>
            </select>
          </div>
        </div>
      </div>

      <div className="category-filter" role="group" aria-label="Rezepte filtern">
        <button
          className={!selectedCategory && !showFavoritesOnly ? 'active' : ''}
          onClick={() => { setShowFavoritesOnly(false); handleCategoryFilter(''); }}
          aria-pressed={!selectedCategory && !showFavoritesOnly}
        >Alle</button>
        <button
          className={showFavoritesOnly ? 'active' : ''}
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          aria-pressed={showFavoritesOnly}
        >★ Favoriten</button>
        {categories.map(cat => (
          <button
            key={cat}
            className={selectedCategory === cat ? 'active' : ''}
            onClick={() => handleCategoryFilter(cat)}
            aria-pressed={selectedCategory === cat}
          >{getCategoryLabel(cat) || cat}</button>
        ))}
      </div>

      <div className={`recipe-${viewMode}`}>
        {sortedRecipes.length === 0 ? (
          <div className="empty-state">
            <p>Keine Rezepte gefunden. 👀</p>
            <button onClick={() => { setEditingRecipe(null); setShowRecipeModal(true); }}>Erstes Rezept erstellen →</button>
          </div>
        ) : sortedRecipes.map(recipe => (
          <Link key={recipe.id} to={`/recipe/${recipe.id}`} className="recipe-card">
            {viewMode === 'grid' ? (
              <div className="card-inner">
                {recipe.image_url?.trim() ? (
                  <img
                    src={recipe.image_url}
                    alt={recipe.title}
                    className="card-image"
                    onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                  />
                ) : null}
                <div className={`card-image placeholder${recipe.image_url?.trim() ? ' hidden' : ''}`}>{getCategoryEmoji(recipe.category)}</div>
                <div className="card-content">
                  <h3>{recipe.title}</h3>
                  {recipe.category && <span className="card-category">{getCategoryLabel(recipe.category) || recipe.category}</span>}
                  {recipe.description && <p className="card-desc">{recipe.description}</p>}
                </div>
              </div>
            ) : (
              <div className="list-inner">
                {recipe.image_url ? (
                  <img src={recipe.image_url} alt={recipe.title} className="list-image" />
                ) : (
                  <div className="list-image list-image-placeholder" aria-hidden="true">{getCategoryEmoji(recipe.category)}</div>
                )}
                <div className="list-content">
                  <h3>{recipe.title}</h3>
                  {recipe.category && <span className="card-category">{getCategoryLabel(recipe.category) || recipe.category}</span>}
                  {recipe.description && <p className="card-desc">{recipe.description}</p>}
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>

      <RecipeFormModal 
        isOpen={showRecipeModal} 
        onClose={() => setShowRecipeModal(false)} 
        onSaved={handleRecipeSaved}
        initialData={editingRecipe}
      />
    </div>
  );
}