import { useAuth } from '../auth/AuthContext.jsx';

const LogoSVG = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, borderRadius: 10, boxShadow: '0 8px 24px rgba(158,26,69,0.45)' }}>
    <defs>
      <linearGradient id="maint-logo-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#9E1A45"/>
        <stop offset="100%" stopColor="#5A0F25"/>
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="7" fill="url(#maint-logo-bg)"/>
    <text x="15" y="23" fontFamily="system-ui,-apple-system,sans-serif" fontSize="19" fontWeight="800" fill="white" textAnchor="middle">M</text>
    <rect x="23" y="5" width="2" height="8" rx="1" fill="#F26931"/>
    <rect x="20" y="8" width="8" height="2" rx="1" fill="#F26931"/>
  </svg>
);

export default function MaintenancePage({ message }) {
  const { signOut } = useAuth();

  return (
    <div style={s.root}>
      <div style={s.card}>
        <div style={s.brandHeader}>
          <LogoSVG size={50} />
          <div>
            <div style={s.brandGrupo}>GRUPO</div>
            <div style={s.brandName}>
              Med<span style={{ color: '#F26931' }}>Net</span>
            </div>
            <div style={s.brandTagline}>Medicina e Segurança do Trabalho</div>
          </div>
          <div style={s.brandProduct}>Fadiga Zero</div>
        </div>

        <div style={s.body}>
          <div style={s.iconWrap}>
            <i className="ti ti-tools" style={s.icon}></i>
          </div>

          <div style={s.title}>Plataforma em manutenção</div>
          <div style={s.sub}>
            {message?.trim()
              ? message
              : 'Desculpe, a plataforma está em manutenção no momento. Estamos trabalhando para voltar o mais rápido possível.'}
          </div>

          <div style={s.hint}>
            <i className="ti ti-info-circle"></i>
            Tente novamente em alguns minutos. Esta página atualiza automaticamente quando o sistema voltar.
          </div>

          <button onClick={signOut} style={s.logoutBtn}>
            <i className="ti ti-logout"></i> Sair
          </button>
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
    width: 480, maxWidth: '100%',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  brandHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '24px 28px 22px',
    background: 'linear-gradient(135deg, #1A0308 0%, #350A16 60%, #5A0F25 100%)',
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
  body: { padding: '32px 32px 28px', textAlign: 'center' },
  iconWrap: {
    width: 76, height: 76, borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(242,105,49,0.15), rgba(158,26,69,0.12))',
    display: 'grid', placeItems: 'center',
    margin: '0 auto 18px',
  },
  icon: { fontSize: 38, color: '#F26931' },
  title: {
    fontSize: 20, fontWeight: 700,
    color: 'var(--text-primary)', letterSpacing: '-0.3px',
  },
  sub: {
    fontSize: 13.5, color: 'var(--text-muted)',
    marginTop: 10, lineHeight: 1.55,
    maxWidth: 380, marginLeft: 'auto', marginRight: 'auto',
  },
  hint: {
    marginTop: 22, padding: '10px 14px',
    background: 'var(--surface-1, rgba(255,255,255,0.03))',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 11.5, color: 'var(--text-muted)',
    display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center',
  },
  logoutBtn: {
    marginTop: 18,
    background: 'none', border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 16px', fontSize: 12.5,
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  },
};
