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

/**
 * Floating action button + popover.
 * - Only appears when there's something to show (active or recent jobs)
 * - Click opens a compact popup with per-job status
 * - "Alle Details" link in popup → /batch
 * - Auto-hides 30s after the last job finishes
 */
export default function ImportStatusBanner() {
  const [active, setActive] = useState([]);
  const [recent, setRecent] = useState([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const dismissTimer = useRef(null);
  const popoverRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/recipe/api/recipes/import/active');
        const d = await r.json();
        if (cancelled) return;
        setActive(d.active || []);
        setRecent(d.recent || []);
      } catch {}
    }
    poll();
    const id = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Auto-dismiss 30s after last job finishes (or when nothing left at all)
  useEffect(() => {
    if (active.length > 0) {
      if (dismissTimer.current) { clearTimeout(dismissTimer.current); dismissTimer.current = null; }
      setDismissed(false);
      return;
    }
    if (recent.length > 0) {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => {
        setDismissed(true);
        setOpen(false);
      }, 30000);
    } else {
      setDismissed(false);
    }
  }, [active.length, recent.length]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (popoverRef.current?.contains(e.target)) return;
      if (btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const all = [...active, ...recent];
  const isWorking = active.length > 0;
  const shouldShow = !dismissed && all.length > 0;
  if (!shouldShow) return null;

  const total = all.length;
  const doneCount = all.filter(j => j.status === 'done').length;
  const errorCount = all.filter(j => j.status === 'error').length;
  const runningCount = active.length;
  const overallPct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  async function cancelJob(jobId) {
    if (!confirm('Diesen Import abbrechen?')) return;
    try {
      await fetch('/recipe/api/recipes/import/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
    } catch {}
  }

  function dismissAll() {
    setDismissed(true);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        title={isWorking ? `${runningCount} Import${runningCount === 1 ? '' : 's'} läuft${runningCount === 1 ? '' : 'en'}` : 'Imports anzeigen'}
        style={{
          position: 'fixed',
          bottom: '1.25rem',
          right: '1.25rem',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: isWorking ? 'var(--color-accent)' : 'var(--color-success, #4caf50)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          cursor: 'pointer',
          fontSize: '1.3rem',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: isWorking ? 'pulse 2.4s ease-in-out infinite' : 'none',
          transition: 'transform 0.15s'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {isWorking ? '⏳' : (errorCount > 0 ? '⚠️' : '✅')}
        <span style={{
          position: 'absolute',
          top: '-3px',
          right: '-3px',
          background: errorCount > 0 && !isWorking ? 'var(--color-danger, #d32f2f)' : 'var(--color-sepia-dark, #c4b49a)',
          color: 'white',
          borderRadius: '10px',
          minWidth: '20px',
          height: '20px',
          padding: '0 5px',
          fontSize: '0.7rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}>
          {isWorking ? runningCount : total}
        </span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            bottom: '5.25rem',
            right: '1.25rem',
            width: '340px',
            maxWidth: 'calc(100vw - 2.5rem)',
            maxHeight: 'min(70vh, 500px)',
            background: 'var(--color-paper)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontSize: '0.9rem'
          }}
        >
          <div style={{
            padding: '0.7rem 0.9rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.5rem'
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>📥 Import Status</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', marginTop: '0.15rem' }}>
                {isWorking
                  ? `${runningCount} von ${total} laufen…`
                  : `${doneCount}/${total} erfolgreich${errorCount > 0 ? ` · ${errorCount} fehlgeschlagen` : ''}`}
              </div>
            </div>
            <button
              onClick={dismissAll}
              title="Schließen"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: 0, lineHeight: 1, color: 'var(--color-text-light)' }}
            >×</button>
          </div>

          <div style={{ background: 'var(--color-border)', height: '3px' }}>
            <div style={{
              background: isWorking ? 'var(--color-accent)' : (errorCount > 0 ? 'var(--color-sepia)' : 'var(--color-success, #4caf50)'),
              height: '100%',
              width: `${overallPct}%`,
              transition: 'width 0.4s'
            }} />
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {all.slice(0, 8).map(j => (
              <div key={j.jobId} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0.9rem',
                borderBottom: '1px solid var(--color-border)'
              }}>
                <span style={{ flexShrink: 0 }}><TypeIcon type={j.type} /></span>
                <span style={{ flexShrink: 0 }}><StatusIcon status={j.status} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: '0.85rem'
                  }} title={j.title || j.url}>
                    {j.title || j.url}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>
                    {j.error
                      ? `❌ ${j.error.length > 40 ? j.error.slice(0, 40) + '…' : j.error}`
                      : `${STAGE_LABELS[j.stage] || j.stage}${typeof j.progress === 'number' ? ` · ${j.progress}%` : ''}`}
                  </div>
                </div>
                {(j.status === 'running' || j.status === 'pending') && (
                  <button
                    onClick={() => cancelJob(j.jobId)}
                    title="Abbrechen"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.85rem', padding: '0 0.25rem', color: 'var(--color-text-light)' }}
                  >✕</button>
                )}
              </div>
            ))}
            {all.length > 8 && (
              <div style={{ padding: '0.4rem 0.9rem', fontSize: '0.78rem', color: 'var(--color-text-light)', textAlign: 'center' }}>
                +{all.length - 8} weitere
              </div>
            )}
          </div>

          <Link
            to="/batch"
            onClick={() => setOpen(false)}
            style={{
              padding: '0.6rem 0.9rem',
              borderTop: '1px solid var(--color-border)',
              textAlign: 'center',
              background: 'var(--color-sepia)',
              color: 'var(--color-brown)',
              textDecoration: 'none',
              fontWeight: 500,
              fontSize: '0.85rem'
            }}
          >
            Alle Details anzeigen →
          </Link>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 0 var(--color-accent); }
          50% { box-shadow: 0 4px 12px rgba(0,0,0,0.25), 0 0 0 8px transparent; }
        }
      `}</style>
    </>
  );
}
