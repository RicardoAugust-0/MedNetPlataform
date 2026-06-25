import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './adminSubnav.css';

// /admin/sistema — separa toggles de operação (manutenção) das ações
// destrutivas/irreversíveis (limpeza de histórico). `logs` fica reservado
// para a trilha de auditoria (etapa 5).
const SUB_TABS = [
  { to: 'manutencao', label: 'Modo manutenção', icon: 'ti-tools' },
  { to: 'limpeza',    label: 'Limpeza de histórico', icon: 'ti-eraser' },
];

export default function SistemaLayout() {
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
