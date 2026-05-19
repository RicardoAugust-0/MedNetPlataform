export function HourlyActivity({ hourly, currentHour = 16 }) {
  const max = Math.max(...hourly.map(h => h.closed + h.open), 1);
  const totalClosed = hourly.reduce((s, h) => s + h.closed, 0);
  const totalOpen = hourly.reduce((s, h) => s + h.open, 0);
  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(232, 160, 32, 0.14)', color: 'var(--warning-500)' }}><i className="ti ti-chart-bar"></i></div>
        <h3>Atividade por hora</h3>
        <span className="sub">· hoje</span>
        <div className="right">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span><span style={{ background: 'var(--accent-500)', width: 10, height: 10, borderRadius: 2, display: 'inline-block', marginRight: 4 }}></span>Fechados {totalClosed}</span>
            <span><span style={{ background: 'var(--warning-500)', width: 10, height: 10, borderRadius: 2, display: 'inline-block', marginRight: 4 }}></span>Em aberto {totalOpen}</span>
          </span>
        </div>
      </div>
      <div className="dg-hourly">
        <div className="dg-hourly-row">
          {hourly.map((h, i) => {
            const total = h.closed + h.open;
            const heightTotal = (total / max) * 100;
            const heightOpen = (h.open / Math.max(total, 1)) * heightTotal;
            const heightClosed = heightTotal - heightOpen;
            const hourNum = parseInt(h.h, 10);
            return (
              <div key={i} className={`dg-hour-bar ${hourNum === currentHour ? 'hour-now' : ''}`} title={`${h.h}: ${h.closed} fechados, ${h.open} abertos`}>
                <div className="dg-tip">{h.h} · {h.closed}f / {h.open}a</div>
                {h.open > 0 && <div className="seg seg-open" style={{ height: `${heightOpen}%`, minHeight: 2 }}></div>}
                {h.closed > 0 && <div className="seg seg-closed" style={{ height: `${heightClosed}%`, minHeight: 2 }}></div>}
              </div>
            );
          })}
        </div>
        <div className="dg-hour-axis">
          {hourly.map((h, i) => {
            const hr = parseInt(h.h, 10);
            // 24 barras: mostra só horas pares pra não poluir; <24 (14h) mostra todas
            const show = hourly.length < 24 || hr % 2 === 0;
            return <span key={i}>{show ? h.h.replace('h', '') : ''}</span>;
          })}
        </div>
      </div>
    </div>
  );
}
