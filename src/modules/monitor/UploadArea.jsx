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
}) {
  return (
    <>
      {/* Status bar */}
      <div className="status-bar" style={{ marginBottom: 12 }}>
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
        <button className="btn btn-sm btn-danger" onClick={clearQueue}>
          <i className="ti ti-trash"></i> Limpar fila
        </button>
        <a
          href="https://www.smartcamera.michelin.com/login/pc/login"
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm"
          style={{ textDecoration: "none" }}
        >
          <i className="ti ti-external-link"></i> Abrir Portal Sascar
        </a>
      </div>

      {/* Upload */}
      <label
        className="upload-area"
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
          <div className="upload-title">
            Solte aqui o relatório de detalhes de evento do Sascar
          </div>
          <div className="upload-hint">
            .xlsx · .xls · .csv &nbsp;·&nbsp; Falsos positivos removidos
            automaticamente
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
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
          </div>
          <div className="stat-box">
            <div className="stat-label">Intervenção</div>
            <div className="stat-value danger">{loadStats.comIntervencao}</div>
            <div className="stat-sub">Bocejo · Olho fechado</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Reportar</div>
            <div className="stat-value warning">{loadStats.soReportar}</div>
            <div className="stat-sub">Outros eventos</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Só técnico</div>
            <div className="stat-value">{loadStats.soTecnico}</div>
            <div className="stat-sub">Obstrução / perda de vídeo</div>
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
