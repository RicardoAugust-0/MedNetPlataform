import { AnimatedNumber } from '../../components/AnimatedNumber';

export default function FadigaKPIs({ d, prevD, activeKpi, setActiveKpi }) {
  const kpiData = d ? d.kpis : {};
  const pct = (v) => (v == null ? '—' : <><AnimatedNumber value={v} decimals={1} />%</>);
  const num = (v, suffix = '', decimals = 0) => (v == null ? '—' : <><AnimatedNumber value={v} decimals={decimals} />{suffix}</>);

  const iconStyle = (accent, soft) => ({
    width: '30px',
    height: '30px',
    borderRadius: '8px',
    display: 'grid',
    placeItems: 'center',
    fontSize: '16px',
    flexShrink: 0,
    background: soft,
    color: accent,
  });

  const renderTrend = (activeVal, prevVal, isRate, label) => {
    if (activeVal == null || prevVal == null || prevVal === 0) return null;
    
    let diff;
    if (isRate) {
      diff = activeVal - prevVal;
    } else {
      diff = ((activeVal - prevVal) / prevVal) * 100;
    }
    
    const absDiff = Math.abs(diff).toFixed(1).replace('.0', '');
    const isUp = diff > 0;
    
    if (diff === 0) {
      return (
        <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 500 }}>
          0% vs anterior
        </span>
      );
    }
    
    const goodUpLabels = ['Alertas positivos', 'Com evidência'];
    const isGoodUp = goodUpLabels.includes(label);
    
    let color;
    if (isUp) {
      color = isGoodUp ? 'var(--success-500, #2DA75A)' : 'var(--danger-500, #E24B4A)';
    } else {
      color = isGoodUp ? 'var(--danger-500, #E24B4A)' : 'var(--success-500, #2DA75A)';
    }
    
    return (
      <span style={{
        fontSize: '11px',
        color: color,
        marginLeft: '6px',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px'
      }}>
        {isUp ? '▲' : '▼'} {absDiff}% vs anterior
      </span>
    );
  };

  const kpis = [
    {
      id: 'total',
      icon: 'ti-alert-triangle',
      label: 'Total de alertas',
      value: d && kpiData?.total != null ? <AnimatedNumber value={kpiData.total} /> : '—',
      sub: d
        ? `${d.meta.motoristas.toLocaleString('pt-BR')} motoristas · ${d.meta.veiculos.toLocaleString('pt-BR')} veículos`
        : 'aguardando importação',
      iconStyle: iconStyle('#9E1A45', 'rgba(158,26,69,0.10)'),
      trend: renderTrend(kpiData?.total, prevD?.kpis?.total, false, 'Total de alertas'),
    },
    {
      id: 'positivo',
      icon: 'ti-eye-check',
      label: 'Alertas positivos',
      value: d ? pct(kpiData?.pct_positivo) : '—',
      sub: 'fadiga / desatenção confirmada',
      iconStyle: iconStyle('#E24B4A', '#FCEBEB'),
      trend: renderTrend(kpiData?.pct_positivo, prevD?.kpis?.pct_positivo, true, 'Alertas positivos'),
    },
    {
      id: 'falso',
      icon: 'ti-shield-x',
      label: 'Falso positivo',
      value: d ? pct(kpiData?.pct_falso) : '—',
      sub: d ? `${kpiData?.pct_naoclass}% sem classificação` : ' ',
      iconStyle: iconStyle('#E8A020', '#FAEEDA'),
      trend: renderTrend(kpiData?.pct_falso, prevD?.kpis?.pct_falso, true, 'Falso positivo'),
    },
    {
      id: 'naoclass',
      icon: 'ti-help-circle',
      label: 'Sem classificação',
      value: d ? pct(kpiData?.pct_naoclass) : '—',
      sub: 'aguardando análise da operação',
      iconStyle: iconStyle('var(--text-secondary, #8A94A6)', 'var(--surface-2, #EAECF1)'),
      trend: renderTrend(kpiData?.pct_naoclass, prevD?.kpis?.pct_naoclass, true, 'Sem classificação'),
    },
    {
      id: 'velocidade',
      icon: 'ti-gauge',
      label: 'Velocidade mediana',
      value: d ? num(kpiData?.vel_mediana, ' km/h') : '—',
      sub: d && kpiData?.pct_vel_alta != null ? `${kpiData.pct_vel_alta}% acima de 60 km/h` : 'sem dados de velocidade',
      iconStyle: iconStyle('#2A8DD9', '#E6F1FB'),
      trend: renderTrend(kpiData?.vel_mediana, prevD?.kpis?.vel_mediana, false, 'Velocidade mediana'),
    },
    {
      id: 'evidencia',
      icon: 'ti-video',
      label: 'Com evidência',
      value: d ? pct(kpiData?.pct_evidencia) : '—',
      sub: 'vídeo disponível p/ auditoria',
      iconStyle: iconStyle('#2DA75A', '#E5F5EA'),
      trend: renderTrend(kpiData?.pct_evidencia, prevD?.kpis?.pct_evidencia, true, 'Com evidência'),
    },
    {
      id: 'tempo_tratar',
      icon: 'ti-clock-play',
      label: 'Tempo até tratar',
      value: d ? num(kpiData?.t_ini_mediana, ' min', 1) : '—',
      sub: 'mediana do início da tratativa',
      iconStyle: iconStyle('#9E1A45', 'rgba(158,26,69,0.10)'),
      trend: renderTrend(kpiData?.t_ini_mediana, prevD?.kpis?.t_ini_mediana, false, 'Tempo até tratar'),
    },
    {
      id: 'tempo_finalizar',
      icon: 'ti-clock-check',
      label: 'Tempo até finalizar',
      value: d ? num(kpiData?.t_fin_mediana, ' min', 1) : '—',
      sub: 'mediana até finalização',
      iconStyle: iconStyle('#2DA75A', '#E5F5EA'),
      trend: renderTrend(kpiData?.t_fin_mediana, prevD?.kpis?.t_fin_mediana, false, 'Tempo até finalizar'),
    },
  ];

  const handleCardClick = (id) => {
    if (setActiveKpi) {
      setActiveKpi(activeKpi === id ? null : id);
    }
  };

  return (
    <div className="kpi-grid">
      {kpis.map((k, idx) => {
        const isActive = activeKpi === k.id;
        return (
          <div
            key={k.id}
            data-card
            className={`card clickable${isActive ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick(k.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(k.id); } }}
            style={{
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={k.iconStyle}>
                <i className={`ti ${k.icon}`}></i>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, lineHeight: 1.3 }}>
                {k.label}
              </div>
              <i
                className="ti ti-chevron-right"
                style={{
                  marginLeft: 'auto',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  transition: 'transform 0.2s ease',
                  transform: isActive ? 'rotate(90deg)' : 'none',
                }}
              ></i>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flexWrap: 'wrap', margin: '12px 0 6px' }}>
              <span style={{ fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1, fontFeatureSettings: "'tnum'" }}>
                {k.value}
              </span>
              {k.trend}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', minHeight: '15px' }}>
              {k.sub}
            </div>
          </div>
        );
      })}
    </div>
  );
}
