// Enriquece o dashboard com dados da planilha oficial de intervenções:
// TMA (Tempo Médio de Atendimento), distribuição por criticidade/classificação,
// e pendências históricas (solicitadas sem realização registrada).
export function SheetInsights({
  tmaMin,
  tmaSampleSize,
  criticidade,
  classificacao,
  pendencias,
  totalHoje,
  loading,
  error,
  ageMin,
  onRefresh,
  syncing,
}) {
  const fmtTMA = (m) => {
    if (m == null || !isFinite(m)) return '—';
    if (m < 1) return '<1min';
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const r = Math.round(m - h * 60);
    return r > 0 ? `${h}h ${r}min` : `${h}h`;
  };
  const totalCrit = criticidade.reduce((s, c) => s + c.count, 0);
  const totalClassif = classificacao.reduce((s, c) => s + c.count, 0);
  const tmaColor = tmaMin == null ? 'var(--text-muted)'
                  : tmaMin <= 10 ? 'var(--success-500)'
                  : tmaMin <= 30 ? 'var(--warning-500)'
                  : 'var(--danger-500)';

  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(45, 167, 90, 0.14)', color: 'var(--success-500)' }}>
          <i className="ti ti-table"></i>
        </div>
        <h3>Planilha de intervenções</h3>
        <span className="sub">· enriquece o histórico</span>
        <div className="right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {error && (
            <span className="pillc" style={{ color: 'var(--danger-500)' }} title={error}>
              <i className="ti ti-alert-circle"></i> erro
            </span>
          )}
          {!error && ageMin != null && (
            <span className="pillc" title={`Última leitura há ${ageMin} min`}>
              {ageMin < 1 ? 'agora' : ageMin < 60 ? `há ${ageMin} min` : `há ${Math.floor(ageMin / 60)}h`}
            </span>
          )}
          {onRefresh && (
            <button
              className="dg-btn dg-btn-ghost"
              onClick={onRefresh}
              disabled={syncing || loading}
              title="Atualizar planilha agora"
              style={{ padding: '4px 8px' }}
            >
              <i className={`ti ti-refresh${(syncing || loading) ? ' dg-spin' : ''}`}></i>
            </button>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr 1.2fr 0.8fr',
        gap: 0,
      }}>
        {/* TMA */}
        <div style={{ padding: '16px 18px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            <i className="ti ti-clock-bolt" style={{ fontSize: 11, marginRight: 4 }}></i>TMA hoje
          </div>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px',
            color: tmaColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
          }}>{fmtTMA(tmaMin)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
            {tmaSampleSize > 0
              ? `solicitação → realização · ${tmaSampleSize} amostra${tmaSampleSize > 1 ? 's' : ''}`
              : 'sem realizações hoje'}
          </div>
        </div>

        {/* Criticidade */}
        <div style={{ padding: '16px 18px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 11, marginRight: 4 }}></i>Criticidade
            <span style={{ marginLeft: 'auto', float: 'right', fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--text-muted)' }}>{totalCrit}</span>
          </div>
          {criticidade.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Sem dados no período</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {criticidade.map(c => {
                const pct = totalCrit > 0 ? Math.round((c.count / totalCrit) * 100) : 0;
                return (
                  <div key={c.label} className="dg-class-row" style={{ gap: 6 }}>
                    <span className="dg-class-sw" style={{ background: c.color }}></span>
                    <span className="dg-class-nm" style={{ fontSize: 11.5 }}>{c.label}</span>
                    <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{c.count}</span>
                    <span className="dg-class-pc">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Classificação */}
        <div style={{ padding: '16px 18px', borderRight: '1px solid var(--border)' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            <i className="ti ti-tag" style={{ fontSize: 11, marginRight: 4 }}></i>Classificação
            <span style={{ marginLeft: 'auto', float: 'right', fontWeight: 500, letterSpacing: 0, textTransform: 'none', color: 'var(--text-muted)' }}>{totalClassif}</span>
          </div>
          {classificacao.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Sem dados no período</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {classificacao.slice(0, 5).map(c => {
                const pct = totalClassif > 0 ? Math.round((c.count / totalClassif) * 100) : 0;
                return (
                  <div key={c.label} className="dg-class-row" style={{ gap: 6 }}>
                    <span className="dg-class-nm" style={{ fontSize: 11.5 }}>{c.label}</span>
                    <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{c.count}</span>
                    <span className="dg-class-pc">{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pendências */}
        <div style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            <i className="ti ti-clock-pause" style={{ fontSize: 11, marginRight: 4 }}></i>Pendências
          </div>
          <div style={{
            fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px',
            color: pendencias > 0 ? 'var(--warning-500)' : 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.1,
          }}>{pendencias}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
            solicitadas sem realização
          </div>
        </div>
      </div>

      {totalHoje > 0 && (
        <div style={{
          background: 'var(--surface-1)',
          borderTop: '1px solid var(--border)',
          padding: '8px 18px',
          fontSize: 10.5,
          color: 'var(--text-muted)',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}>
          <i className="ti ti-info-circle" style={{ fontSize: 12 }}></i>
          {totalHoje} interven{totalHoje > 1 ? 'ções registradas' : 'ção registrada'} na planilha hoje · reincidência olha 90d desta fonte
        </div>
      )}
    </div>
  );
}
