export function Banner({ tone = 'danger', icon, title, sub, action }) {
  return (
    <div className={`dg-banner ${tone === 'warn' ? 'warn' : ''}`}>
      <div className={`ic ${tone}`}><i className={`ti ${icon}`}></i></div>
      <div className="txt">
        <div className="ttl">{title}</div>
        <div className="sb">{sub}</div>
      </div>
      {action && <button className="dg-btn dg-btn-primary">{action} <i className="ti ti-arrow-right"></i></button>}
    </div>
  );
}
