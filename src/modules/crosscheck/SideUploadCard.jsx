import { formatLoadedAt } from './utils.js';

export default function SideUploadCard({
  title,
  planilhaLabel,
  uploadTitle,
  uploadHint = '.xlsx · .xls · .csv',
  inputKey,
  onUpload,
  onDrop,
  meta,
  stats,
  loading = false,
  children,
}) {
  const hasFile = Boolean(meta?.name);

  return (
    <div className="stat-box" style={{ padding: 16 }}>
      <div className="stat-label">{title}</div>
      {children}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <div className="form-label" style={{ marginBottom: 4 }}>{planilhaLabel}</div>
        <label
          className="upload-area"
          style={{ padding: 16, gap: 12 }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
          onDrop={onDrop}
        >
          <div className="upload-icon">
            <i className={loading ? 'ti ti-loader-2 ti-spin' : 'ti ti-cloud-upload'}></i>
          </div>
          <div className="upload-text">
            <div className="upload-title">{loading ? 'Lendo arquivo…' : uploadTitle}</div>
            <div className="upload-hint">{uploadHint}</div>
          </div>
          <input
            key={inputKey}
            type="file"
            accept=".csv,.xls,.xlsx"
            hidden
            disabled={loading}
            onChange={onUpload}
          />
        </label>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {hasFile ? (
          <>
            <div>Arquivo: {meta.name}</div>
            <div>Linhas: {meta.rows} · Placas: {stats.plates} · Motoristas: {stats.drivers}</div>
            <div>Carregado em: {formatLoadedAt(meta.loadedAt)}</div>
          </>
        ) : (
          <div>Nenhum arquivo carregado.</div>
        )}
      </div>
    </div>
  );
}
