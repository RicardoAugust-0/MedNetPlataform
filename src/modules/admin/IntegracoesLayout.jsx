import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './adminSubnav.css';

// /admin/integracoes — separa configuração técnica (credenciais) das regras de
// negócio operacionais (de-para de transportadoras). Cada uma é uma sub-rota.
const SUB_TABS = [
  { to: 'credenciais',     label: 'Credenciais & OmniLink', icon: 'ti-key' },
  { to: 'transportadoras', label: 'Transportadoras (de-para)', icon: 'ti-replace' },
  { to: 'horizon',         label: 'Horizon (contas)', icon: 'ti-cloud-download' },
];

export default function IntegracoesLayout() {
  return (
    <div style={{ width: '100%' }}>
      <div className="admin-subnav">
        {SUB_TABS.map(t => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) => 'admin-subnav-pill' + (isActive ? ' active' : '')}
          >
            <i className={`ti ${t.icon}`}></i> {t.label}
          </NavLink>
        ))}
      </div>
      <Suspense fallback={<div className="empty-state"><i className="ti ti-loader-2 fz-spin"></i> Carregando…</div>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
