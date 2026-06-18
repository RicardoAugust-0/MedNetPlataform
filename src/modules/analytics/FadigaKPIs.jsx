export default function FadigaKPIs({ d }) {
  const k = d ? d.kpis : {};
  const pct = (v) => (v == null ? '—' : v + '%');

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

  const kpis = [
    {
      icon: 'ti-alert-triangle',
      label: 'Total de alertas',
      value: d ? k.total.toLocaleString('pt-BR') : '—',
      sub: d
        ? `${d.meta.motoristas.toLocaleString('pt-BR')} motoristas · ${d.meta.veiculos.toLocaleString('pt-BR')} veículos`
        : 'aguardando importação',
      iconStyle: iconStyle('#9E1A45', 'rgba(158,26,69,0.10)'),
    },
    {
      icon: 'ti-eye-check',
      label: 'Alertas positivos',
      value: d ? pct(k.pct_positivo) : '—',
      sub: 'fadiga / desatenção confirmada',
      iconStyle: iconStyle('#E24B4A', '#FCEBEB'),
    },
    {
      icon: 'ti-shield-x',
      label: 'Falso positivo',
      value: d ? pct(k.pct_falso) : '—',
      sub: d ? `${k.pct_naoclass}% sem classificação` : ' ',
      iconStyle: iconStyle('#E8A020', '#FAEEDA'),
    },
    {
      icon: 'ti-help-circle',
      label: 'Sem classificação',
      value: d ? pct(k.pct_naoclass) : '—',
      sub: 'aguardando análise da operação',
      iconStyle: iconStyle('var(--text-secondary, #8A94A6)', 'var(--surface-2, #EAECF1)'),
    },
    {
      icon: 'ti-gauge',
      label: 'Velocidade mediana',
      value: d && k.vel_mediana != null ? k.vel_mediana + ' km/h' : '—',
      sub: d && k.pct_vel_alta != null ? `${k.pct_vel_alta}% acima de 60 km/h` : 'sem dados de velocidade',
      iconStyle: iconStyle('#2A8DD9', '#E6F1FB'),
    },
    {
      icon: 'ti-video',
      label: 'Com evidência',
      value: d && k.pct_evidencia != null ? pct(k.pct_evidencia) : '—',
      sub: 'vídeo disponível p/ auditoria',
      iconStyle: iconStyle('#2DA75A', '#E5F5EA'),
    },
    {
      icon: 'ti-clock-play',
      label: 'Tempo até tratar',
      value: d && k.t_ini_mediana != null ? k.t_ini_mediana + ' min' : '—',
      sub: 'mediana do início da tratativa',
      iconStyle: iconStyle('#9E1A45', 'rgba(158,26,69,0.10)'),
    },
    {
      icon: 'ti-clock-check',
      label: 'Tempo até finalizar',
      value: d && k.t_fin_mediana != null ? k.t_fin_mediana + ' min' : '—',
      sub: 'mediana até finalização',
      iconStyle: iconStyle('#2DA75A', '#E5F5EA'),
    },
  ];

  return (
    <div className="kpi-grid">
      {kpis.map((k, idx) => (
        <div key={idx} data-card className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={k.iconStyle}>
              <i className={`ti ${k.icon}`}></i>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 600, lineHeight: 1.3 }}>
              {k.label}
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1, margin: '12px 0 6px', fontFeatureSettings: "'tnum'" }}>
            {k.value}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', minHeight: '15px' }}>
            {k.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
