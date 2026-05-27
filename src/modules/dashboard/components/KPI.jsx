import { AnimatedNumber } from './_shared';

export function KPI({ icon, label, value, sub, trend, trendDir, hero, accent, progress, pulse, onClick, active, compareValue, compareLabel = 'ontem', executive }) {
  // Calcula delta automaticamente quando compareValue é fornecido
  let autoTrend = trend;
  let autoTrendDir = trendDir;
  if (compareValue != null && value != null) {
    const delta = value - compareValue;
    const pct = compareValue !== 0 ? (delta / compareValue) * 100 : 0;
    const sign = delta > 0 ? '+' : '';
    autoTrend = `${sign}${pct.toFixed(0)}%`;
    autoTrendDir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  }
  const trendIcon = autoTrendDir === 'up' ? 'ti-trending-up'
                  : autoTrendDir === 'down' ? 'ti-trending-down'
                  : autoTrendDir === 'warn' ? 'ti-alert-triangle'
                  : 'ti-equal';
  return (
    <div
      className={`dg-kpi${hero ? ' is-hero' : ''}${active ? ' is-active' : ''}${executive ? ' is-exec' : ''}`}
      onClick={onClick}
      style={accent && !hero ? { borderTop: `3px solid ${accent}` } : null}
    >
      <div className="dg-kpi-head">
        <div className="dg-kpi-ic" style={!hero && accent ? { color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)` } : null}>
          <i className={`ti ${icon}`}></i>
        </div>
        <div className="dg-kpi-label">{label}</div>
        {onClick && <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: 14, color: hero ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}></i>}
      </div>
      <div className="dg-kpi-value">
        {pulse && <span className="pulse"></span>}
        <AnimatedNumber value={value} />
      </div>
      <div className="dg-kpi-foot">
        {autoTrend && <span className={`dg-kpi-trend ${autoTrendDir}`} title={compareValue != null ? `${compareLabel}: ${compareValue}` : null}><i className={`ti ${trendIcon}`}></i>{autoTrend}{compareValue != null ? ` vs ${compareLabel}` : ''}</span>}
        <span>{sub}</span>
      </div>
      {typeof progress === 'number' && (
        <div className="dg-kpi-bar"><span style={{ width: `${progress}%`, background: accent || '#fff' }}></span></div>
      )}
    </div>
  );
}
