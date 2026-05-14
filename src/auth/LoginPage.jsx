import { useState } from 'react';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured } from '../supabase';

const LogoSVG = ({ size = 44 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: 9, boxShadow: '0 6px 20px rgba(158,26,69,0.45)' }}>
    <defs>
      <linearGradient id="login-logo-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#9E1A45"/>
        <stop offset="100%" stopColor="#5A0F25"/>
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="url(#login-logo-bg)"/>
    <text x="15" y="23" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="800" fill="white" textAnchor="middle">M</text>
    <rect x="23" y="5" width="2" height="8" rx="1" fill="#F26931"/>
    <rect x="20" y="8" width="8" height="2" rx="1" fill="#F26931"/>
  </svg>
);

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const [view, setView]           = useState('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [error, setError]         = useState('');
  const [info, setInfo]           = useState('');
  const [loading, setLoading]     = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true); setError(''); setInfo('');
    const { error: err } = await signIn(email, password);
    if (err) setError(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : err.message);
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true); setError(''); setInfo('');
    const { error: err } = await resetPassword(email);
    if (err) setError(err.message);
    else setInfo('E-mail de recuperação enviado. Verifique sua caixa de entrada.');
    setLoading(false);
  };

  return (
    <div style={s.root}>
      <div style={s.card}>

        {/* ── Header brandado MedNet ── */}
        <div style={s.brandHeader}>
          <LogoSVG size={46} />
          <div>
            <div style={s.brandGrupo}>GRUPO</div>
            <div style={s.brandName}>
              Med<span style={{ color: '#F26931' }}>Net</span>
            </div>
            <div style={s.brandTagline}>Medicina e Segurança do Trabalho</div>
          </div>
          <div style={s.brandProduct}>Fadiga Zero</div>
        </div>

        {/* ── Formulário ── */}
        <div style={s.formBody}>
          {view === 'login' ? (
            <>
              <div style={s.title}>Entrar na plataforma</div>
              <div style={s.sub}>Use as credenciais fornecidas pelo administrador</div>
              <form onSubmit={handleLogin} style={{ marginTop: 22 }}>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-control" type="email" placeholder="operador@mednet.com.br" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <input className="form-control" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
                {error && <div style={s.errorBox}><i className="ti ti-alert-circle"></i> {error}</div>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '10px' }} disabled={loading}>
                  {loading ? <><i className="ti ti-loader-2" style={s.spin}></i> Entrando…</> : 'Entrar'}
                </button>
              </form>
              <button style={s.linkBtn} onClick={() => { setView('forgot'); setError(''); setInfo(''); }}>
                Esqueceu a senha?
              </button>
            </>
          ) : (
            <>
              <div style={s.title}>Recuperar senha</div>
              <div style={s.sub}>Enviaremos um link para redefinir sua senha</div>
              <form onSubmit={handleReset} style={{ marginTop: 22 }}>
                <div className="form-group">
                  <label className="form-label">E-mail da conta</label>
                  <input className="form-control" type="email" placeholder="operador@mednet.com.br" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                </div>
                {error && <div style={s.errorBox}><i className="ti ti-alert-circle"></i> {error}</div>}
                {info  && <div style={s.infoBox}><i className="ti ti-circle-check"></i> {info}</div>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '10px' }} disabled={loading}>
                  {loading ? <><i className="ti ti-loader-2" style={s.spin}></i> Enviando…</> : 'Enviar link de recuperação'}
                </button>
              </form>
              <button style={s.linkBtn} onClick={() => { setView('login'); setError(''); setInfo(''); }}>
                ← Voltar ao login
              </button>
            </>
          )}

          {!isSupabaseConfigured && (
            <div style={{ ...s.errorBox, marginTop: 16 }}>
              <i className="ti ti-settings-exclamation"></i> Supabase não configurado. No modo local, qualquer e-mail/senha permite acesso (use admin@mednet.com.br para testar modo admin).
            </div>
          )}

          {view === 'login' && (
            <div style={s.hint}><i className="ti ti-info-circle"></i> Não tem acesso? Fale com o administrador da equipe.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
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

  /* Header brandado */
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

  /* Corpo do formulário */
  formBody: { padding: '26px 28px 28px' },

  title:   { fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  sub:     { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 },
  errorBox:{ background: 'var(--danger-bg)', color: 'var(--danger-600)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  infoBox: { background: 'var(--success-bg,#e6f9ed)', color: 'var(--success-600,#1a7a3a)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  hint:    { marginTop: 20, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' },
  linkBtn: { display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--accent-500)', textAlign: 'center', padding: '4px 0' },
  spin:    { display: 'inline-block', animation: 'spin 1s linear infinite' },
};
