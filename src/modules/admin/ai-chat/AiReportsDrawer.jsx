export default function AiReportsDrawer({ show, reports, loadingReports, onClose, onSelectReport, onDeleteReport }) {
  return (
    <div className={`ai-reports-drawer ${show ? 'open' : 'closed'}`}>
      <div className="ai-reports-header">
        <div className="ai-reports-title">
          <i className="ti ti-archive" />
          Relatórios Salvos
        </div>
        <button className="btn btn-icon-only btn-ghost btn-xs" onClick={onClose}>
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="ai-reports-list ai-custom-scroll">
        {loadingReports ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
            <i className="ti ti-loader-2 fz-spin" /> Carregando...
          </div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            <i className="ti ti-info-circle" style={{ fontSize: 18, marginBottom: 6, display: 'block' }} />
            Nenhum relatório salvo nesta galeria.
          </div>
        ) : (
          reports.map((rep) => (
            <div
              key={rep.id}
              onClick={() => onSelectReport(rep)}
              className="ai-report-card"
            >
              <div className="title">{rep.title}</div>
              <div className="meta">
                <span>{new Date(rep.created_at).toLocaleDateString()}</span>
                <button
                  className="btn btn-icon-only btn-ghost btn-xs"
                  onClick={(e) => onDeleteReport(rep.id, e)}
                  title="Excluir relatório"
                  style={{ padding: 2, height: 'auto', width: 'auto' }}
                >
                  <i className="ti ti-trash" style={{ color: 'var(--danger-500)' }} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
