import { useState } from 'react';
import { useToast } from '../hooks/useToast.jsx';

const EMPTY_META = { name: '', rows: 0, loadedAt: null };

function normalizeText(v) {
  if (!v && v !== 0) return '';
  return String(v).normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase();
}

function normalizePlate(v) {
  if (!v && v !== 0) return '';
  return String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeKeyLabel(v) {
  if (!v && v !== 0) return '';
  return String(v)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickFirst(row, keys) {
  const rowKeys = Object.keys(row);
  const normalizedMap = new Map();
  rowKeys.forEach((rk) => {
    const norm = normalizeKeyLabel(rk);
    if (!normalizedMap.has(norm)) normalizedMap.set(norm, rk);
  });

  for (const searchKey of keys) {
    const norm = normalizeKeyLabel(searchKey);
    const found = normalizedMap.get(norm);
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
      return String(row[found]);
    }
  }

  return '';
}

function buildStats(events) {
  const plates = new Set();
  const drivers = new Set();
  events.forEach((ev) => {
    if (ev.plate) plates.add(ev.plate);
    if (ev.driver) drivers.add(ev.driver);
  });
  return { rows: events.length, plates, drivers };
}

function formatLoadedAt(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

export default function CrossCheck() {
  const toast = useToast();
  const [leftEvents, setLeftEvents] = useState([]);
  const [rightEvents, setRightEvents] = useState([]);
  const [matches, setMatches] = useState([]);
  const [leftMeta, setLeftMeta] = useState(EMPTY_META);
  const [rightMeta, setRightMeta] = useState(EMPTY_META);
  const [leftInputKey, setLeftInputKey] = useState(0);
  const [rightInputKey, setRightInputKey] = useState(0);
  const [filterBy, setFilterBy] = useState('todos');
  const [sortBy, setSortBy] = useState('ocorrencias');
  const [onlyDivergences, setOnlyDivergences] = useState(false);
  const [loadingSide, setLoadingSide] = useState(null);

  const leftName = leftMeta.name ? leftMeta.name.replace(/\.[^.]+$/, '') : 'Planilha 1';
  const rightName = rightMeta.name ? rightMeta.name.replace(/\.[^.]+$/, '') : 'Planilha 2';

  const leftStats = buildStats(leftEvents);
  const rightStats = buildStats(rightEvents);
  const totalPlates = new Set([...leftStats.plates, ...rightStats.plates]).size;
  const totalDrivers = new Set([...leftStats.drivers, ...rightStats.drivers]).size;
  const totalRows = leftStats.rows + rightStats.rows;
  const plateMatches = matches.filter(m => m.by === 'placa').length;
  const driverMatches = matches.filter(m => m.by === 'motorista').length;
  const divergenceCount = matches.filter(m => m.left.length !== m.right.length).length;

  const filteredMatches = matches
    .filter(m => filterBy === 'todos' || m.by === filterBy)
    .filter(m => !onlyDivergences || m.left.length !== m.right.length)
    .slice()
    .sort((a, b) => {
      if (sortBy === 'alfabetica') return String(a.key).localeCompare(String(b.key));
      return (b.left.length + b.right.length) - (a.left.length + a.right.length);
    });

  const latestFile = [leftMeta, rightMeta]
    .filter(m => m.loadedAt)
    .sort((a, b) => new Date(b.loadedAt) - new Date(a.loadedAt))[0];
  const latestLabel = latestFile ? `${latestFile.name} · ${formatLoadedAt(latestFile.loadedAt)}` : '—';

  async function parseFile(file) {
    if (!file) return [];
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const plateKeys = ['Identificador/Placa', 'Placa', 'Plate', 'Veiculo', 'Identificador', 'Placa / Empurrador'];
      const driverKeys = ['Motorista', 'Motorista / Comandante', 'Nome do Motorista', 'Nome', 'Driver'];
      const severityKeys = ['Criticidade', 'Criticidade Original', 'Severidade', 'Prioridade', 'Categoria', 'Severity'];

      return rows.map(r => {
        const rawPlate = pickFirst(r, plateKeys);
        const rawDriver = pickFirst(r, driverKeys);
        const rawSeverity = pickFirst(r, severityKeys);
        return {
          raw: r,
          plate: normalizePlate(rawPlate),
          plateRaw: rawPlate || '',
          driver: normalizeText(rawDriver),
          driverRaw: rawDriver || '',
          severityRaw: rawSeverity || '',
        };
      });
    } catch {
      toast(`Erro ao ler "${file.name}". Verifique se o arquivo é um xlsx, xls ou csv válido.`, 'error');
      return null;
    }
  }

  async function handleFile(file, side) {
    if (!file) return;
    setLoadingSide(side);
    const parsed = await parseFile(file);
    setLoadingSide(null);
    if (!parsed) return;
    const meta = { name: file.name, rows: parsed.length, loadedAt: new Date().toISOString() };
    if (side === 'left') {
      setLeftEvents(parsed);
      setLeftMeta(meta);
      computeMatches(parsed, rightEvents);
    } else {
      setRightEvents(parsed);
      setRightMeta(meta);
      computeMatches(leftEvents, parsed);
    }
  }

  function handleUpload(e, side) {
    handleFile(e.target.files && e.target.files[0], side);
  }

  function handleDrop(e, side) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file, side);
  }

  function computeMatches(left, right, options = {}) {
    const { silent = false } = options;
    const L = left ?? leftEvents;
    const R = right ?? rightEvents;
    const byPlateL = new Map();
    const byDriverL = new Map();
    const byPlateR = new Map();
    const byDriverR = new Map();

    L.forEach(ev => { if (!byPlateL.has(ev.plate)) byPlateL.set(ev.plate, []); byPlateL.get(ev.plate).push(ev); if (!byDriverL.has(ev.driver)) byDriverL.set(ev.driver, []); byDriverL.get(ev.driver).push(ev); });
    R.forEach(ev => { if (!byPlateR.has(ev.plate)) byPlateR.set(ev.plate, []); byPlateR.get(ev.plate).push(ev); if (!byDriverR.has(ev.driver)) byDriverR.set(ev.driver, []); byDriverR.get(ev.driver).push(ev); });

    const found = [];

    for (const [plate, levents] of byPlateL) {
      if (!plate) continue;
      const revents = byPlateR.get(plate) || [];
      if (levents.length && revents.length) {
        found.push({ key: plate, by: 'placa', left: levents, right: revents });
      }
    }

    // Evitar duplicar motoristas já cobertos integralmente por matches de placa
    const matchedPlates = new Set(found.flatMap(f => [...f.left, ...f.right].map(ev => ev.plate)));

    for (const [driver, levents] of byDriverL) {
      if (!driver) continue;
      if (levents.every(ev => matchedPlates.has(ev.plate))) continue;
      const revents = byDriverR.get(driver) || [];
      if (levents.length && revents.length) {
        found.push({ key: driver, by: 'motorista', left: levents, right: revents });
      }
    }

    setMatches(found);
    if (!silent) {
      if (found.length > 0) {
        toast(`${found.length} correspondência(s) encontrada(s)`, 'success');
      } else {
        toast('Nenhuma correspondência encontrada entre os arquivos carregados.', 'info');
      }
    }
  }

  function clearSide(side) {
    if (side === 'left') {
      setLeftEvents([]);
      setLeftMeta(EMPTY_META);
      setLeftInputKey((k) => k + 1);
      computeMatches([], rightEvents, { silent: true });
    } else {
      setRightEvents([]);
      setRightMeta(EMPTY_META);
      setRightInputKey((k) => k + 1);
      computeMatches(leftEvents, [], { silent: true });
    }
  }

  function clearAll() {
    setLeftEvents([]);
    setRightEvents([]);
    setLeftMeta(EMPTY_META);
    setRightMeta(EMPTY_META);
    setMatches([]);
    setLeftInputKey((k) => k + 1);
    setRightInputKey((k) => k + 1);
  }

  function swapSides() {
    setLeftEvents(rightEvents);
    setRightEvents(leftEvents);
    setLeftMeta(rightMeta);
    setRightMeta(leftMeta);
    setLeftInputKey((k) => k + 1);
    setRightInputKey((k) => k + 1);
    computeMatches(rightEvents, leftEvents, { silent: true });
  }

  function exportResults() {
    if (filteredMatches.length === 0) {
      toast('Nenhum resultado para exportar.', 'info');
      return;
    }

    const escape = (value) => {
      const str = String(value ?? '');
      if (/[";\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };

    const header = [
      'Tipo',
      'Chave',
      `${leftName} ocorrências`,
      `${rightName} ocorrências`,
      `${leftName} detalhes`,
      `${rightName} detalhes`,
      `${leftName} criticidades`,
      `${rightName} criticidades`,
    ];

    const rows = filteredMatches.map((m) => {
      const leftDetails = m.left.map(ev => ev.driverRaw || ev.plateRaw || '—').join(' | ');
      const rightDetails = m.right.map(ev => ev.driverRaw || ev.plateRaw || '—').join(' | ');
      const leftSev = m.left.map(ev => ev.severityRaw || 'Sem criticidade').join(' | ');
      const rightSev = m.right.map(ev => ev.severityRaw || 'Sem criticidade').join(' | ');
      return [
        m.by === 'placa' ? 'Placa' : 'Motorista',
        m.key,
        m.left.length,
        m.right.length,
        leftDetails,
        rightDetails,
        leftSev,
        rightSev,
      ].map(escape).join(';');
    });

    const csv = [header.join(';'), ...rows].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cross-check-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="card-title"><i className="ti ti-shuffle" style={{ color: 'var(--accent-500)' }}></i> Cross-Check</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comparar alertas entre plataformas</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm btn-ghost" onClick={swapSides} disabled={!!loadingSide || (leftEvents.length === 0 && rightEvents.length === 0)}>
              <i className="ti ti-switch-horizontal"></i> Trocar lados
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => clearSide('left')} disabled={!!loadingSide || leftEvents.length === 0}>
              Limpar planilha 1
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => clearSide('right')} disabled={!!loadingSide || rightEvents.length === 0}>
              Limpar planilha 2
            </button>
            <button className="btn btn-sm btn-ghost" onClick={clearAll} disabled={!!loadingSide || (leftEvents.length === 0 && rightEvents.length === 0 && matches.length === 0)}>
              Limpar tudo
            </button>
            <button className="btn btn-sm btn-ghost" onClick={exportResults} disabled={!!loadingSide || filteredMatches.length === 0}>
              <i className="ti ti-download"></i> Exportar resultados
            </button>
            <button onClick={() => computeMatches()} className="btn btn-sm btn-primary" disabled={!!loadingSide || leftEvents.length === 0 || rightEvents.length === 0}>
              <i className="ti ti-shuffle"></i> Comparar lado a lado
            </button>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div className="stat-strip" style={{ marginBottom: 16 }}>
            <div className="stat-box">
              <div className="stat-label">Linhas lidas</div>
              <div className="stat-value">{totalRows}</div>
              <div className="stat-sub">{leftName}: {leftStats.rows} · {rightName}: {rightStats.rows}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Placas totais</div>
              <div className="stat-value">{totalPlates}</div>
              <div className="stat-sub">{plateMatches} em comum</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Motoristas totais</div>
              <div className="stat-value">{totalDrivers}</div>
              <div className="stat-sub">{driverMatches} em comum</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Matches encontrados</div>
              <div className="stat-value">{matches.length}</div>
              <div className="stat-sub">{divergenceCount} divergência(s)</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Último arquivo</div>
              <div className="stat-value" style={{ fontSize: 13 }}>{latestLabel}</div>
              <div className="stat-sub">carregado recentemente</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div className="stat-box" style={{ padding: 16 }}>
              <div className="stat-label">{leftName}</div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <div className="form-label" style={{ marginBottom: 4 }}>Planilha 1</div>
                <label
                  className="upload-area"
                  style={{ padding: 16, gap: 12 }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('drag-over');
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                  onDrop={(e) => handleDrop(e, 'left')}
                >
                  <div className="upload-icon">
                    <i className={loadingSide === 'left' ? 'ti ti-loader-2 ti-spin' : 'ti ti-cloud-upload'}></i>
                  </div>
                  <div className="upload-text">
                    <div className="upload-title">{loadingSide === 'left' ? 'Lendo arquivo…' : 'Arraste ou clique para selecionar'}</div>
                    <div className="upload-hint">.xlsx · .xls · .csv</div>
                  </div>
                  <input
                    key={`left-${leftInputKey}`}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    hidden
                    disabled={!!loadingSide}
                    onChange={e => handleUpload(e, 'left')}
                  />
                </label>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {leftMeta.name ? (
                  <>
                    <div>Arquivo: {leftMeta.name}</div>
                    <div>Linhas: {leftMeta.rows} · Placas: {leftStats.plates.size} · Motoristas: {leftStats.drivers.size}</div>
                    <div>Carregado em: {formatLoadedAt(leftMeta.loadedAt)}</div>
                  </>
                ) : (
                  <div>Nenhum arquivo carregado.</div>
                )}
              </div>
            </div>
            <div className="stat-box" style={{ padding: 16 }}>
              <div className="stat-label">{rightName}</div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <div className="form-label" style={{ marginBottom: 4 }}>Planilha 2</div>
                <label
                  className="upload-area"
                  style={{ padding: 16, gap: 12 }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add('drag-over');
                  }}
                  onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
                  onDrop={(e) => handleDrop(e, 'right')}
                >
                  <div className="upload-icon">
                    <i className={loadingSide === 'right' ? 'ti ti-loader-2 ti-spin' : 'ti ti-cloud-upload'}></i>
                  </div>
                  <div className="upload-text">
                    <div className="upload-title">{loadingSide === 'right' ? 'Lendo arquivo…' : 'Arraste ou clique para selecionar'}</div>
                    <div className="upload-hint">.xlsx · .xls · .csv</div>
                  </div>
                  <input
                    key={`right-${rightInputKey}`}
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    hidden
                    disabled={!!loadingSide}
                    onChange={e => handleUpload(e, 'right')}
                  />
                </label>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {rightMeta.name ? (
                  <>
                    <div>Arquivo: {rightMeta.name}</div>
                    <div>Linhas: {rightMeta.rows} · Placas: {rightStats.plates.size} · Motoristas: {rightStats.drivers.size}</div>
                    <div>Carregado em: {formatLoadedAt(rightMeta.loadedAt)}</div>
                  </>
                ) : (
                  <div>Nenhum arquivo carregado.</div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
              <label className="form-label" style={{ marginBottom: 4 }}>Filtrar por</label>
              <select className="form-control" value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="placa">Somente placas</option>
                <option value="motorista">Somente motoristas</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label className="form-label" style={{ marginBottom: 4 }}>Ordenar por</label>
              <select className="form-control" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="ocorrencias">Ocorrências</option>
                <option value="alfabetica">Ordem alfabética</option>
              </select>
            </div>
            <button className={`btn btn-sm ${onlyDivergences ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setOnlyDivergences(!onlyDivergences)}>
              <i className="ti ti-filter"></i> Somente divergências
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => { setFilterBy('todos'); setSortBy('ocorrencias'); setOnlyDivergences(false); }}>
              Limpar filtros
            </button>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 16 }}>
              Resultados: {filteredMatches.length} matches encontrados{filteredMatches.length !== matches.length ? ` (de ${matches.length})` : ''}
            </h3>
            {filteredMatches.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <i className="ti ti-layers-subtract"></i>
                <p>Nenhuma correspondência encontrada para os filtros atuais.</p>
              </div>
            ) : (
              filteredMatches.map((m) => (
                <div key={`${m.by}-${m.key}`} className="stat-box" style={{ padding: 18, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                    {m.by === 'placa' ? <><i className="ti ti-car" style={{color: 'var(--text-muted)', marginRight: 6}}></i>Placa: {m.key}</> : <><i className="ti ti-user" style={{color: 'var(--text-muted)', marginRight: 6}}></i>Motorista: {m.key}</>}
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">{leftName} <span style={{ textTransform: 'lowercase' }}>({m.left.length} ocorrências)</span></div>
                      {m.left.map((ev, j) => (
                        <div key={j} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.driverRaw || ev.plateRaw}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 4 }}>{ev.severityRaw || 'Sem criticidade'}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">{rightName} <span style={{ textTransform: 'lowercase' }}>({m.right.length} ocorrências)</span></div>
                      {m.right.map((ev, j) => (
                        <div key={j} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.driverRaw || ev.plateRaw}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 4 }}>{ev.severityRaw || 'Sem criticidade'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
