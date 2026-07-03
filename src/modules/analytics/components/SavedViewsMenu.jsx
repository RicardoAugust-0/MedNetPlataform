import { useState, useRef, useEffect } from 'react';

export default function SavedViewsMenu({ views, onApply, onSave, onRemove }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="btn btn-sm btn-ghost"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '7px 12px', border: '1px solid var(--border)',
          background: 'var(--surface-0)', color: 'var(--text-primary)',
          fontWeight: 500, borderRadius: '8px', cursor: 'pointer',
        }}
      >
        <i className="ti ti-bookmarks" style={{ fontSize: '14px' }}></i> Visões salvas
        {views.length > 0 && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>({views.length})</span>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 500,
          width: 280, maxHeight: 340, overflowY: 'auto',
          background: 'var(--surface-0)', border: '1px solid var(--border-md)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <button
              className="btn btn-sm btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => { onSave(); setOpen(false); }}
            >
              <i className="ti ti-plus"></i> Salvar visão atual
            </button>
          </div>
          {views.length === 0 ? (
            <div style={{ padding: '18px 14px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
              Nenhuma visão salva ainda.
            </div>
          ) : (
            views.map(v => (
              <div
                key={v.name}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-1)'}
                onMouseLeave={e => e.currentTarget.style.background = ''}
                onClick={() => { onApply(v.snapshot); setOpen(false); }}
              >
                <i className="ti ti-bookmark" style={{ color: 'var(--accent-500)', fontSize: 14 }}></i>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</span>
                <button
                  className="btn-icon"
                  title="Remover visão"
                  onClick={(e) => { e.stopPropagation(); onRemove(v.name); }}
                  style={{ flexShrink: 0 }}
                >
                  <i className="ti ti-trash" style={{ fontSize: 12.5 }}></i>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
