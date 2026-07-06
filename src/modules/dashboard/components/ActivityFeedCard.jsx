// Feed de atividade ao vivo: últimos atendimentos registrados por qualquer
// operador, em tempo real (ver useActivityFeed.js). Puramente client-side,
// não persiste nada — some ao recarregar a página.
export function ActivityFeedCard({ items = [], lastImport }) {
  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(158, 26, 69, 0.1)', color: 'var(--accent-500, #9E1A45)' }}><i className="ti ti-activity"></i></div>
        <h3>Atividade ao vivo</h3>
        <span className="sub">· últimos atendimentos da equipe</span>
      </div>

      {lastImport && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
          <i className="ti ti-file-spreadsheet" style={{ color: 'var(--success-500)' }}></i>
          Planilha <b style={{ color: 'var(--text-primary)' }}>{lastImport.platform}</b> importada hoje
          {lastImport.total != null && <span>· {lastImport.total.toLocaleString('pt-BR')} eventos</span>}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ display: 'grid', placeItems: 'center', height: 120, color: 'var(--text-muted)', fontSize: 13 }}>
          Sem atividade recente
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
              <i className={`ti ${it.icon}`} style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }}></i>
              <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.4, flex: 1 }}>{it.text}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{it.when}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
