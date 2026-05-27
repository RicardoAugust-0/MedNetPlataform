import { useState, useEffect } from 'react';

function buildSascarUrl() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startTime = Math.floor(today.getTime() / 1000);
  const endTime = startTime + 86399;

  const baseUrl = 'https://www.smartcamera.michelin.com/shipper/ft-shipper/alarm-list';
  const queryParts = [
    'alarmCategory=100574',
    'alarmCategory=100575',
    'alarmCategory=100573',
    'alarmLevel=15',
    'alarmLevel=14',
    'alarmLevel=13',
    `endTime=${endTime}`,
    'evidence_state=3',
    'page=1',
    'showMode=card',
    `startTime=${startTime}`,
  ];

  return `${baseUrl}?${queryParts.join('&')}`;
}

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
  handleScrape,
  hasSascarToken,
  sascarTokenSavedAt,
  loadStats,
  platform,
  platforms = [],
  onPlatformChange,
  historyAgeMin,
  reloadHistory,
  histLoading,
  onNavigateToPerfil,
  autoRefresh,
  autoRefreshMin,
  onAutoRefreshChange,
  onAutoRefreshMinChange,
  rpaLastRunAt = null,
  rpaLastRunStatus = null,
}) {
  const [rpaAgeMin, setRpaAgeMin] = useState(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!rpaLastRunAt) {
      setRpaAgeMin(null);
      return;
    }
    setRpaAgeMin(Math.floor((Date.now() - new Date(rpaLastRunAt)) / 60000));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [rpaLastRunAt]);
  const rpaAgeLabel = rpaAgeMin === null ? null
    : rpaAgeMin < 2   ? 'agora'
    : rpaAgeMin < 60  ? `${rpaAgeMin} min atrás`
    : `${Math.floor(rpaAgeMin / 60)}h atrás`;
  const rpaAgeColor = rpaLastRunStatus === 'error' ? 'var(--danger-500)'
    : rpaAgeMin === null ? null
    : rpaAgeMin < 60  ? 'var(--success-500, #22c55e)'
    : 'var(--warning-500)';
  const historyAgeLabel = historyAgeMin == null ? null
    : historyAgeMin < 1  ? 'agora'
    : historyAgeMin < 60 ? `${historyAgeMin}min`
    : `${Math.floor(historyAgeMin / 60)}h${historyAgeMin % 60 > 0 ? ` ${historyAgeMin % 60}min` : ''}`;
  const historyAgeColor = historyAgeMin == null ? null
    : historyAgeMin < 10 ? 'var(--success-500, #22c55e)'
    : historyAgeMin < 30 ? 'var(--warning-500)'
    : 'var(--danger-500)';
  const spreadsheet    = platform?.spreadsheet;
  const supportsScraper = !!platform?.scraper;
  const supportsUpload = !!spreadsheet;
  const accept       = spreadsheet?.accept      || ".xlsx,.xls,.csv";
  const uploadTitle  = spreadsheet?.uploadTitle || `Solte aqui o relatório da plataforma ${platform?.name || ""}`.trim();
  const uploadHint   = spreadsheet?.uploadHint  || accept.split(",").join(" · ");

  const portalUrl = platform?.id === 'sascar' ? buildSascarUrl() : platform?.portalUrl;

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

        {/* Chip: última atualização pelo robô RPA (Maxtrack) */}
        {platform?.id === 'maxtrack' && rpaAgeLabel && (
          <span
            title={rpaLastRunStatus === 'error' ? 'Último ciclo do robô retornou erro' : 'Última atualização automática pelo robô'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11, padding: '2px 10px', borderRadius: 99, fontWeight: 600,
              flexShrink: 0, background: rpaAgeColor + '22', color: rpaAgeColor,
            }}
          >
            <i className={`ti ${rpaLastRunStatus === 'error' ? 'ti-robot-off' : 'ti-robot'}`} style={{ fontSize: 10 }}></i>
            robô {rpaAgeLabel}
          </span>
        )}

        {/* Seletor de plataforma: aparece sempre que há mais de uma cadastrada */}
        {platforms.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
              <i className="ti ti-stack-2" style={{ marginRight: 4 }}></i>Plataforma
            </label>
            <select
              value={platform?.id || ""}
              onChange={(e) => onPlatformChange?.(e.target.value)}
              style={{ fontSize: 12, padding: "2px 6px" }}
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id} disabled={p.status === "planned"}>
                  {p.name}{p.status === "beta" ? " · beta" : ""}{p.status === "planned" ? " · em breve" : ""}
                </option>
              ))}
            </select>
          </div>
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

        <button
          className="btn btn-sm"
          onClick={reloadHistory}
          disabled={histLoading || !reloadHistory}
          title="Recarregar histórico de atendimentos do banco"
        >
          <i className={`ti ${histLoading ? 'ti-loader-2' : 'ti-refresh'}`}></i> Recarregar histórico
        </button>

        <button className="btn btn-sm btn-danger" onClick={clearQueue}>
          <i className="ti ti-trash"></i> Limpar fila
        </button>

        {portalUrl && (
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-sm"
            style={{ textDecoration: "none" }}
          >
            <i className="ti ti-external-link"></i> Abrir Portal {platform.name}
          </a>
        )}
      </div>

      {/* Busca automática Sascar (quando token configurado) */}
      {platform?.id === 'sascar' && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '8px 14px',
          background: hasSascarToken ? 'rgba(34,197,94,0.07)' : 'rgba(245,158,11,0.07)',
          border: `1px solid ${hasSascarToken ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
          borderRadius: 'var(--radius-md)', marginBottom: 12, fontSize: 12.5,
        }}>
          <i className={`ti ${hasSascarToken ? 'ti-refresh' : 'ti-bookmark'}`}
             style={{ color: hasSascarToken ? 'var(--success-600,#16a34a)' : 'var(--warning-500)', fontSize: 15 }}></i>
          {hasSascarToken ? (
            <>
              <span style={{ flex: 1 }}>
                Busca automática disponível — sem precisar fazer upload da planilha.
                {sascarTokenSavedAt && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                    Token capturado em {new Date(sascarTokenSavedAt).toLocaleString('pt-BR', {
                      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}.
                  </span>
                )}
              </span>

              {/* Auto-refresh controls */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={!!autoRefresh}
                  onChange={e => onAutoRefreshChange?.(e.target.checked)}
                  style={{ accentColor: 'var(--success-600,#16a34a)' }}
                />
                Auto a cada
              </label>
              <select
                value={autoRefreshMin}
                onChange={e => onAutoRefreshMinChange?.(Number(e.target.value))}
                disabled={!autoRefresh}
                style={{ fontSize: 12, padding: '2px 4px' }}
              >
                {[5, 10, 15, 30].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>

              <button
                className="btn btn-sm btn-primary"
                onClick={handleScrape}
                disabled={loading}
              >
                <i className={`ti ${loading ? 'ti-loader-2' : 'ti-refresh'}`}></i>
                {loading ? ' Buscando…' : ' Buscar eventos agora'}
              </button>
            </>
          ) : (
            <>
              <span style={{ flex: 1 }}>
                <strong>Dica:</strong> instale o <strong>Favorito Sascar</strong> para buscar eventos automaticamente — sem upload de planilha.
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => onNavigateToPerfil?.()}
              >
                <i className="ti ti-settings"></i> Configurar
              </button>
            </>
          )}
        </div>
      )}

      {/* Upload / Scraper */}
      {supportsUpload ? (
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
      ) : supportsScraper ? (
        <div className="upload-area" style={{ cursor: "default", textAlign: "center" }}>
          <div className="upload-icon">
            <i className={`ti ${loading ? "ti-loader-2" : "ti-refresh"}`}
               style={loading ? { animation: "spin 1s linear infinite" } : {}}></i>
          </div>
          <div className="upload-text">
            <div className="upload-title">
              Integração automática com {platform?.name}
            </div>
            <div className="upload-hint">
              Os eventos são buscados diretamente da plataforma — sem upload manual
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={handleScrape}
              disabled={loading}
            >
              <i className={`ti ${loading ? "ti-loader-2" : "ti-refresh"}`}></i>
              {loading ? " Buscando…" : " Buscar eventos agora"}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={!!autoRefresh}
                onChange={e => onAutoRefreshChange?.(e.target.checked)}
              />
              Auto a cada
            </label>
            <select
              value={autoRefreshMin}
              onChange={e => onAutoRefreshMinChange?.(Number(e.target.value))}
              disabled={!autoRefresh}
              style={{ fontSize: 12, padding: '2px 4px' }}
            >
              {[5, 10, 15, 30].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <i className="ti ti-plug-connected"></i>
          A plataforma {platform?.name} não usa upload de planilha.
          {platform?.inputType === "api" && " A integração será via API (em breve)."}
        </div>
      )}

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
            <div className="stat-sub">{(platform?.taxonomy?.intervencao || []).join(" · ") || "—"}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Reportar</div>
            <div className="stat-value warning">{loadStats.soReportar}</div>
            <div className="stat-sub">Outros eventos</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Só técnico</div>
            <div className="stat-value">{loadStats.soTecnico}</div>
            <div className="stat-sub">{(platform?.taxonomy?.tecnico || []).join(" · ") || "—"}</div>
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
