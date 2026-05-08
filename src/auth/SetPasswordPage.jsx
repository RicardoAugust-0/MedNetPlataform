import { useState } from 'react';
import { useAuth } from './AuthContext';

const LogoSVG = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: 9, boxShadow: '0 6px 20px rgba(158,26,69,0.45)' }}>
    <defs>
      <linearGradient id="sp-logo-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#9E1A45"/>
        <stop offset="100%" stopColor="#5A0F25"/>
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="url(#sp-logo-bg)"/>
    <text x="15" y="23" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="800" fill="white" textAnchor="middle">M</text>
    <rect x="23" y="5" width="2" height="8" rx="1" fill="#F26931"/>
    <rect x="20" y="8" width="8" height="2" rx="1" fill="#F26931"/>
  </svg>
);

export default function SetPasswordPage() {
  const { setPassword, session, authType } = useAuth();
  const [password, setPass]   = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);

  const isInvite = authType === 'invite';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('As senhas não coincidem.'); return; }
    setLoading(true);
    const { error: err } = await setPassword(password);
    if (err) setError(err.message);
    else setDone(true);
    setLoading(false);
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>

        {/* ── Header brandado MedNet ── */}
        <div style={styles.brandHeader}>
          <LogoSVG size={46} />
          <div>
            <div style={styles.brandGrupo}>GRUPO</div>
            <div style={styles.brandName}>
              Med<span style={{ color: '#F26931' }}>Net</span>
            </div>
            <div style={styles.brandTagline}>Medicina e Segurança do Trabalho</div>
          </div>
          <div style={styles.brandProduct}>Fadiga Zero</div>
        </div>

        {/* ── Corpo ── */}
        <div style={styles.formBody}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <i className="ti ti-circle-check" style={{ fontSize: 44, color: 'var(--success-500)', display: 'block', marginBottom: 12 }}></i>
              <div style={styles.title}>Senha definida!</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
                Redirecionando para o sistema…
              </div>
            </div>
          ) : (
            <>
              <div style={styles.title}>
                {isInvite ? 'Crie sua senha' : 'Redefinir senha'}
              </div>
              <div style={styles.sub}>
                {isInvite
                  ? `Bem-vindo(a), ${session?.user?.email}. Defina uma senha para acessar a plataforma.`
                  : 'Digite uma nova senha para sua conta.'}
              </div>

              <form onSubmit={handleSubmit} style={{ marginTop: 22 }}>
                <div className="form-group">
                  <label className="form-label">Nova senha</label>
                  <input
                    className="form-control"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={e => setPass(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Confirmar senha</label>
                  <input
                    className="form-control"
                    type="password"
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                  />
                </div>

                {error && (
                  <div style={styles.errorBox}>
                    <i className="ti ti-alert-circle"></i> {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '10px' }}
                  disabled={loading}
                >
                  {loading
                    ? <><i className="ti ti-loader-2" style={styles.spin}></i> Salvando…</>
                    : isInvite ? 'Criar senha e entrar' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg-app)', padding: 16,
  },
  card: {
    background: 'var(--surface-0)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    width: 420, maxWidth: '100%',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  brandHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '24px 28px 22px',
    background: 'linear-gradient(135deg, #1A0308 0%, #350A16 60%, #5A0F25 100%)',
    position: 'relative',
  },
  brandGrupo: {
    fontSize: 9, letterSpacing: '2.5px', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 1,
  },
  brandName: {
    fontSize: 24, fontWeight: 800, color: '#fff',
    letterSpacing: '-0.5px', lineHeight: 1.1,
  },
  brandTagline: {
    fontSize: 10.5, color: 'rgba(255,255,255,0.45)', marginTop: 3, fontWeight: 400,
  },
  brandProduct: {
    marginLeft: 'auto',
    fontSize: 10, fontWeight: 600, letterSpacing: '0.5px',
    color: 'rgba(255,255,255,0.5)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 99, padding: '3px 10px',
    whiteSpace: 'nowrap',
  },
  formBody: { padding: '26px 28px 28px' },
  title: { fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  sub:   { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 },
  errorBox: {
    background: 'var(--danger-bg)', color: 'var(--danger-600)',
    borderRadius: 'var(--radius-md)', padding: '9px 12px',
    fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  spin: { display: 'inline-block', animation: 'spin 1s linear infinite' },
};
