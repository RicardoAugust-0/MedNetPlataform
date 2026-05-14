import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../hooks/useToast.jsx';
import SideUploadCard from './crosscheck/SideUploadCard.jsx';
import {
  normalizeText,
  normalizePlate,
  pickFirst,
  isCriticalLabel,
  buildStats,
  buildCarrierStats,
  buildDuplicateStats,
  parseDateValue,
  formatLoadedAt,
} from './crosscheck/utils.js';

export default function CrossCheck() {
  const toast = useToast();
  const [leftEvents, setLeftEvents] = useState([]);
  const [rightEvents, setRightEvents] = useState([]);
  const [matches, setMatches] = useState([]);
  const [leftMeta, setLeftMeta] = useState({ name: '', rows: 0, loadedAt: null });
  const [rightMeta, setRightMeta] = useState({ name: '', rows: 0, loadedAt: null });
  const [leftInputKey, setLeftInputKey] = useState(0);
  const [rightInputKey, setRightInputKey] = useState(0);
  const [filterBy, setFilterBy] = useState('todos');
  const [sortBy, setSortBy] = useState('ocorrencias');
  const [onlyDivergences, setOnlyDivergences] = useState(false);
  const [rightCarrier, setRightCarrier] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [carrierFilterLabel, setCarrierFilterLabel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const leftName = 'Maxtrack';
  const rightName = 'Horizon';

  async function parseFile(file) {
    if (!file) return [];
    const xlsxModule = await import('xlsx');
    const XLSX = xlsxModule.default || xlsxModule;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    // detect common keys (case, accent, and separator insensitive)
    const plateKeys = ['Identificador/Placa', 'Placa', 'Plate', 'Veiculo', 'Identificador', 'Placa / Empurrador'];
    const driverKeys = ['Motorista', 'Motorista / Comandante', 'Nome do Motorista', 'Nome', 'Driver'];
    const carrierKeys = ['Transportadora', 'Empresa', 'Cliente', 'Transportador', 'Razao Social', 'Transportes'];
    const dateKeys = ['Data', 'Data Chegada', 'Data/Hora', 'Data Hora', 'Timestamp', 'Data do Evento', 'Data de Chegada'];
    const severityKeys = ['Criticidade', 'Criticidade Original', 'Severidade', 'Prioridade', 'Categoria', 'Severity'];

    return rows.map(r => {
      const rawPlate = pickFirst(r, plateKeys);
      const rawDriver = pickFirst(r, driverKeys);
      const rawSeverity = pickFirst(r, severityKeys);
      const rawCarrier = pickFirst(r, carrierKeys);
      const rawDate = pickFirst(r, dateKeys);
      return {
        raw: r,
        plate: normalizePlate(rawPlate),
        plateRaw: rawPlate || '',
        driver: normalizeText(rawDriver),
        driverRaw: rawDriver || '',
        severityRaw: rawSeverity || '',
        transportadora: normalizeText(rawCarrier),
        transportadoraRaw: rawCarrier || '',
        carrierSource: rawCarrier ? 'file' : '',
        dateRaw: rawDate || '',
        dateValue: parseDateValue(rawDate),
        critical: isCriticalLabel(rawSeverity),
      };
    });
  }

  async function handleFile(file, side) {
    if (!file) return;
    const parsed = await parseFile(file);
    const fallback = side === 'right' ? rightCarrier.trim() : '';
    const normalizedFallback = fallback ? normalizeText(fallback) : '';
    const withCarrier = fallback
      ? parsed.map((ev) => (ev.transportadoraRaw
        ? ev
        : {
            ...ev,
            transportadoraRaw: fallback,
            transportadora: normalizedFallback,
            carrierSource: 'fallback',
          }))
      : parsed;
    const meta = { name: file.name, rows: withCarrier.length, loadedAt: new Date().toISOString() };
    if (side === 'left') {
      setLeftEvents(withCarrier);
      setLeftMeta(meta);
    } else {
      setRightEvents(withCarrier);
      setRightMeta(meta);
    }
    computeMatches(side === 'left' ? withCarrier : leftEvents, side === 'right' ? withCarrier : rightEvents);
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

  useEffect(() => {
    const trimmed = rightCarrier.trim();
    if (!trimmed || rightEvents.length === 0) return;
    const normalized = normalizeText(trimmed);
    setRightEvents((prev) => {
      let changed = false;
      const next = prev.map((ev) => {
        if (ev.carrierSource === 'fallback' || !ev.transportadoraRaw) {
          changed = true;
          return {
            ...ev,
            transportadoraRaw: trimmed,
            transportadora: normalized,
            carrierSource: 'fallback',
          };
        }
        return ev;
      });
      if (changed) computeMatches(leftEvents, next, { silent: true });
      return changed ? next : prev;
    });
  }, [rightCarrier, rightEvents.length, leftEvents]);

  function computeMatches(left, right, options = {}) {
    const { silent = false } = options;
    const L = left || leftEvents;
    const R = right || rightEvents;
    const byPlateL = new Map();
    const byDriverL = new Map();
    const byPlateR = new Map();
    const byDriverR = new Map();

    L.forEach(ev => { if (!byPlateL.has(ev.plate)) byPlateL.set(ev.plate, []); byPlateL.get(ev.plate).push(ev); if (!byDriverL.has(ev.driver)) byDriverL.set(ev.driver, []); byDriverL.get(ev.driver).push(ev); });
    R.forEach(ev => { if (!byPlateR.has(ev.plate)) byPlateR.set(ev.plate, []); byPlateR.get(ev.plate).push(ev); if (!byDriverR.has(ev.driver)) byDriverR.set(ev.driver, []); byDriverR.get(ev.driver).push(ev); });

    const found = [];

    // match by plate
    for (const [plate, levents] of byPlateL) {
      if (!plate) continue;
      const revents = byPlateR.get(plate) || [];
      if (levents.length && revents.length) {
        found.push({ key: plate, by: 'placa', left: levents, right: revents });
      }
    }

    // match by driver name (only if not already matched by plate)
    for (const [driver, levents] of byDriverL) {
      if (!driver) continue;
      const already = found.find(f => f.key === driver);
      if (already) continue;
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

  const emptyMeta = { name: '', rows: 0, loadedAt: null };

  function clearSide(side) {
    if (side === 'left') {
      setLeftEvents([]);
      setLeftMeta(emptyMeta);
      setLeftInputKey((k) => k + 1);
      computeMatches([], rightEvents, { silent: true });
      return;
    }
    setRightEvents([]);
    setRightMeta(emptyMeta);
    setRightInputKey((k) => k + 1);
    computeMatches(leftEvents, [], { silent: true });
  }

  function clearAll() {
    setLeftEvents([]);
    setRightEvents([]);
    setLeftMeta(emptyMeta);
    setRightMeta(emptyMeta);
    setMatches([]);
    setLeftInputKey((k) => k + 1);
    setRightInputKey((k) => k + 1);
    setRightCarrier('');
    setCarrierFilter('');
    setCarrierFilterLabel('');
    setDateFrom('');
    setDateTo('');
    setFilterBy('todos');
    setSortBy('ocorrencias');
    setOnlyDivergences(false);
  }

  function swapSides() {
    const leftData = leftEvents;
    const rightData = rightEvents;
    const leftInfo = leftMeta;
    const rightInfo = rightMeta;
    setLeftEvents(rightData);
    setRightEvents(leftData);
    setLeftMeta(rightInfo);
    setRightMeta(leftInfo);
    setLeftInputKey((k) => k + 1);
    setRightInputKey((k) => k + 1);
    computeMatches(rightData, leftData, { silent: true });
  }

  function applyCarrierFilter(name) {
    if (!name) return;
    const normalized = normalizeText(name);
    if (!normalized) return;
    if (carrierFilter && normalizeText(carrierFilter) === normalized) {
      setCarrierFilter('');
      setCarrierFilterLabel('');
      return;
    }
    setCarrierFilter(name);
    setCarrierFilterLabel(name);
  }

  function clearCarrierFilter() {
    setCarrierFilter('');
    setCarrierFilterLabel('');
  }

  function exportResults(mode = 'all') {
    const list = mode === 'divergencias'
      ? filteredMatches.filter(m => m.left.length !== m.right.length)
      : filteredMatches;
    if (list.length === 0) {
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
      `${leftName} transportadoras`,
      `${rightName} transportadoras`,
      `${leftName} criticidades`,
      `${rightName} criticidades`,
      `${leftName} datas`,
      `${rightName} datas`,
    ];

    const rows = list.map((m) => {
      const leftDetails = m.left.map(ev => ev.driverRaw || ev.plateRaw || '—').join(' | ');
      const rightDetails = m.right.map(ev => ev.driverRaw || ev.plateRaw || '—').join(' | ');
      const leftCarriers = m.left.map(ev => ev.transportadoraRaw || 'Sem transportadora').join(' | ');
      const rightCarriers = m.right.map(ev => ev.transportadoraRaw || 'Sem transportadora').join(' | ');
      const leftSev = m.left.map(ev => ev.severityRaw || 'Sem criticidade').join(' | ');
      const rightSev = m.right.map(ev => ev.severityRaw || 'Sem criticidade').join(' | ');
      const leftDates = m.left.map(ev => ev.dateRaw || 'Sem data').join(' | ');
      const rightDates = m.right.map(ev => ev.dateRaw || 'Sem data').join(' | ');
      return [
        m.by === 'placa' ? 'Placa' : 'Motorista',
        m.key,
        m.left.length,
        m.right.length,
        leftDetails,
        rightDetails,
        leftCarriers,
        rightCarriers,
        leftSev,
        rightSev,
        leftDates,
        rightDates,
      ].map(escape).join(';');
    });

    const suffix = mode === 'divergencias' ? '-divergencias' : '';
    const csv = [header.join(';'), ...rows].join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cross-check${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const {
    leftStats,
    rightStats,
    totalPlates,
    totalDrivers,
    totalRows,
    plateMatches,
    driverMatches,
    divergenceCount,
    leftCarrierStats,
    rightCarrierStats,
    leftDupStats,
    rightDupStats,
    hasDateData,
    derivedMatches,
    filteredMatches,
    divergentMatches,
  } = useMemo(() => {
    const dateFromValue = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const dateToValue = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const hasDateFilter = Boolean(dateFromValue || dateToValue);
    const leftHasDateData = leftEvents.some(ev => ev.dateValue);
    const rightHasDateData = rightEvents.some(ev => ev.dateValue);
    const withinDate = (ev, sideHasDate) => {
      if (!hasDateFilter || !sideHasDate) return true;
      if (!ev.dateValue) return false;
      if (dateFromValue && ev.dateValue < dateFromValue) return false;
      if (dateToValue && ev.dateValue > dateToValue) return false;
      return true;
    };
    const dateFilteredLeft = leftHasDateData && hasDateFilter
      ? leftEvents.filter(ev => withinDate(ev, true))
      : leftEvents;
    const dateFilteredRight = rightHasDateData && hasDateFilter
      ? rightEvents.filter(ev => withinDate(ev, true))
      : rightEvents;

    const carrierFilterNorm = carrierFilter ? normalizeText(carrierFilter) : '';
    const emptyCarrierKey = normalizeText('Sem transportadora');
    const matchHasCarrier = (m) => {
      if (!carrierFilterNorm) return true;
      const hasCarrier = (ev) => (ev.transportadora || emptyCarrierKey) === carrierFilterNorm;
      return m.left.some(hasCarrier) || m.right.some(hasCarrier);
    };

    const derivedMatches = matches
      .filter(matchHasCarrier)
      .map((m) => {
        const left = leftHasDateData && hasDateFilter
          ? m.left.filter(ev => withinDate(ev, true))
          : m.left;
        const right = rightHasDateData && hasDateFilter
          ? m.right.filter(ev => withinDate(ev, true))
          : m.right;
        if (left.length === 0 || right.length === 0) return null;
        return { ...m, left, right };
      })
      .filter(Boolean);

    const leftStats = buildStats(dateFilteredLeft);
    const rightStats = buildStats(dateFilteredRight);
    const totalPlates = new Set([...leftStats.plates, ...rightStats.plates]).size;
    const totalDrivers = new Set([...leftStats.drivers, ...rightStats.drivers]).size;
    const totalRows = leftStats.rows + rightStats.rows;
    const plateMatches = derivedMatches.filter(m => m.by === 'placa').length;
    const driverMatches = derivedMatches.filter(m => m.by === 'motorista').length;
    const divergenceCount = derivedMatches.filter(m => m.left.length !== m.right.length).length;
    const leftCarrierStats = buildCarrierStats(dateFilteredLeft);
    const rightCarrierStats = buildCarrierStats(dateFilteredRight);
    const leftDupStats = buildDuplicateStats(dateFilteredLeft);
    const rightDupStats = buildDuplicateStats(dateFilteredRight);
    const hasDateData = leftHasDateData || rightHasDateData;

    const filteredMatches = derivedMatches
      .filter(m => filterBy === 'todos' || m.by === filterBy)
      .filter(m => !onlyDivergences || m.left.length !== m.right.length)
      .slice()
      .sort((a, b) => {
        if (sortBy === 'alfabetica') return String(a.key).localeCompare(String(b.key));
        return (b.left.length + b.right.length) - (a.left.length + a.right.length);
      });
    const divergentMatches = filteredMatches.filter(m => m.left.length !== m.right.length);

    return {
      leftStats,
      rightStats,
      totalPlates,
      totalDrivers,
      totalRows,
      plateMatches,
      driverMatches,
      divergenceCount,
      leftCarrierStats,
      rightCarrierStats,
      leftDupStats,
      rightDupStats,
      hasDateData,
      derivedMatches,
      filteredMatches,
      divergentMatches,
    };
  }, [
    leftEvents,
    rightEvents,
    matches,
    dateFrom,
    dateTo,
    carrierFilter,
    filterBy,
    sortBy,
    onlyDivergences,
  ]);

  const latestFile = [leftMeta, rightMeta]
    .filter(m => m.loadedAt)
    .sort((a, b) => new Date(b.loadedAt) - new Date(a.loadedAt))[0];
  const latestLabel = latestFile ? `${latestFile.name} · ${formatLoadedAt(latestFile.loadedAt)}` : '-';
  return (
    <div>
      <div className="card">
        <div className="card-header" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="card-title"><i className="ti ti-shuffle" style={{ color: 'var(--accent-500)' }}></i> Cross-Check</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comparar alertas entre plataformas</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-sm btn-ghost" onClick={swapSides} disabled={leftEvents.length === 0 && rightEvents.length === 0}>
              <i className="ti ti-switch-horizontal"></i> Trocar lados
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => clearSide('left')} disabled={leftEvents.length === 0}>
              Limpar planilha 1
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => clearSide('right')} disabled={rightEvents.length === 0}>
              Limpar planilha 2
            </button>
            <button className="btn btn-sm btn-ghost" onClick={clearAll} disabled={leftEvents.length === 0 && rightEvents.length === 0 && matches.length === 0}>
              Limpar tudo
            </button>
            <button className="btn btn-sm btn-ghost" onClick={exportResults} disabled={filteredMatches.length === 0}>
              <i className="ti ti-download"></i> Exportar resultados
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => exportResults('divergencias')} disabled={divergentMatches.length === 0}>
              <i className="ti ti-download"></i> Exportar divergências
            </button>
            <button onClick={() => computeMatches()} className="btn btn-sm btn-primary" disabled={leftEvents.length === 0 || rightEvents.length === 0}>
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
              <div className="stat-value">{derivedMatches.length}</div>
              <div className="stat-sub">{divergenceCount} divergência(s)</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Último arquivo</div>
              <div className="stat-value" style={{ fontSize: 13 }}>{latestLabel}</div>
              <div className="stat-sub">carregado recentemente</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <SideUploadCard
              title={leftName}
              planilhaLabel="Planilha 1"
              uploadTitle={`Solte aqui a planilha do ${leftName}`}
              inputKey={`left-${leftInputKey}`}
              onUpload={(e) => handleUpload(e, 'left')}
              onDrop={(e) => handleDrop(e, 'left')}
              meta={leftMeta}
              stats={{ plates: leftStats.plates.size, drivers: leftStats.drivers.size }}
            />
            <SideUploadCard
              title={rightName}
              planilhaLabel="Planilha 2"
              uploadTitle={`Solte aqui a planilha do ${rightName}`}
              inputKey={`right-${rightInputKey}`}
              onUpload={(e) => handleUpload(e, 'right')}
              onDrop={(e) => handleDrop(e, 'right')}
              meta={rightMeta}
              stats={{ plates: rightStats.plates.size, drivers: rightStats.drivers.size }}
            >
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Transportadora ({rightName})</label>
                <input
                  className="form-control"
                  value={rightCarrier}
                  onChange={(e) => setRightCarrier(e.target.value)}
                  placeholder="Ex.: Grycamp"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Usado como fallback quando a planilha nao possui coluna de transportadora.
                </div>
              </div>
            </SideUploadCard>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 16 }}>
            <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
              <label className="form-label" style={{ marginBottom: 4 }}>Periodo</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="form-control"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  disabled={!hasDateData}
                  style={{ minWidth: 140 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ate</span>
                <input
                  className="form-control"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  disabled={!hasDateData}
                  style={{ minWidth: 140 }}
                />
              </div>
              {!hasDateData && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Nenhuma coluna de data identificada nas planilhas.
                </div>
              )}
            </div>
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
            {carrierFilterLabel && (
              <span className="badge badge-info" style={{ marginBottom: 2 }}>
                <i className="ti ti-building"></i> {carrierFilterLabel}
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={clearCarrierFilter}
                  style={{ padding: 0, border: 'none', marginLeft: 6 }}
                >
                  <i className="ti ti-x"></i>
                </button>
              </span>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => { setFilterBy('todos'); setSortBy('ocorrencias'); setOnlyDivergences(false); }}>
              Limpar filtros
            </button>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 16 }}>
            <div className="stat-box" style={{ padding: 16 }}>
              <div className="stat-label">Transportadoras · {leftName}</div>
              {leftCarrierStats.length === 0 ? (
                <div className="stat-sub" style={{ marginTop: 8 }}>Nenhum dado de transportadora.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {leftCarrierStats.slice(0, 6).map((item) => (
                    <div
                      key={item.name}
                      onClick={() => applyCarrierFilter(item.name)}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, cursor: 'pointer' }}
                      title="Filtrar resultados por transportadora"
                    >
                      <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.count}</span>
                    </div>
                  ))}
                  {leftCarrierStats.length > 6 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{leftCarrierStats.length - 6} outras</div>
                  )}
                </div>
              )}
            </div>
            <div className="stat-box" style={{ padding: 16 }}>
              <div className="stat-label">Transportadoras · {rightName}</div>
              {rightCarrierStats.length === 0 ? (
                <div className="stat-sub" style={{ marginTop: 8 }}>Nenhum dado de transportadora.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {rightCarrierStats.slice(0, 6).map((item) => (
                    <div
                      key={item.name}
                      onClick={() => applyCarrierFilter(item.name)}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, cursor: 'pointer' }}
                      title="Filtrar resultados por transportadora"
                    >
                      <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.count}</span>
                    </div>
                  ))}
                  {rightCarrierStats.length > 6 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{rightCarrierStats.length - 6} outras</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 12 }}>
            <div className="stat-box" style={{ padding: 16 }}>
              <div className="stat-label">Duplicados internos · {leftName}</div>
              {leftDupStats.plates.total === 0 && leftDupStats.drivers.total === 0 ? (
                <div className="stat-sub" style={{ marginTop: 8 }}>Nenhum duplicado encontrado.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Placas repetidas: {leftDupStats.plates.total}</div>
                  {leftDupStats.plates.top.map((item) => (
                    <div key={item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Motoristas repetidos: {leftDupStats.drivers.total}</div>
                  {leftDupStats.drivers.top.map((item) => (
                    <div key={item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="stat-box" style={{ padding: 16 }}>
              <div className="stat-label">Duplicados internos · {rightName}</div>
              {rightDupStats.plates.total === 0 && rightDupStats.drivers.total === 0 ? (
                <div className="stat-sub" style={{ marginTop: 8 }}>Nenhum duplicado encontrado.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Placas repetidas: {rightDupStats.plates.total}</div>
                  {rightDupStats.plates.top.map((item) => (
                    <div key={item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Motoristas repetidos: {rightDupStats.drivers.total}</div>
                  {rightDupStats.drivers.top.map((item) => (
                    <div key={item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 16 }}>
              Resultados: {filteredMatches.length} matches encontrados{filteredMatches.length !== derivedMatches.length ? ` (de ${derivedMatches.length})` : ''}
            </h3>
            {filteredMatches.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <i className="ti ti-layers-subtract"></i>
                <p>Nenhuma correspondência encontrada para os filtros atuais.</p>
              </div>
            ) : (
              filteredMatches.map((m, i) => (
                <div key={i} className="stat-box" style={{ padding: 18, marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
                    <div>
                      {m.by === 'placa'
                        ? <><i className="ti ti-car" style={{color: 'var(--text-muted)', marginRight: 6}}></i>Placa: {m.key}</>
                        : <><i className="ti ti-user" style={{color: 'var(--text-muted)', marginRight: 6}}></i>Motorista: {m.key}</>}
                    </div>
                    {m.left.length === m.right.length && (
                      <span className="badge badge-success">
                        <i className="ti ti-circle-check"></i> Match perfeito
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">{leftName} <span style={{ textTransform: 'lowercase' }}>({m.left.length} ocorrências)</span></div>
                      {m.left.map((ev, j) => (
                        <div key={j} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.driverRaw || ev.plateRaw}</div>
                            {ev.transportadoraRaw && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.transportadoraRaw}</div>
                            )}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 11, background: 'var(--surface-1)', padding: '2px 8px', borderRadius: 4 }}>{ev.severityRaw || 'Sem criticidade'}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ width: 1, background: 'var(--border)' }} />
                    <div style={{ flex: 1 }}>
                      <div className="stat-label">{rightName} <span style={{ textTransform: 'lowercase' }}>({m.right.length} ocorrências)</span></div>
                      {m.right.map((ev, j) => (
                        <div key={j} style={{ padding: '8px 0', borderBottom: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{ev.driverRaw || ev.plateRaw}</div>
                            {ev.transportadoraRaw && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.transportadoraRaw}</div>
                            )}
                          </div>
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
