import { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((msg, kind = 'info', action = null) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, msg, kind, action }]);
    setTimeout(() => dismiss(id), action ? 8000 : 4500);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div
            key={t.id}
            onClick={() => { if (!t.action) dismiss(t.id); }}
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              cursor: t.action ? 'default' : 'pointer',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              pointerEvents: 'all',
              boxShadow: 'var(--shadow-lg)',
              animation: 'slideInRight 0.2s ease',
              ...(t.kind === 'error'   ? { background: 'var(--danger-600, #c0392b)', color: '#fff' } :
                  t.kind === 'success' ? { background: '#1a7a3a', color: '#fff' } :
                  { background: 'var(--surface-0)', color: 'var(--text-primary)', border: '1px solid var(--border-md)' }),
            }}
          >
            <i className={`ti ${
              t.kind === 'error'   ? 'ti-alert-circle' :
              t.kind === 'success' ? 'ti-circle-check' :
              'ti-info-circle'
            }`} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t.msg}</span>
            {t.action && (
              <button
                onClick={() => { t.action.fn(); dismiss(t.id); }}
                style={{ padding:'2px 10px', fontSize:11, borderRadius:4, background:'rgba(128,128,128,0.2)', border:'none', color:'inherit', cursor:'pointer', whiteSpace:'nowrap' }}
              >
                {t.action.label}
              </button>
            )}
            {t.action && (
              <button onClick={() => dismiss(t.id)} style={{ padding:'2px 6px', fontSize:12, background:'transparent', border:'none', color:'inherit', cursor:'pointer', opacity:0.6 }}>
                <i className="ti ti-x"></i>
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
