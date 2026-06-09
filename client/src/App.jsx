import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import HomePage from './pages/HomePage';
import RecipeDetailPage from './pages/RecipeDetailPage';
import RecipeFormPage from './pages/RecipeFormPage';
import MealPlanPage from './pages/MealPlanPage';
import ShoppingListPage from './pages/ShoppingListPage';
import AdminPanel from './pages/AdminPanel.jsx';
import BatchImportPage from './pages/BatchImportPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import ImportStatusBanner from './components/ImportStatusBanner.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import './App.css';

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ plz: '' });
  const [onboardingDone, setOnboardingDone] = useState(
    localStorage.getItem('moca_onboarding_done') === 'true'
  );

  useEffect(() => {
    const saved = localStorage.getItem('moca_settings');
    if (saved) {
      try { setSettings(JSON.parse(saved)); } catch {}
    }
    fetch('/recipe/api/offers/config')
      .then(r => r.json())
      .then(serverSettings => {
        const newSettings = { plz: serverSettings.plz || '' };
        setSettings(newSettings);
        localStorage.setItem('moca_settings', JSON.stringify(newSettings));
      })
      .catch(() => {});
  }, []);

  function handleSaveSettings(newSettings) {
    setSettings(newSettings);
    localStorage.setItem('moca_settings', JSON.stringify(newSettings));
    fetch('/recipe/api/offers/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings)
    }).catch(() => {});
  }

  function handleOnboardingComplete() {
    setOnboardingDone(true);
    window.location.reload();
  }

  // Show onboarding on first run
  if (!onboardingDone) {
    return (
      <ThemeProvider>
        <OnboardingPage onComplete={handleOnboardingComplete} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter basename="/recipe">
        <div className="app">
          <header className="header">
            <div className="header-inner">
              <a href="/recipe" className="logo">🍳 MOCA</a>
              <nav className="nav">
                <a href="/recipe"> Rezepte</a>
                <a href="/recipe/meal-plan"> 📅 Essensplan</a>
                <a href="/recipe/shopping-list"> 🛒 Einkauf</a>
                <a href="/recipe/admin"> 🔧 Admin</a>
              </nav>
              <button
                className="settings-btn"
                onClick={() => setShowSettings(true)}
                title="Einstellungen"
              >
                ⚙️
              </button>
            </div>
          </header>
          <main className="main-content">
            <ImportStatusBanner />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/recipe/new" element={<RecipeFormPage />} />
              <Route path="/recipe/:id" element={<RecipeDetailPage />} />
              <Route path="/recipe/:id/edit" element={<RecipeFormPage />} />
              <Route path="/meal-plan" element={<MealPlanPage />} />
              <Route path="/shopping-list" element={<ShoppingListPage />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/batch" element={<BatchImportPage />} />
            </Routes>
          </main>
        </div>
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSaveSettings={handleSaveSettings}
        />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;