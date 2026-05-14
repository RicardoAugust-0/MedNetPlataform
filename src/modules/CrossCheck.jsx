import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../hooks/useToast.jsx';
import SideUploadCard from './crosscheck/SideUploadCard.jsx';
import MatchCard from './crosscheck/MatchCard.jsx';
import CrossCheckFilters from './crosscheck/CrossCheckFilters.jsx';
import CarrierStats from './crosscheck/CarrierStats.jsx';
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

const EMPTY_META = { name: '', rows: 0, loadedAt: null };
const CACHE_KEY  = 'mn_crosscheck_cache';

// Campos mínimos de cada evento para exibição e filtro por transportadora.
const slimEv = ev => ({
  plateRaw:         ev.plateRaw         || '',
  driverRaw:        ev.driverRaw        || '',
  severityRaw:      ev.severityRaw      || '',
  transportadora:   ev.transportadora   || '',
  transportadoraRaw:ev.transportadoraRaw|| '',
  dateRaw:          ev.dateRaw          || '',
});

export default function CrossCheck() {
  const toast = useToast();

  const [leftEvents, setLeftEvents] = useState([]);
  const [rightEvents, setRightEvents] = useState([]);
  const [matches, setMatches] = useState([]);
  const [leftMeta, setLeftMeta] = useState(EMPTY_META);
  const [rightMeta, setRightMeta] = useState(EMPTY_META);
  const [leftInputKey, setLeftInputKey] = useState(0);
  const [rightInputKey, setRightInputKey] = useState(0);
  const [loadingSide, setLoadingSide] = useState(null);

  const [rightCarrier, setRightCarrier] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [carrierFilterLabel, setCarrierFilterLabel] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterBy, setFilterBy] = useState('todos');
  const [sortBy, setSortBy] = useState('ocorrencias');
  const [onlyDivergences, setOnlyDivergences] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState(null);

  // Restaura resultados do cache ao montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cache = JSON.parse(raw);
      if (!cache.matches?.length) return;
      setLeftMeta(cache.leftMeta  || EMPTY_META);
      setRightMeta(cache.rightMeta || EMPTY_META);
      setMatches(cache.matches);
      setRightCarrier(cache.rightCarrier || '');
      setCacheTimestamp(cache.savedAt);
      setFromCache(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persiste resultados no cache sempre que matches muda
  useEffect(() => {
    try {
      if (matches.length === 0) { localStorage.removeItem(CACHE_KEY); return; }
      const slim = matches.map(m => ({
        key: m.key, by: m.by,
        left:  m.left.map(slimEv),
        right: m.right.map(slimEv),
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        leftMeta, rightMeta, matches: slim, rightCarrier,
        savedAt: new Date().toISOString(),
      }));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const leftName = leftMeta.name ? leftMeta.name.replace(/\.[^.]+$/, '') : 'Planilha 1';
  const rightName = rightMeta.name ? rightMeta.name.replace(/\.[^.]+$/, '') : 'Planilha 2';

  const {
    leftStats, rightStats,
    totalPlates, totalDrivers, totalRows,
    plateMatches, driverMatches, divergenceCount,
    leftCarrierStats, rightCarrierStats,
    leftDupStats, rightDupStats,
    hasDateData, derivedMatches, filteredMatches, divergentMatches,
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
      ? leftEvents.filter(ev => withinDate(ev, true)) : leftEvents;
    const dateFilteredRight = rightHasDateData && hasDateFilter
      ? rightEvents.filter(ev => withinDate(ev, true)) : rightEvents;

    const carrierFilterNorm = carrierFilter ? normalizeText(carrierFilter) : '';
    const emptyCarrierKey = normalizeText('Sem transportadora');
    const matchHasCarrier = (m) => {
      if (!carrierFilterNorm) return true;
      const has = (ev) => (ev.transportadora || emptyCarrierKey) === carrierFilterNorm;
      return m.left.some(has) || m.right.some(has);
    };

    const derivedMatches = matches
      .filter(matchHasCarrier)
      .map((m) => {
        const left = leftHasDateData && hasDateFilter
          ? m.left.filter(ev => withinDate(ev, true)) : m.left;
        const right = rightHasDateData && hasDateFilter
          ? m.right.filter(ev => withinDate(ev, true)) : m.right;
        if (left.length === 0 || right.length === 0) return null;
        return { ...m, left, right };
      })
      .filter(Boolean);

    const leftStats = buildStats(dateFilteredLeft);
    const rightStats = buildStats(dateFilteredRight);
    const filteredMatches = derivedMatches
      .filter(m => filterBy === 'todos' || m.by === filterBy)
      .filter(m => !onlyDivergences || m.left.length !== m.right.length)
      .slice()
      .sort((a, b) => sortBy === 'alfabetica'
        ? String(a.key).localeCompare(String(b.key))
        : (b.left.length + b.right.length) - (a.left.length + a.right.length));

    return {
      leftStats, rightStats,
      totalPlates: new Set([...leftStats.plates, ...rightStats.plates]).size,
      totalDrivers: new Set([...leftStats.drivers, ...rightStats.drivers]).size,
      totalRows: leftStats.rows + rightStats.rows,
      plateMatches: derivedMatches.filter(m => m.by === 'placa').length,
      driverMatches: derivedMatches.filter(m => m.by === 'motorista').length,
      divergenceCount: derivedMatches.filter(m => m.left.length !== m.right.length).length,
      leftCarrierStats: buildCarrierStats(dateFilteredLeft),
      rightCarrierStats: buildCarrierStats(dateFilteredRight),
      leftDupStats: buildDuplicateStats(dateFilteredLeft),
      rightDupStats: buildDuplicateStats(dateFilteredRight),
      hasDateData: leftHasDateData || rightHasDateData,
      derivedMatches,
      filteredMatches,
      divergentMatches: filteredMatches.filter(m => m.left.length !== m.right.length),
    };
  }, [leftEvents, rightEvents, matches, dateFrom, dateTo, carrierFilter, filterBy, sortBy, onlyDivergences]);

  const latestFile = [leftMeta, rightMeta]
    .filter(m => m.loadedAt)
    .sort((a, b) => new Date(b.loadedAt) - new Date(a.loadedAt))[0];
  const latestLabel = latestFile ? `${latestFile.name} · ${formatLoadedAt(latestFile.loadedAt)}` : '—';

  const searchNorm = searchQuery.trim().toLowerCase();
  const displayedMatches = searchNorm
    ? filteredMatches.filter(m => m.key.toLowerCase().includes(searchNorm))
    : filteredMatches;

  async function parseFile(file) {
    if (!file) return [];
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
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
          critical: isCriticalLabel(rawSeverity),
          transportadora: normalizeText(rawCarrier),
          transportadoraRaw: rawCarrier || '',
          carrierSource: rawCarrier ? 'file' : '',
          dateRaw: rawDate || '',
          dateValue: parseDateValue(rawDate),
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
    const fallback = side === 'right' ? rightCarrier.trim() : '';
    const normalizedFallback = fallback ? normalizeText(fallback) : '';
    const withCarrier = fallback
      ? parsed.map(ev => ev.transportadoraRaw ? ev
          : { ...ev, transportadoraRaw: fallback, transportadora: normalizedFallback, carrierSource: 'fallback' })
      : parsed;
    const meta = { name: file.name, rows: withCarrier.length, loadedAt: new Date().toISOString() };
    if (side === 'left') { setLeftEvents(withCarrier); setLeftMeta(meta); computeMatches(withCarrier, rightEvents); }
    else { setRightEvents(withCarrier); setRightMeta(meta); computeMatches(leftEvents, withCarrier); }
  }

  function handleUpload(e, side) { handleFile(e.target.files?.[0], side); }
  function handleDrop(e, side) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file, side);
  }

  // Reaplica carrier fallback nos eventos right quando o campo muda.
  // Dep: rightEvents.length (não rightEvents) para não criar loop após o setRightEvents abaixo.
  useEffect(() => {
    const trimmed = rightCarrier.trim();
    if (!trimmed || rightEvents.length === 0) return;
    const normalized = normalizeText(trimmed);
    let changed = false;
    const next = rightEvents.map(ev => {
      if (ev.carrierSource === 'fallback' || !ev.transportadoraRaw) {
        changed = true;
        return { ...ev, transportadoraRaw: trimmed, transportadora: normalized, carrierSource: 'fallback' };
      }
      return ev;
    });
    if (!changed) return;
    setRightEvents(next);
    computeMatches(leftEvents, next, { silent: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightCarrier, rightEvents.length, leftEvents]);

  function computeMatches(left, right, options = {}) {
    const { silent = false } = options;
    const L = left ?? leftEvents;
    const R = right ?? rightEvents;
    const byPlateL = new Map(), byDriverL = new Map();
    const byPlateR = new Map(), byDriverR = new Map();
    const group = (map, key, ev) => { if (!map.has(key)) map.set(key, []); map.get(key).push(ev); };
    L.forEach(ev => { group(byPlateL, ev.plate, ev); group(byDriverL, ev.driver, ev); });
    R.forEach(ev => { group(byPlateR, ev.plate, ev); group(byDriverR, ev.driver, ev); });

    const found = [];
    for (const [plate, levents] of byPlateL) {
      if (!plate) continue;
      const revents = byPlateR.get(plate) || [];
      if (levents.length && revents.length) found.push({ key: plate, by: 'placa', left: levents, right: revents });
    }
    const matchedPlates = new Set(found.flatMap(f => [...f.left, ...f.right].map(ev => ev.plate)));
    for (const [driver, levents] of byDriverL) {
      if (!driver || levents.every(ev => matchedPlates.has(ev.plate))) continue;
      const revents = byDriverR.get(driver) || [];
      if (levents.length && revents.length) found.push({ key: driver, by: 'motorista', left: levents, right: revents });
    }

    setMatches(found);
    if (!silent) toast(
      found.length > 0 ? `${found.length} correspondência(s) encontrada(s)` : 'Nenhuma correspondência encontrada.',
      found.length > 0 ? 'success' : 'info'
    );
  }

  function clearSide(side) {
    if (side === 'left') { setLeftEvents([]); setLeftMeta(EMPTY_META); setLeftInputKey(k => k + 1); computeMatches([], rightEvents, { silent: true }); }
    else { setRightEvents([]); setRightMeta(EMPTY_META); setRightInputKey(k => k + 1); computeMatches(leftEvents, [], { silent: true }); }
  }

  function clearAll() {
    setLeftEvents([]); setRightEvents([]); setLeftMeta(EMPTY_META); setRightMeta(EMPTY_META);
    setMatches([]); setLeftInputKey(k => k + 1); setRightInputKey(k => k + 1);
    setRightCarrier(''); setCarrierFilter(''); setCarrierFilterLabel('');
    setDateFrom(''); setDateTo(''); setFilterBy('todos'); setSortBy('ocorrencias'); setOnlyDivergences(false);
    setFromCache(false); setCacheTimestamp(null);
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }

  function swapSides() {
    setLeftEvents(rightEvents); setRightEvents(leftEvents);
    setLeftMeta(rightMeta); setRightMeta(leftMeta);
    setLeftInputKey(k => k + 1); setRightInputKey(k => k + 1);
    computeMatches(rightEvents, leftEvents, { silent: true });
  }

  function applyCarrierFilter(name) {
    if (!name) return;
    const normalized = normalizeText(name);
    if (carrierFilter && normalizeText(carrierFilter) === normalized) { setCarrierFilter(''); setCarrierFilterLabel(''); return; }
    setCarrierFilter(name); setCarrierFilterLabel(name);
  }

  function exportResults(mode = 'all') {
    const list = mode === 'divergencias'
      ? filteredMatches.filter(m => m.left.length !== m.right.length)
      : filteredMatches;
    if (list.length === 0) { toast('Nenhum resultado para exportar.', 'info'); return; }
    const esc = v => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const header = [
      'Tipo', 'Chave',
      `${leftName} ocorrências`, `${rightName} ocorrências`,
      `${leftName} detalhes`, `${rightName} detalhes`,
      `${leftName} transportadoras`, `${rightName} transportadoras`,
      `${leftName} criticidades`, `${rightName} criticidades`,
      `${leftName} datas`, `${rightName} datas`,
    ];
    const rows = list.map(m => [
      m.by === 'placa' ? 'Placa' : 'Motorista', m.key,
      m.left.length, m.right.length,
      m.left.map(ev => ev.driverRaw || ev.plateRaw || '—').join(' | '),
      m.right.map(ev => ev.driverRaw || ev.plateRaw || '—').join(' | '),
      m.left.map(ev => ev.transportadoraRaw || 'Sem transportadora').join(' | '),
      m.right.map(ev => ev.transportadoraRaw || 'Sem transportadora').join(' | '),
      m.left.map(ev => ev.severityRaw || 'Sem criticidade').join(' | '),
      m.right.map(ev => ev.severityRaw || 'Sem criticidade').join(' | '),
      m.left.map(ev => ev.dateRaw || 'Sem data').join(' | '),
      m.right.map(ev => ev.dateRaw || 'Sem data').join(' | '),
    ].map(esc).join(';'));
    const csv = [header.join(';'), ...rows].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cross-check${mode === 'divergencias' ? '-divergencias' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const busy = !!loadingSide;
  const noData = leftEvents.length === 0 && rightEvents.length === 0;

  return (
    <div>
      {fromCache && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 14px', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <i className="ti ti-device-floppy" style={{ color: 'var(--accent-500)', flexShrink: 0 }}></i>
          <span>Resultados da sessão anterior carregados do cache{cacheTimestamp ? ` · ${formatLoadedAt(cacheTimestamp)}` : ''}. Faça upload das planilhas para recalcular.</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll} style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <i className="ti ti-trash"></i> Limpar
          </button>
        </div>
      )}
      <div className="card">
        <div className="card-header" style={{ gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div className="card-title"><i className="ti ti-shuffle" style={{ color: 'var(--accent-500)' }}></i> Cross-Check</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Comparar alertas entre plataformas</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={swapSides} disabled={busy || noData}>
              <i className="ti ti-switch-horizontal"></i> Trocar lados
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => clearSide('left')} disabled={busy || leftEvents.length === 0}>Limpar planilha 1</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => clearSide('right')} disabled={busy || rightEvents.length === 0}>Limpar planilha 2</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll} disabled={busy || (noData && matches.length === 0)}>Limpar tudo</button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => exportResults()} disabled={busy || filteredMatches.length === 0}>
              <i className="ti ti-download"></i> Exportar resultados
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => exportResults('divergencias')} disabled={busy || divergentMatches.length === 0}>
              <i className="ti ti-download"></i> Exportar divergências
            </button>
            <button type="button" onClick={() => computeMatches()} className="btn btn-sm btn-primary" disabled={busy || leftEvents.length === 0 || rightEvents.length === 0}>
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
              title={leftName} planilhaLabel="Planilha 1"
              uploadTitle="Arraste ou clique para selecionar"
              inputKey={`left-${leftInputKey}`}
              onUpload={e => handleUpload(e, 'left')} onDrop={e => handleDrop(e, 'left')}
              meta={leftMeta} stats={{ plates: leftStats.plates.size, drivers: leftStats.drivers.size }}
              loading={loadingSide === 'left'}
            />
            <SideUploadCard
              title={rightName} planilhaLabel="Planilha 2"
              uploadTitle="Arraste ou clique para selecionar"
              inputKey={`right-${rightInputKey}`}
              onUpload={e => handleUpload(e, 'right')} onDrop={e => handleDrop(e, 'right')}
              meta={rightMeta} stats={{ plates: rightStats.plates.size, drivers: rightStats.drivers.size }}
              loading={loadingSide === 'right'}
            >
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ marginBottom: 4 }}>Transportadora ({rightName})</label>
                <input className="form-control" value={rightCarrier} onChange={e => setRightCarrier(e.target.value)} placeholder="Ex.: Grycamp" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Usado como fallback quando a planilha não possui coluna de transportadora.
                </div>
              </div>
            </SideUploadCard>
          </div>

          <CrossCheckFilters
            dateFrom={dateFrom} dateTo={dateTo} hasDateData={hasDateData}
            filterBy={filterBy} sortBy={sortBy} onlyDivergences={onlyDivergences}
            carrierFilterLabel={carrierFilterLabel}
            searchQuery={searchQuery} onSearchChange={setSearchQuery}
            onDateFromChange={setDateFrom} onDateToChange={setDateTo}
            onFilterByChange={setFilterBy} onSortByChange={setSortBy}
            onToggleDivergences={() => setOnlyDivergences(v => !v)}
            onClearCarrierFilter={() => { setCarrierFilter(''); setCarrierFilterLabel(''); }}
            onClearFilters={() => { setFilterBy('todos'); setSortBy('ocorrencias'); setOnlyDivergences(false); setSearchQuery(''); }}
          />

          <CarrierStats
            leftCarrierStats={leftCarrierStats} rightCarrierStats={rightCarrierStats}
            leftDupStats={leftDupStats} rightDupStats={rightDupStats}
            leftName={leftName} rightName={rightName}
            onCarrierFilter={applyCarrierFilter}
          />

          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, marginBottom: 16 }}>
              Resultados: {displayedMatches.length} matches{displayedMatches.length !== derivedMatches.length ? ` (de ${derivedMatches.length})` : ''}
            </h3>
            {filteredMatches.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <i className="ti ti-layers-subtract"></i>
                <p>Nenhuma correspondência encontrada para os filtros atuais.</p>
              </div>
            ) : (
              displayedMatches.map(m => (
                <MatchCard key={`${m.by}-${m.key}`} match={m} leftName={leftName} rightName={rightName} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
