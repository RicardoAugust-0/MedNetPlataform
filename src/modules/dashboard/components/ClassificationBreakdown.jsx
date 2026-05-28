import { COLORS, Donut } from './_shared';

// Classification breakdown — duas dimensões: Tipo × Resultado.
// Donut = TIPO (Fadiga vs Comportamento, vem da plataforma).
// Painel lateral = RESULTADO (Positivo, Pós-positivo, Em aberto) com
// destaque grande para a TAXA DE REINCIDÊNCIA — KPI de qualidade.
export function ClassificationBreakdown({ tipos, resultados }) {
  const C = COLORS;
  const totalTipo = tipos.reduce((s, c) => s + c.count, 0);
  const positivo = resultados.find(r => r.id === 'positivo')?.count || 0;
  const posPositivo = resultados.find(r => r.id === 'pos-positivo')?.count || 0;
  const aberto = resultados.find(r => r.id === 'aberto')?.count || 0;
  const tratados = positivo + posPositivo;
  const taxaReinc = tratados > 0 ? (posPositivo / tratados) * 100 : 0;

  return (
    <div className="dg-card dg-card-classification">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(158, 26, 69, 0.14)', color: 'var(--accent-500)' }}><i className="ti ti-chart-pie"></i></div>
        <h3>Tipo & Resultado</h3>
        <div className="right">
          <span className="pillc">{totalTipo} eventos</span>
        </div>
      </div>

      <div className="dg-class">
        <div className="dg-donut">
          <Donut items={tipos} total={totalTipo} />
          <div className="cap">
            <div>
              <div className="v">{totalTipo}</div>
              <div className="l">total dia</div>
            </div>
          </div>
        </div>
        <div className="dg-class-list">
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Origem do alerta
          </div>
          {tipos.map(c => {
            const pct = totalTipo > 0 ? Math.round((c.count / totalTipo) * 100) : 0;
            return (
              <div key={c.id} className="dg-class-row">
                <span className="dg-class-sw" style={{ background: c.color }}></span>
                <span className="dg-class-nm">{c.label}</span>
                <span className="dg-class-vl">{c.count}</span>
                <span className="dg-class-pc">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Linha de resultado (destacada com fundo) */}
      <div style={{
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border)',
        padding: '14px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 14,
        alignItems: 'stretch',
      }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            <i className="ti ti-check" style={{ fontSize: 11, marginRight: 3 }}></i>Resultado
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="dg-class-row" style={{ gap: 6 }}>
              <span className="dg-class-sw" style={{ background: C.positivo }}></span>
              <span className="dg-class-nm" style={{ fontSize: 11.5 }}>Positivo</span>
              <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{positivo}</span>
            </div>
            <div className="dg-class-row" style={{ gap: 6 }}>
              <span className="dg-class-sw" style={{ background: C.posPositivo }}></span>
              <span className="dg-class-nm" style={{ fontSize: 11.5 }}>Pós-positivo <i className="ti ti-refresh" style={{ fontSize: 10, color: C.posPositivo }}></i></span>
              <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{posPositivo}</span>
            </div>
            <div className="dg-class-row" style={{ gap: 6 }}>
              <span className="dg-class-sw" style={{ background: C.aberto }}></span>
              <span className="dg-class-nm" style={{ fontSize: 11.5 }}>Em aberto</span>
              <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{aberto}</span>
            </div>
          </div>
        </div>

        <div style={{
          gridColumn: 'span 2',
          borderLeft: '1px solid var(--border)',
          paddingLeft: 14,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-refresh" style={{ fontSize: 11, color: C.posPositivo }}></i>
            Taxa de reincidência
            <span style={{ marginLeft: 'auto', textTransform: 'none', fontWeight: 500, letterSpacing: 0, color: 'var(--text-muted)' }}>{posPositivo}/{tratados} tratados</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 32, fontWeight: 800, letterSpacing: '-1px',
              color: taxaReinc >= 25 ? C.posPositivo : 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>{taxaReinc.toFixed(1)}%</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {taxaReinc >= 25 ? 'acima do esperado' : taxaReinc >= 15 ? 'dentro da faixa' : 'baixa — bom sinal'}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
            <span style={{ width: tratados > 0 ? `${(positivo/tratados)*100}%` : '0%', background: C.positivo }}></span>
            <span style={{ width: tratados > 0 ? `${(posPositivo/tratados)*100}%` : '0%', background: C.posPositivo }}></span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Pós-positivo = motorista voltou a gerar alerta APÓS intervenção já realizada. Indicador de qualidade do atendimento.
          </div>
        </div>
      </div>
    </div>
  );
}
