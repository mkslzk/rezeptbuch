import { useState, useEffect } from 'react';
import './EnvironmentBanner.css';

export default function EnvironmentBanner() {
  const [environment, setEnvironment] = useState(null);

  useEffect(() => {
    fetch('/recipe/api/environment')
      .then(r => r.json())
      .then(data => setEnvironment(data.environment))
      .catch(() => setEnvironment('development'));
  }, []);

  if (environment === 'production') return null;

  const label = environment === 'development' ? '🧪 DEVELOPMENT' : `⚠️ ${environment.toUpperCase()}`;

  return (
    <div className="environment-banner">
      {label} — Nur für interne Tests
    </div>
  );
}