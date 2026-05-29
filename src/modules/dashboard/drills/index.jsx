// Drill panels exibidos abaixo dos KPI cards quando o usuário clica em um KPI.
// Cada painel = 3 colunas com cortes distintos da métrica selecionada.

export function VolumeDrill({ TIPOS, RESULTADOS, transpStats }) {
  return (
    <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid #F26931' }}>
      <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
        <div className="dg-drill-col">
          <h4>Por tipo (origem)</h4>
          {TIPOS.map(c => (
            <div key={c.id} className="dg-drill-line">
              <span>
                <span style={{ display: 'inline-block', width: 9, height: 9, background: c.color, borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                {c.label}
              </span>
              <span className="v" style={{ color: c.color }}>{c.count}</span>
            </div>
          ))}
        </div>
        <div className="dg-drill-col">
          <h4>Por resultado</h4>
          {RESULTADOS.map(c => (
            <div key={c.id} className="dg-drill-line">
              <span>
                <span style={{ display: 'inline-block', width: 9, height: 9, background: c.color, borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                {c.label}
              </span>
              <span className="v" style={{ color: c.color }}>{c.count}</span>
            </div>
          ))}
        </div>
        <div className="dg-drill-col">
          <h4>Top 4 transportadoras</h4>
          {transpStats.slice(0, 4).map(t => (
            <div key={t.name} className="dg-drill-line">
              <span>{t.name}</span>
              <span className="v">{t.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FechadosDrill({ positivo, posPositivo, fechados, taxaReinc, pctConcluido, equipe }) {
  return (
    <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid var(--success-500)' }}>
      <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
        <div className="dg-drill-col">
          <h4>Intervenções</h4>
          <div className="dg-drill-line">
            <span>Positivos</span>
            <span className="v" style={{ color: '#2DA75A' }}>{positivo}</span>
          </div>
          <div className="dg-drill-line">
            <span>Pós-positivos</span>
            <span className="v" style={{ color: '#2A8DD9' }}>{posPositivo}</span>
          </div>
          <div className="dg-drill-line">
            <span>Total</span>
            <span className="v">{fechados}</span>
          </div>
        </div>
        <div className="dg-drill-col">
          <h4>Reincidência</h4>
          <div className="dg-drill-line">
            <span>Taxa</span>
            <span className="v" style={{ color: posPositivo > 0 ? '#2A8DD9' : 'var(--success-500)' }}>
              {taxaReinc.toFixed(1)}%
            </span>
          </div>
          <div className="dg-drill-line">
            <span>Concluído</span>
            <span className="v">{pctConcluido}%</span>
          </div>
        </div>
        <div className="dg-drill-col">
          <h4>Por operador (top 4)</h4>
          {equipe.slice(0, 4).map(op => {
            const t = op.tratados.fadigaPos + op.tratados.fadigaPP + op.tratados.compPos;
            return (
              <div key={op.nome} className="dg-drill-line">
                <span>{op.nome.split(' ')[0]}</span>
                <span className="v">{t}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function EmAbertoDrill({ criticos, slaVencidos, emAberto, TIPOS, transpStats }) {
  return (
    <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid var(--warning-500)' }}>
      <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
        <div className="dg-drill-col">
          <h4>Por severidade</h4>
          <div className="dg-drill-line">
            <span>Críticos</span>
            <span className="v" style={{ color: 'var(--danger-500)' }}>{criticos.length}</span>
          </div>
          <div className="dg-drill-line">
            <span>SLA vencido</span>
            <span className="v" style={{ color: slaVencidos > 0 ? 'var(--danger-500)' : 'var(--text-muted)' }}>{slaVencidos}</span>
          </div>
          <div className="dg-drill-line">
            <span>Total em aberto</span>
            <span className="v">{emAberto}</span>
          </div>
        </div>
        <div className="dg-drill-col">
          <h4>Por tipo</h4>
          {TIPOS.map(c => (
            <div key={c.id} className="dg-drill-line">
              <span>{c.label}</span>
              <span className="v" style={{ color: c.color }}>{c.count}</span>
            </div>
          ))}
        </div>
        <div className="dg-drill-col">
          <h4>Top transportadoras</h4>
          {transpStats.slice(0, 4).map(t => (
            <div key={t.name} className="dg-drill-line">
              <span>{t.name.length > 20 ? t.name.slice(0, 18) + '…' : t.name}</span>
              <span className="v">{t.abertos}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReincidenciaDrill({ reincidentesAtivos, posPositivo, taxaReinc, criticos, ONTEM }) {
  const reincidentes = criticos.filter(c => c.reincidente);
  return (
    <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid #2A8DD9' }}>
      <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
        <div className="dg-drill-col">
          <h4>Resumo</h4>
          <div className="dg-drill-line">
            <span>Em aberto</span>
            <span className="v" style={{ color: '#2A8DD9' }}>{reincidentesAtivos}</span>
          </div>
          <div className="dg-drill-line">
            <span>Tratados hoje</span>
            <span className="v" style={{ color: '#2A8DD9' }}>{posPositivo}</span>
          </div>
          <div className="dg-drill-line">
            <span>Taxa de reinc.</span>
            <span className="v">{taxaReinc.toFixed(1)}%</span>
          </div>
          <div className="dg-drill-line">
            <span>Janela de referência</span>
            <span className="v">30d</span>
          </div>
        </div>
        <div className="dg-drill-col">
          <h4>Motoristas reincidentes</h4>
          {reincidentes.slice(0, 4).map(c => (
            <div key={c.placa} className="dg-drill-line">
              <span>{c.nome.split(' ')[0]}</span>
              <span className="v" style={{ color: '#2A8DD9' }}>{c.placa}</span>
            </div>
          ))}
          {reincidentes.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 6 }}>
              Nenhum reincidente crítico no momento
            </div>
          )}
        </div>
        <div className="dg-drill-col">
          <h4>Ontem</h4>
          {ONTEM ? (
            <>
              <div className="dg-drill-line">
                <span>Intervenções</span>
                <span className="v">{ONTEM.fechados}</span>
              </div>
              <div className="dg-drill-line">
                <span>Pós-positivos</span>
                <span className="v" style={{ color: '#2A8DD9' }}>{ONTEM.posPositivo}</span>
              </div>
              <div className="dg-drill-line">
                <span>Taxa</span>
                <span className="v">{ONTEM.fechados > 0 ? ((ONTEM.posPositivo / ONTEM.fechados) * 100).toFixed(1) : '0.0'}%</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 6 }}>Comparação desativada</div>
          )}
        </div>
      </div>
    </div>
  );
}
