// Alertas técnicos: câmera obstruída, perda de vídeo, sem motorista.
// Não geram intervenção mas precisam ser reportados às transportadoras.
export function TechAlerts({ tecnicos }) {
  const total = tecnicos.reduce((s, t) => s + t.count, 0);
  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(42, 141, 217, 0.14)', color: 'var(--info-500)' }}><i className="ti ti-tools"></i></div>
        <h3>Atenção técnica</h3>
        <span className="sub">· requer reporte à transportadora</span>
        <div className="right">
          <span className="pillc">{total} ocorrências</span>
        </div>
      </div>
      <div className="dg-tech">
        {tecnicos.map(t => (
          <div key={t.id} className="dg-tech-row">
            <div className="dg-tech-ic"><i className={`ti ${t.icon}`}></i></div>
            <div className="dg-tech-info">
              <div className="dg-tech-name">{t.label}</div>
              <div className="dg-tech-meta">
                {t.placas.slice(0, 3).join(' · ')}
                {t.placas.length > 3 && <span style={{ color: 'var(--text-muted)' }}> · +{t.placas.length - 3}</span>}
              </div>
            </div>
            <div className="dg-tech-count">{t.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
