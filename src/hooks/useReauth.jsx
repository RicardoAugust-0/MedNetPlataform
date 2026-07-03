import { useState, useCallback, useEffect, useRef, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

const ReauthContext = createContext(null);

// Confirma a senha do usuário logado antes de revelar um segredo sensível
// (ex: senha de conta Horizon). Não é um novo login: apenas valida a senha
// atual via signInWithPassword — a sessão em uso continua a mesma.
export function ReauthProvider({ children }) {
  const { profile } = useAuth();
  const [modal, setModal] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  const cancel = useCallback(() => {
    setModal((m) => { m?.resolve(false); return null; });
    setPassword('');
    setError(null);
  }, []);

  useEffect(() => {
    if (!modal) return;
    inputRef.current?.focus();
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Tab') {
        const focusables = modalRef.current?.querySelectorAll(
          'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [modal, cancel]);

  const reauth = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setPassword('');
      setError(null);
      setModal({
        title: options.title || 'Confirme sua senha',
        message: options.message || 'Por segurança, confirme sua senha para revelar esta informação.',
        resolve,
      });
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || !profile?.email) return;
    setChecking(true);
    setError(null);
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile.email, password });
    setChecking(false);
    if (authErr) {
      setError('Senha incorreta.');
      return;
    }
    modal.resolve(true);
    setModal(null);
    setPassword('');
  };

  return (
    <ReauthContext.Provider value={{ reauth }}>
      {children}
      {modal && createPortal(
        <div className="modal-overlay open" style={{ zIndex: 9999 }}>
          <div
            ref={modalRef}
            className="modal"
            style={{ maxWidth: 400 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reauth-modal-title"
          >
            <div className="modal-header">
              <div className="modal-title" id="reauth-modal-title">
                <i className="ti ti-shield-lock"></i>
                {modal.title}
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                {modal.message}
              </div>
              <input
                ref={inputRef}
                type="password"
                className="form-control"
                placeholder="Sua senha de acesso"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                autoComplete="current-password"
                style={{ marginBottom: error ? 6 : 20 }}
              />
              {error && (
                <div style={{ fontSize: 12, color: 'var(--danger-500)', marginBottom: 14 }}>
                  <i className="ti ti-alert-circle"></i> {error}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={cancel} disabled={checking}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={checking || !password}>
                  {checking ? <><i className="ti ti-loader-2 fz-spin"></i> Verificando…</> : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </ReauthContext.Provider>
  );
}

export function useReauth() {
  const context = useContext(ReauthContext);
  if (!context) throw new Error('useReauth deve ser usado dentro de um ReauthProvider');
  return context.reauth;
}
