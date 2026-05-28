export function TransportadoraRanking({ transportadoras }) {
  const max = Math.max(...transportadoras.map(t => t.total), 1);
  const totalAbertos = transportadoras.reduce((s, t) => s + t.abertos, 0);
  return (
    <div className="dg-card dg-card-transportadora">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(42, 141, 217, 0.14)', color: 'var(--info-500)' }}><i className="ti ti-building-community"></i></div>
        <h3>Transportadoras</h3>
        <span className="sub">· alertas no dia</span>
        <div className="right">
          <span className="pillc"><span style={{ color: 'var(--warning-500)', fontWeight: 700 }}>{totalAbertos}</span>&nbsp;em aberto</span>
        </div>
      </div>
      <div className="dg-trans">
        {transportadoras.length === 0 ? (
          <div style={{ display: 'grid', placeItems: 'center', height: 120, color: 'var(--text-muted)', fontSize: 13 }}>
            Sem alertas registrados hoje
          </div>
        ) : (
          transportadoras.map((t, i) => {
            const pct = (t.total / max) * 100;
            return (
              <div key={t.name} className="dg-trans-row">
                <span className="dg-trans-pos">#{i+1}</span>
                <div className="dg-trans-info">
                  <div className="dg-trans-nm">{t.name}</div>
                  <div className="dg-trans-bar"><span style={{ width: `${pct}%`, background: i === 0 ? 'var(--danger-500)' : i < 3 ? 'var(--warning-500)' : 'var(--accent-500)' }}></span></div>
                </div>
                <div className="dg-trans-meta" style={{ display: 'none' }}></div> {/* keep stable spacing */}
                <div className="dg-trans-mt">
                  <span style={{ color: 'var(--warning-500)', fontWeight: 700 }}>{t.abertos}</span> aberto<br/>
                  <span style={{ color: 'var(--info-500)', fontWeight: 600 }}><i className="ti ti-refresh" style={{ fontSize: 9 }}></i>{t.posPositivos}</span> reinc.
                </div>
                <span className="dg-trans-vl">{t.total}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
