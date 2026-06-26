import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

// Sub-navegação do escopo /admin. Cada aba é uma rota real (via <Outlet/>),
// não mais um estado local — a URL passa a refletir a aba ativa.
const ADMIN_TABS = [
  { to: 'analytics',   label: 'Analytics',        icon: 'ti-chart-pie' },
  { to: 'equipe',      label: 'Equipe & Acessos', icon: 'ti-users' },
  { to: 'integracoes', label: 'Integrações',      icon: 'ti-api' },
  { to: 'ia',          label: 'IA & Parsing',     icon: 'ti-cpu' },
  { to: 'sistema',     label: 'Sistema',          icon: 'ti-settings' },
];

export default function AdminLayout() {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Tab bar — real routes via NavLink (isActive resolvido pelo Router) */}
      <div style={{
        display: 'flex', gap: 4, borderBottom: '1px solid var(--border)',
        paddingBottom: 2, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {ADMIN_TABS.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            style={({ isActive }) => ({
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
              border: 'none', background: 'none', fontSize: 13, textDecoration: 'none',
              fontWeight: isActive ? 600 : 500,
              color: isActive ? '#9E1A45' : 'var(--text-muted, #8A94A6)',
              borderBottom: isActive ? '2.5px solid #9E1A45' : '2.5px solid transparent',
              whiteSpace: 'nowrap', fontFamily: 'inherit',
            })}
          >
            <i className={`ti ${tab.icon}`} style={{ fontSize: 15 }}></i>
            {tab.label}
          </NavLink>
        ))}
      </div>

      {/* Só o leaf troca ao mudar de aba; o layout permanece montado */}
      <Suspense fallback={<div className="empty-state"><i className="ti ti-loader-2 fz-spin"></i> Carregando…</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
