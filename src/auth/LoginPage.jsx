import { useState } from 'react';
import { useAuth } from './AuthContext';
import { isSupabaseConfigured } from '../supabase';

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth();
  const [view, setView]           = useState('login'); // 'login' | 'forgot'
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
        <div style={s.logoRow}>
          <div style={s.logoMark}>M</div>
          <div>
            <div style={s.logoName}>MedNet</div>
            <div style={s.logoSub}>Fadiga Zero · Painel Operacional</div>
          </div>
        </div>

        {view === 'login' ? (
          <>
            <div style={s.title}>Entrar na plataforma</div>
            <div style={s.sub}>Use as credenciais fornecidas pelo administrador</div>
            <form onSubmit={handleLogin} style={{ marginTop: 24 }}>
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
            <form onSubmit={handleReset} style={{ marginTop: 24 }}>
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
            <i className="ti ti-settings-exclamation"></i> Supabase não configurado — defina as variáveis de ambiente na Vercel.
          </div>
        )}

        {view === 'login' && (
          <div style={s.hint}><i className="ti ti-info-circle"></i> Não tem acesso? Fale com o administrador da equipe.</div>
        )}
      </div>
    </div>
  );
}

const s = {
  root:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)', padding: 16 },
  card:    { background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '36px 40px', width: 420, maxWidth: '100%', boxShadow: 'var(--shadow-lg)' },
  logoRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 },
  logoMark:{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 14px var(--accent-glow)', flexShrink: 0 },
  logoName:{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  logoSub: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 },
  title:   { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' },
  sub:     { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  errorBox:{ background: 'var(--danger-bg)', color: 'var(--danger-600)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  infoBox: { background: 'var(--success-bg,#e6f9ed)', color: 'var(--success-600,#1a7a3a)', borderRadius: 'var(--radius-md)', padding: '9px 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  hint:    { marginTop: 20, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'center' },
  linkBtn: { display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--accent-500)', textAlign: 'center', padding: '4px 0' },
  spin:    { display: 'inline-block', animation: 'spin 1s linear infinite' },
};
