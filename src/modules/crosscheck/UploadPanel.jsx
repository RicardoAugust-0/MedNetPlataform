import { formatLoadedAt } from './utils.js';

export default function UploadPanel({ name, label, meta, stats, inputKey, onUpload, onDrop }) {
  return (
    <div className="stat-box">
      <div className="stat-label">{name}</div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <div className="form-label">{label}</div>
        <label
          className="upload-area upload-area-sm"
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
          onDrop={onDrop}
        >
          <div className="upload-icon"><i className="ti ti-cloud-upload"></i></div>
          <div className="upload-text">
            <div className="upload-title">Solte aqui a planilha do {name}</div>
            <div className="upload-hint">.xlsx · .xls · .csv</div>
          </div>
          <input
            key={inputKey}
            type="file"
            accept=".csv,.xls,.xlsx"
            hidden
            onChange={onUpload}
          />
        </label>
      </div>
      <div className="cc-file-info">
        {meta.name ? (
          <>
            <div>Arquivo: {meta.name}</div>
            <div>Linhas: {meta.rows} · Placas: {stats.plates.size} · Motoristas: {stats.drivers.size}</div>
            <div>Carregado em: {formatLoadedAt(meta.loadedAt)}</div>
          </>
        ) : (
          <div>Nenhum arquivo carregado.</div>
        )}
      </div>
    </div>
  );
}
