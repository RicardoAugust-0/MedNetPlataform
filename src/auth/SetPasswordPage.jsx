import { useState } from 'react';
import { useAuth } from './AuthContext';

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
        <div style={styles.logoRow}>
          <div style={styles.logoMark}>M</div>
          <div>
            <div style={styles.logoName}>MedNet</div>
            <div style={styles.logoSub}>Fadiga Zero · Painel Operacional</div>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
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

            <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
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
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-app)',
    padding: 16,
  },
  card: {
    background: 'var(--surface-0)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    padding: '36px 40px',
    width: 420,
    maxWidth: '100%',
    boxShadow: 'var(--shadow-lg)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 11,
    background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
    display: 'grid',
    placeItems: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    boxShadow: '0 4px 14px var(--accent-glow)',
    flexShrink: 0,
  },
  logoName: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  logoSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  sub: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 4,
  },
  errorBox: {
    background: 'var(--danger-bg)',
    color: 'var(--danger-600)',
    borderRadius: 'var(--radius-md)',
    padding: '9px 12px',
    fontSize: 12.5,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  spin: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
};
