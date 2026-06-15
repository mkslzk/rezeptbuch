import { useState, useEffect } from 'react';
import './EnvironmentBanner.css';

export default function EnvironmentBanner() {
  // Build-time fallback (Vite: 'production' bei `vite build`, sonst 'development')
  const [environment, setEnvironment] = useState(
    () => import.meta.env.MODE || 'development'
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);

    fetch('/recipe/api/environment', { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => setEnvironment(data.environment))
      .catch(() => {/* keep build-time value */})
      .finally(() => { setLoaded(true); clearTimeout(timer); });

    return () => { ctrl.abort(); clearTimeout(timer); };
  }, []);

  if (environment === 'production') return null;

  const labels = {
    development: '🧪 DEVELOPMENT',
    qa: '🧪 QA',
    staging: '🚧 STAGING',
  };
  const label = labels[environment] || `⚠️ ${environment.toUpperCase()}`;

  return (
    <div className="environment-banner" data-loaded={loaded}>
      {label} — Nur für interne Tests
    </div>
  );
}