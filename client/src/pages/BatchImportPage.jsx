import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const STAGE_LABELS = {
  queued: 'In Warteschlange',
  extract: 'Video extrahieren',
  fetch: 'Webseite laden',
  download: 'Video herunterladen',
  transcribe: 'Transkribieren',
  recipe: 'Rezept extrahieren',
  done: 'Fertig',
  error: 'Fehler',
  cancelled: 'Abgebrochen'
};

function TypeIcon({ type }) {
  return type === 'video' ? '🎬' : '🌐';
}

function StatusIcon({ status }) {
  if (status === 'running' || status === 'pending') return '⏳';
  if (status === 'done') return '✅';
  if (status === 'error') return '❌';
  if (status === 'cancelled') return '🚫';
  return '•';
}

function detectType(url) {
  if (/tiktok\.com|instagram\.com/.test(url)) return 'video';
  return 'url';
}

export default function BatchImportPage() {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState(null); // { batchId, jobIds, items }
  const [progress, setProgress] = useState(null); // batchProgress
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // Restore in-flight batch from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem('batchImportId');
    if (saved) {
      setBatch({ batchId: saved });
    }
  }, []);

  // Poll progress while a batch is active
  useEffect(() => {
    if (!batch?.batchId) return;
    async function poll() {
      try {
        const r = await fetch(`/recipe/api/recipes/import/batch/progress?batchId=${batch.batchId}`);
        const d = await r.json();
        if (d.progress) {
          setProgress(d.progress);
          if (d.progress.status === 'done') {
            clearInterval(pollRef.current);
            // Keep the result visible; user can clear manually
          }
        }
      } catch {}
    }
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, [batch?.batchId]);

  function parseUrls() {
    return text
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(url => ({ url, type: detectType(url) }));
  }

  async function startBatch() {
    setError(null);
    const items = parseUrls();
    if (items.length === 0) { setError('Bitte mindestens eine URL einfügen.'); return; }
    setStarting(true);
    try {
      const res = await fetch('/recipe/api/recipes/import/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Batch konnte nicht gestartet werden');
      sessionStorage.setItem('batchImportId', data.batchId);
      setBatch({ batchId: data.batchId, jobIds: data.jobIds, items: data.items });
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }

  async function cancelBatch() {
    if (!batch?.batchId) return;
    if (!confirm('Gesamten Batch abbrechen?')) return;
    try { await fetch('/recipe/api/recipes/import/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId: batch.batchId }) }); } catch {}
  }

  function clearBatch() {
    if (pollRef.current) clearInterval(pollRef.current);
    sessionStorage.removeItem('batchImportId');
    setBatch(null);
    setProgress(null);
    setText('');
  }

  const preview = parseUrls();
  const isWorking = progress && progress.status === 'running';

  return (
    <div className="batch-import-page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>📥 Batch-Import</h1>
          <span style={{
            background: '#d32f2f',
            color: '#fff',
            fontSize: '0.72rem',
            fontWeight: 700,
            padding: '0.2rem 0.55rem',
            borderRadius: '4px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>PROD</span>
        </div>
        <Link to="/" className="btn btn-secondary">← Zurück</Link>
      </div>

      {!batch && (
        <div className="card" style={{ background: 'var(--color-paper)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1.25rem', marginBottom: '1rem' }}>
          <p style={{ marginTop: 0, color: 'var(--color-text-light)' }}>
            Füge eine gemischte Liste von Rezept-URLs ein — eine pro Zeile. TikTok & Instagram werden als Video transkribiert, alle anderen Seiten werden direkt gescrapet.
          </p>

          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>
            🌐 URL-Liste einfügen:
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'https://www.tiktok.com/@kochkanal/video/123…\nhttps://www.instagram.com/reel/abc/\nhttps://www.chefkoch.de/rezepte/12345\nhttps://www.einfachbacken.de/…'}
            rows={10}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              padding: '0.6rem',
              border: '2px solid var(--color-accent)',
              borderRadius: 'var(--radius)',
              background: 'var(--color-cream)',
              color: 'var(--color-text)',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--color-text-light)', textAlign: 'right' }}>
            💡 Eine URL pro Zeile oder durch Komma getrennt
          </div>
          {error && (
            <div className="status-message error" style={{ marginTop: '0.75rem' }}>{error}</div>
          )}
          {preview.length > 0 && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <strong>Erkannt:</strong> {preview.length} URL{preview.length === 1 ? '' : 's'} (
              {preview.filter(p => p.type === 'video').length} Video,{' '}
              {preview.filter(p => p.type === 'url').length} Webseite)
              <ul style={{ margin: '0.4rem 0 0 0', padding: '0 0 0 1.2rem', maxHeight: '160px', overflow: 'auto' }}>
                {preview.map((p, i) => (
                  <li key={i} style={{ wordBreak: 'break-all' }}>
                    <TypeIcon type={p.type} /> {p.url}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={startBatch}
              disabled={starting || preview.length === 0}
            >
              {starting ? '⏳ Starte…' : `🚀 ${preview.length || ''} Import${preview.length === 1 ? '' : 's'} starten`}
            </button>
            {text && (
              <button className="btn btn-secondary" onClick={() => setText('')}>Leeren</button>
            )}
          </div>
        </div>
      )}

      {batch && progress && (
        <div className="card" style={{ background: 'var(--color-paper)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                {isWorking
                  ? `⏳ ${progress.completedJobs}/${progress.totalJobs} fertig…`
                  : `🏁 Batch abgeschlossen: ${progress.completedJobs} ✅ · ${progress.failedJobs} ❌`}
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
                Batch-ID: <code>{batch.batchId}</code>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isWorking && <button className="btn btn-secondary" onClick={cancelBatch}>✕ Alle abbrechen</button>}
              {!isWorking && <button className="btn btn-secondary" onClick={clearBatch}>Neuer Batch</button>}
            </div>
          </div>

          <div style={{ background: 'var(--color-border)', borderRadius: '4px', height: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{
              background: 'var(--color-accent)',
              height: '100%',
              width: `${(progress.completedJobs / progress.totalJobs) * 100}%`,
              transition: 'width 0.4s'
            }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {progress.jobs.map(j => (
              <div
                key={j.jobId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.5rem 0.75rem',
                  background: 'var(--color-cream)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.9rem'
                }}
              >
                <span style={{ fontSize: '1.1rem' }}><TypeIcon type={j.type} /></span>
                <span style={{ fontSize: '1.1rem' }}><StatusIcon status={j.status} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {j.title || j.url}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
                    {j.error || j.message || STAGE_LABELS[j.stage] || j.stage}
                  </div>
                </div>
                <div style={{ minWidth: '90px', textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>{STAGE_LABELS[j.stage] || j.stage}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{j.progress}%</div>
                </div>
                {j.status === 'done' && j.title && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-success, #2e7d32)' }}>gespeichert</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            Hinweis: Du kannst diese Seite schließen — der Batch läuft im Hintergrund weiter.{' '}
            Das <ImportStatusInline /> zeigt dir den Fortschritt auf jeder Seite an.
          </div>
        </div>
      )}
    </div>
  );
}

function ImportStatusInline() {
  return <Link to="/">Banner auf der Startseite</Link>;
}
