
export default function UploadArea({
  statusKind,
  statusMsg,
  loading,
  sheetAgeMin,
  sheetAgeColor,
  sheetAgeLabel,
  clearQueue,
  handleDrop,
  handleFile,
  loadStats,
  historyAgeMin,
}) {
  const historyAgeLabel = historyAgeMin == null ? null
    : historyAgeMin < 1  ? 'agora'
    : historyAgeMin < 60 ? `${historyAgeMin}min`
    : `${Math.floor(historyAgeMin / 60)}h${historyAgeMin % 60 > 0 ? ` ${historyAgeMin % 60}min` : ''}`;
  const historyAgeColor = historyAgeMin == null ? null
    : historyAgeMin < 10 ? 'var(--success-500, #22c55e)'
    : historyAgeMin < 30 ? 'var(--warning-500)'
    : 'var(--danger-500)';
  
  const accept       = ".xlsx,.xls,.csv";
  const uploadTitle  = "Solte aqui o relatório de alertas de qualquer plataforma";
  const uploadHint   = ".xlsx · .xls · .csv · Detecção automática";

  return (
    <>
      {/* Barra de Status e Ações */}
      <div className="status-container" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div className="status-bar" style={{ flex: 1, marginBottom: 0 }}>
          <div
            className={`dot ${statusKind === "active" ? "active" : statusKind === "error" ? "error" : ""}`}
          ></div>
          <div className="status-text">
            {statusMsg}
            {loading && " — a processar…"}
          </div>
          {sheetAgeMin !== null && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                padding: "2px 10px",
                borderRadius: 99,
                fontWeight: 600,
                flexShrink: 0,
                background: sheetAgeColor + "22",
                color: sheetAgeColor,
              }}
            >
              <i className="ti ti-clock" style={{ fontSize: 10 }}></i>
              {sheetAgeLabel}
            </span>
          )}

          {historyAgeLabel && (
            <span
              title="Idade do histórico de atendimentos carregado"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600,
                flexShrink: 0, background: historyAgeColor + '22', color: historyAgeColor,
              }}
            >
              <i className="ti ti-history" style={{ fontSize: 10 }}></i>
              histórico {historyAgeLabel}
            </span>
          )}
        </div>

        <div className="status-actions-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button className="btn btn-sm btn-danger" onClick={clearQueue}>
              <i className="ti ti-trash"></i> Limpar fila
            </button>
          </div>
        </div>
      </div>

      {/* Upload / Scraper */}
      <label
        className={`upload-area${statusKind === 'active' ? ' collapsed' : ''}`}
        style={{ cursor: "pointer" }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add("drag-over");
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
        onDrop={handleDrop}
      >
        <div className="upload-icon">
          <i className="ti ti-cloud-upload"></i>
        </div>
        <div className="upload-text">
          <div className="upload-title">{uploadTitle}</div>
          <div className="upload-hint">{uploadHint}</div>
        </div>
        <input
          type="file"
          accept={accept}
          hidden
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
        />
      </label>

      {/* KPIs */}
      {loadStats && (
        <div className="stat-strip" style={{ marginTop: 12 }}>
          <div className="stat-box">
            <div className="stat-label">Placas carregadas</div>
            <div className="stat-value">{loadStats.total}</div>
            {loadStats.totalNaFila != null && loadStats.totalNaFila !== loadStats.total && (
              <div className="stat-sub">{loadStats.novas} nova(s) · {loadStats.atualizadas} atualizada(s) · {loadStats.totalNaFila} na fila</div>
            )}
          </div>
          <div className="stat-box">
            <div className="stat-label">Intervenção</div>
            <div className="stat-value danger">{loadStats.comIntervencao}</div>
            <div className="stat-sub">Fadiga · Distração</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Reportar</div>
            <div className="stat-value warning">{loadStats.soReportar}</div>
            <div className="stat-sub">Outros eventos</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Só técnico</div>
            <div className="stat-value">{loadStats.soTecnico}</div>
            <div className="stat-sub">Falhas de câmera</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Falsos positivos</div>
            <div className="stat-value" style={{ color: "var(--text-muted)" }}>
              {loadStats.falsosPositivos}
            </div>
            <div className="stat-sub">removidos</div>
          </div>
          {loadStats.filtradosPorVelocidade > 0 && (
            <div className="stat-box">
              <div className="stat-label">Baixa velocidade</div>
              <div className="stat-value" style={{ color: "var(--text-muted)" }}>
                {loadStats.filtradosPorVelocidade}
              </div>
              <div className="stat-sub">&lt; 10 km/h ignorados</div>
            </div>
          )}
          {loadStats.filtradosPorHistorico > 0 && (
            <div className="stat-box">
              <div className="stat-label">Já tratados</div>
              <div className="stat-value" style={{ color: "var(--text-muted)" }}>
                {loadStats.filtradosPorHistorico}
              </div>
              <div className="stat-sub">eventos ignorados</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
