// Estado vazio padrão (ícone + mensagem + sub-mensagem opcional) — antes
// vivia só em modules/monitor/utils.jsx e cada módulo reimplementava a
// mesma marcação à mão.
export default function EmptyState({ icon, msg, sub, style, className = '' }) {
  return (
    <div className={`empty-state ${className}`.trim()} style={style}>
      {icon && <i className={`ti ${icon}`}></i>}{msg}
      {sub && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}
