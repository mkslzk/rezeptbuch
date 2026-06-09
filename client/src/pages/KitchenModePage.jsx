import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';

export default function KitchenModePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerInput, setTimerInput] = useState(5);
  const timerRef = useRef(null);
  const [showIngredients, setShowIngredients] = useState(false);
  const [fontSize, setFontSize] = useState(2); // 1=small, 2=medium, 3=large

  useEffect(() => {
    fetch(`/recipe/api/recipes/${id}`)
      .then(r => r.json())
      .then(data => setRecipe(data))
      .catch(() => navigate('/'));
  }, [id, navigate]);

  // Timer logic
  useEffect(() => {
    if (timerRunning && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds(s => s - 1);
      }, 1000);
    } else if (timerRunning && timerSeconds === 0) {
      setTimerRunning(false);
      // Play a beep or notification
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQAA');
        audio.play().catch(() => {});
      } catch {}
      alert('⏰ Timer abgelaufen!');
    }
    return () => clearTimeout(timerRef.current);
  }, [timerRunning, timerSeconds]);

  const startTimer = useCallback((minutes) => {
    setTimerSeconds(minutes * 60);
    setTimerRunning(true);
  }, []);

  const stopTimer = useCallback(() => {
    setTimerRunning(false);
    clearTimeout(timerRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerSeconds(0);
    clearTimeout(timerRef.current);
  }, []);

  function toggleStep(index) {
    setCompletedSteps(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  }

  function nextStep() {
    if (recipe && currentStep < steps.length - 1) {
      setCurrentStep(s => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (!recipe) return <div className="kitchen-mode loading">Lädt...</div>;

  let ingredients = [], steps = [];
  try { ingredients = JSON.parse(recipe.ingredients); } catch {}
  try { steps = JSON.parse(recipe.steps); } catch {}

  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;
  const allDone = completedSteps.length === totalSteps && totalSteps > 0;

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const fontSizeClass = fontSize === 1 ? 'font-small' : fontSize === 3 ? 'font-large' : 'font-medium';

  return (
    <div className={`kitchen-mode ${fontSizeClass}`}>
      {/* Top Bar */}
      <div className="kitchen-top-bar">
        <Link to={`/recipe/${id}`} className="kitchen-back">← Zurück</Link>
        <div className="kitchen-title">{recipe.title}</div>
        <div className="kitchen-font-controls">
          <button onClick={() => setFontSize(s => Math.max(1, s - 1))} title="Schrift kleiner">A-</button>
          <button onClick={() => setFontSize(s => Math.min(3, s + 1))} title="Schrift größer">A+</button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="kitchen-progress">
        <div className="kitchen-progress-fill" style={{ width: `${progress}%` }} />
        <span className="kitchen-progress-text">
          Schritt {currentStep + 1} von {totalSteps}
          {allDone && ' ✅ Fertig!'}
        </span>
      </div>

      {/* Main Content */}
      <div className="kitchen-content">
        {/* Step Navigation (collapsible on mobile) */}
        <div className="kitchen-step-nav">
          {steps.map((step, i) => (
            <button
              key={i}
              className={`kitchen-step-dot ${i === currentStep ? 'active' : ''} ${completedSteps.includes(i) ? 'completed' : ''}`}
              onClick={() => { setCurrentStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              title={`Schritt ${i + 1}`}
            >
              {completedSteps.includes(i) ? '✓' : i + 1}
            </button>
          ))}
        </div>

        {/* Current Step Display */}
        {totalSteps > 0 ? (
          <div className="kitchen-step-display">
            <div className="kitchen-step-header">
              <span className="kitchen-step-number">Schritt {currentStep + 1}</span>
              <button
                className={`kitchen-step-check ${completedSteps.includes(currentStep) ? 'checked' : ''}`}
                onClick={() => toggleStep(currentStep)}
              >
                {completedSteps.includes(currentStep) ? '✅ Erledigt' : '☐ Erledigt'}
              </button>
            </div>
            <p className="kitchen-step-text">{steps[currentStep]}</p>

            {/* Step Navigation Buttons */}
            <div className="kitchen-step-controls">
              <button className="btn btn-secondary" onClick={prevStep} disabled={currentStep === 0}>
                ← Vorheriger
              </button>
              <button
                className="btn btn-primary"
                onClick={nextStep}
                disabled={currentStep === totalSteps - 1}
              >
                Nächster →
              </button>
            </div>
          </div>
        ) : (
          <div className="kitchen-no-steps">
            <p>Keine Schritte vorhanden.</p>
          </div>
        )}

        {/* Timer Section */}
        <div className="kitchen-timer">
          <h3>⏱ Timer</h3>
          <div className="kitchen-timer-display">
            {formatTime(timerSeconds)}
            {timerRunning && <span className="timer-running"> ●</span>}
          </div>
          <div className="kitchen-timer-presets">
            {[1, 2, 5, 10, 15, 20, 30].map(m => (
              <button key={m} className="btn btn-secondary btn-sm" onClick={() => startTimer(m)}>
                {m} Min
              </button>
            ))}
          </div>
          <div className="kitchen-timer-custom">
            <input
              type="number"
              min="1"
              max="120"
              value={timerInput}
              onChange={e => setTimerInput(Math.max(1, parseInt(e.target.value) || 1))}
              className="timer-input"
            />
            <span>Minuten</span>
            <button className="btn btn-primary btn-sm" onClick={() => startTimer(timerInput)}>
              Start
            </button>
          </div>
          <div className="kitchen-timer-controls">
            <button className="btn btn-secondary btn-sm" onClick={stopTimer} disabled={!timerRunning}>
              ⏸ Pause
            </button>
            <button className="btn btn-danger btn-sm" onClick={resetTimer}>
              ↺ Reset
            </button>
          </div>
        </div>

        {/* Ingredients Toggle */}
        <div className="kitchen-ingredients-toggle">
          <button className="btn btn-secondary" onClick={() => setShowIngredients(!showIngredients)}>
            {showIngredients ? '▼ Zutaten ausblenden' : '▶ Zutaten anzeigen'} ({ingredients.length})
          </button>
        </div>

        {showIngredients && ingredients.length > 0 && (
          <div className="kitchen-ingredients">
            <ul>
              {ingredients.map((ing, i) => (
                <li key={i}>
                  {ing.amount && <span className="ing-amount">{ing.amount} {ing.unit}</span>}
                  <span className="ing-item">{ing.item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
