import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../hooks/useToast.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { supabase } from '../supabase.js';
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

const slimEv = ev => ({
  plateRaw:          ev.plateRaw          || '',
  driverRaw:         ev.driverRaw         || '',
  severityRaw:       ev.severityRaw       || '',
  transportadora:    ev.transportadora    || '',
  transportadoraRaw: ev.transportadoraRaw || '',
  dateRaw:           ev.dateRaw           || '',
});

// Transforma eventos brutos da API Maxtrack no formato flat do CrossCheck.
function transformMaxtrackEvents(rawEvents) {
  return rawEvents
    .filter(ev => {
      const speed = parseFloat(ev.speed);
      return isNaN(speed) || speed >= 10;
    })
    .filter(ev => ev.identifier)
    .map(ev => {
      const plateRaw   = String(ev.identifier || '');
      const driverRaw  = ev.driver?.name || '';
      const carrierRaw = ev.company?.name || '';
      const eventName  = ev.event?.name || '';
      const sevRaw     = ev.event?.criticalityLevel?.name || '';
      const startDate  = ev.startDate ? new Date(ev.startDate * 1000) : null;
      return {
        plate:            normalizePlate(plateRaw),
        plateRaw,
        driver:           normalizeText(driverRaw),
        driverRaw,
        severityRaw:      sevRaw || eventName,
        critical:         isCriticalLabel(sevRaw),
        transportadora:   normalizeText(carrierRaw),
        transportadoraRaw: carrierRaw,
        carrierSource:    carrierRaw ? 'file' : '',
        dateRaw:          startDate ? startDate.toLocaleString('pt-BR') : '',
        dateValue:        startDate,
      };
    });
}

function UploadPanel({ label, sublabel, meta, transportadora, onTranspChange, inputKey, onUpload, onDrop, onRemove, accent, loading, onFetchMaxtrack }) {
  return (
    <div className="cc-upload-panel">
      <div className="cc-upload-panel-header">
        <div className="cc-upload-label-dot" style={{ background: accent }}></div>
        <div>
          <div className="cc-upload-label">{label}</div>
          <div className="cc-upload-sublabel">{sublabel}</div>
        </div>
      </div>

      <div className="cc-transp-field">
        <label className="form-label" style={{ margin: 0, fontSize: 10 }}>Transportadora (fallback)</label>
        <input
          className="form-control cc-transp-input"
          placeholder="Ex: Grycamp"
          value={transportadora}
          onChange={e => onTranspChange(e.target.value)}
        />
        <div className="cc-transp-hint">Usado quando a planilha não possui coluna de transportadora</div>
      </div>

      {!meta?.name ? (
        <>
          <label
            className="cc-dropzone"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
            onDrop={onDrop}
          >
            <div className="cc-dropzone-icon">
              <i className={loading ? 'ti ti-loader-2 cc-spin' : 'ti ti-cloud-upload'}></i>
            </div>
            <div className="cc-dropzone-text">
              <span className="cc-dropzone-title">{loading ? 'Buscando dados…' : 'Arraste ou clique para selecionar'}</span>
              <span className="cc-dropzone-hint">.xlsx · .xls · .csv</span>
            </div>
            <input key={inputKey} type="file" accept=".csv,.xls,.xlsx" hidden disabled={loading} onChange={onUpload} />
          </label>
          {onFetchMaxtrack && (
            <div className="cc-maxtrack-fetch">
              <span className="cc-maxtrack-or">ou</span>
              <button type="button" className="btn btn-sm" onClick={onFetchMaxtrack} disabled={loading}>
                <i className="ti ti-cloud-download"></i> Buscar da Maxtrack
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="cc-file-loaded">
          <div className="cc-file-icon"><i className="ti ti-file-spreadsheet"></i></div>
          <div className="cc-file-info">
            <div className="cc-file-name">{meta.name}</div>
            <div className="cc-file-meta">{meta.rows} linhas processadas</div>
          </div>
          <button type="button" className="btn-icon" onClick={onRemove} title="Remover">
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}
    </div>
  );
}

function TransportadorasView({ data }) {
  const max = data.length > 0 ? Math.max(...data.map(d => Math.max(d.p1, d.p2))) : 1;

  if (data.length === 0) {
    return (
      <div className="cc-transp-view">
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Nenhum dado de transportadora disponível.
        </div>
      </div>
    );
  }

  return (
    <div className="cc-transp-view">
      {data.map((t, i) => (
        <div key={t.nome + i} className="cc-transp-row">
          <div className="cc-transp-rank">#{i + 1}</div>
          <div className="cc-transp-info">
            <div className="cc-transp-name">{t.nome}</div>
            <div className="cc-transp-bars">
              <div className="cc-transp-bar-row">
                <span className="cc-transp-bar-label">A</span>
                <div className="cc-transp-bar-track">
                  <div className="cc-transp-bar cc-transp-bar-a" style={{ width: `${(t.p1 / max) * 100}%` }}></div>
                </div>
                <span className="cc-transp-bar-val">{t.p1}</span>
              </div>
              <div className="cc-transp-bar-row">
                <span className="cc-transp-bar-label">B</span>
                <div className="cc-transp-bar-track">
                  <div className="cc-transp-bar cc-transp-bar-b" style={{ width: `${(t.p2 / max) * 100}%` }}></div>
                </div>
                <span className="cc-transp-bar-val">{t.p2}</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {t.p1 === t.p2 ? (
              <span className="badge badge-success" style={{ fontSize: 10 }}>
                <i className="ti ti-check" style={{ fontSize: 10 }}></i> Igual
              </span>
            ) : (
              <span className="badge badge-danger" style={{ fontSize: 10 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 10 }}></i> Dif.
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CrossCheck() {
  const toast = useToast();
  const { profile } = useAuth();

  const [leftEvents,   setLeftEvents]   = useState([]);
  const [rightEvents,  setRightEvents]  = useState([]);
  const [matches,      setMatches]      = useState([]);
  const [leftMeta,     setLeftMeta]     = useState(EMPTY_META);
  const [rightMeta,    setRightMeta]    = useState(EMPTY_META);
  const [leftInputKey, setLeftInputKey] = useState(0);
  const [rightInputKey,setRightInputKey]= useState(0);
  const [loadingSide,  setLoadingSide]  = useState(null);

  const [leftCarrier,        setLeftCarrier]        = useState('');
  const [rightCarrier,       setRightCarrier]       = useState('');
  const [carrierFilter,      setCarrierFilter]      = useState('');
  const [carrierFilterLabel, setCarrierFilterLabel] = useState('');
  const [dateFrom,           setDateFrom]           = useState('');
  const [dateTo,             setDateTo]             = useState('');
  const [filterBy,           setFilterBy]           = useState('todos');
  const [sortBy,             setSortBy]             = useState('ocorrencias');
  const [onlyDivergences,    setOnlyDivergences]    = useState(false);
  const [searchQuery,        setSearchQuery]        = useState('');

  const [activeTab,     setActiveTab]     = useState('todos');
  const [showMoreMenu,  setShowMoreMenu]  = useState(false);
  const [comparing,     setComparing]     = useState(false);
  const menuRef = useRef(null);

  const [fromCache,      setFromCache]      = useState(false);
  const [cacheTimestamp, setCacheTimestamp] = useState(null);

  // Restore from cache on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cache = JSON.parse(raw);
      if (!cache.matches?.length) return;
      setLeftMeta(cache.leftMeta   || EMPTY_META);
      setRightMeta(cache.rightMeta || EMPTY_META);
      setMatches(cache.matches);
      setRightCarrier(cache.rightCarrier || '');
      setLeftCarrier(cache.leftCarrier   || '');
      setCacheTimestamp(cache.savedAt);
      setFromCache(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist matches to cache
  useEffect(() => {
    try {
      if (matches.length === 0) { localStorage.removeItem(CACHE_KEY); return; }
      const slim = matches.map(m => ({
        key: m.key, by: m.by,
        left:  m.left.map(slimEv),
        right: m.right.map(slimEv),
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        leftMeta, rightMeta, matches: slim,
        rightCarrier, leftCarrier,
        savedAt: new Date().toISOString(),
      }));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMoreMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Apply rightCarrier fallback retroactively to already-loaded right events
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

  const leftName  = leftMeta.name  ? leftMeta.name.replace(/\.[^.]+$/, '')  : 'Planilha 1';
  const rightName = rightMeta.name ? rightMeta.name.replace(/\.[^.]+$/, '') : 'Planilha 2';

  const {
    leftStats, rightStats,
    totalPlates, totalRows,
    divergenceCount,
    leftCarrierStats, rightCarrierStats,
    hasDateData, derivedMatches, filteredMatches, divergentMatches,
  } = useMemo(() => {
    const dateFromValue = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const dateToValue   = dateTo   ? new Date(`${dateTo}T23:59:59`)   : null;
    const hasDateFilter = Boolean(dateFromValue || dateToValue);
    const leftHasDateData  = leftEvents.some(ev => ev.dateValue);
    const rightHasDateData = rightEvents.some(ev => ev.dateValue);

    const withinDate = (ev, sideHasDate) => {
      if (!hasDateFilter || !sideHasDate) return true;
      if (!ev.dateValue) return false;
      if (dateFromValue && ev.dateValue < dateFromValue) return false;
      if (dateToValue   && ev.dateValue > dateToValue)   return false;
      return true;
    };

    const dateFilteredLeft  = leftHasDateData  && hasDateFilter ? leftEvents.filter(ev  => withinDate(ev, true))  : leftEvents;
    const dateFilteredRight = rightHasDateData && hasDateFilter ? rightEvents.filter(ev => withinDate(ev, true)) : rightEvents;

    const carrierFilterNorm = carrierFilter ? normalizeText(carrierFilter) : '';
    const emptyCarrierKey   = normalizeText('Sem transportadora');
    const matchHasCarrier = (m) => {
      if (!carrierFilterNorm) return true;
      const has = (ev) => (ev.transportadora || emptyCarrierKey) === carrierFilterNorm;
      return m.left.some(has) || m.right.some(has);
    };

    const derivedMatches = matches
      .filter(matchHasCarrier)
      .map((m) => {
        const left  = leftHasDateData  && hasDateFilter ? m.left.filter(ev  => withinDate(ev, true))  : m.left;
        const right = rightHasDateData && hasDateFilter ? m.right.filter(ev => withinDate(ev, true)) : m.right;
        if (left.length === 0 || right.length === 0) return null;
        return { ...m, left, right };
      })
      .filter(Boolean);

    const leftStats  = buildStats(dateFilteredLeft);
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
      totalPlates:    new Set([...leftStats.plates, ...rightStats.plates]).size,
      totalRows:      leftStats.rows + rightStats.rows,
      divergenceCount: derivedMatches.filter(m => m.left.length !== m.right.length).length,
      leftCarrierStats:  buildCarrierStats(dateFilteredLeft),
      rightCarrierStats: buildCarrierStats(dateFilteredRight),
      leftDupStats:  buildDuplicateStats(dateFilteredLeft),
      rightDupStats: buildDuplicateStats(dateFilteredRight),
      hasDateData: leftHasDateData || rightHasDateData,
      derivedMatches,
      filteredMatches,
      divergentMatches: filteredMatches.filter(m => m.left.length !== m.right.length),
    };
  }, [leftEvents, rightEvents, matches, dateFrom, dateTo, carrierFilter, filterBy, sortBy, onlyDivergences]);

  // Combined carrier stats for TransportadorasView tab
  const carrierCombined = useMemo(() => {
    const map = new Map();
    leftCarrierStats.forEach(({ name, count }) => {
      const key = name.toLowerCase().trim();
      if (!map.has(key)) map.set(key, { nome: name, p1: 0, p2: 0 });
      map.get(key).p1 += count;
    });
    rightCarrierStats.forEach(({ name, count }) => {
      const key = name.toLowerCase().trim();
      if (!map.has(key)) map.set(key, { nome: name, p1: 0, p2: 0 });
      map.get(key).p2 += count;
    });
    return [...map.values()].sort((a, b) => (b.p1 + b.p2) - (a.p1 + a.p2));
  }, [leftCarrierStats, rightCarrierStats]);

  const searchNorm = searchQuery.trim().toLowerCase();
  const displayedMatches = searchNorm
    ? filteredMatches.filter(m => m.key.toLowerCase().includes(searchNorm))
    : filteredMatches;

  let tableRows = displayedMatches;
  if (activeTab === 'matches')      tableRows = displayedMatches.filter(m => m.left.length === m.right.length);
  else if (activeTab === 'divergencias') tableRows = displayedMatches.filter(m => m.left.length !== m.right.length);

  const tabMatchCount = displayedMatches.filter(m => m.left.length === m.right.length).length;
  const tabDivCount   = displayedMatches.filter(m => m.left.length !== m.right.length).length;
  const perfectMatchCount = derivedMatches.filter(m => m.left.length === m.right.length).length;

  const busy      = !!loadingSide;
  const pageState = matches.length > 0
    ? 'results'
    : (leftMeta.name || rightMeta.name ? 'loaded' : 'empty');

  async function parseFile(file) {
    if (!file) return [];
    try {
      const xlsxModule = await import('xlsx');
      const XLSX = xlsxModule.default || xlsxModule;
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      const plateKeys    = ['Identificador/Placa', 'Placa', 'Plate', 'Veiculo', 'Identificador', 'Placa / Empurrador'];
      const driverKeys   = ['Motorista', 'Motorista / Comandante', 'Nome do Motorista', 'Nome', 'Driver'];
      const carrierKeys  = ['Transportadora', 'Empresa', 'Cliente', 'Transportador', 'Razao Social', 'Transportes'];
      const dateKeys     = ['Data', 'Data Chegada', 'Data/Hora', 'Data Hora', 'Timestamp', 'Data do Evento', 'Data de Chegada'];
      const severityKeys = ['Criticidade', 'Criticidade Original', 'Severidade', 'Prioridade', 'Categoria', 'Severity'];
      return rows.map(r => {
        const rawPlate    = pickFirst(r, plateKeys);
        const rawDriver   = pickFirst(r, driverKeys);
        const rawSeverity = pickFirst(r, severityKeys);
        const rawCarrier  = pickFirst(r, carrierKeys);
        const rawDate     = pickFirst(r, dateKeys);
        return {
          raw:              r,
          plate:            normalizePlate(rawPlate),
          plateRaw:         rawPlate    || '',
          driver:           normalizeText(rawDriver),
          driverRaw:        rawDriver   || '',
          severityRaw:      rawSeverity || '',
          critical:         isCriticalLabel(rawSeverity),
          transportadora:   normalizeText(rawCarrier),
          transportadoraRaw: rawCarrier || '',
          carrierSource:    rawCarrier ? 'file' : '',
          dateRaw:          rawDate || '',
          dateValue:        parseDateValue(rawDate),
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
    const fallback           = side === 'left' ? leftCarrier.trim() : rightCarrier.trim();
    const normalizedFallback = fallback ? normalizeText(fallback) : '';
    const withCarrier = fallback
      ? parsed.map(ev => ev.transportadoraRaw ? ev
          : { ...ev, transportadoraRaw: fallback, transportadora: normalizedFallback, carrierSource: 'fallback' })
      : parsed;
    const meta = { name: file.name, rows: withCarrier.length, loadedAt: new Date().toISOString() };
    if (side === 'left') { setLeftEvents(withCarrier);  setLeftMeta(meta);  computeMatches(withCarrier, rightEvents); }
    else                 { setRightEvents(withCarrier); setRightMeta(meta); computeMatches(leftEvents, withCarrier); }
  }

  function handleUpload(e, side) { handleFile(e.target.files?.[0], side); }
  function handleDrop(e, side) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file, side);
  }

  async function handleFetchMaxtrack(side) {
    if (!profile?.maxtrack_email) {
      toast('Configure suas credenciais Maxtrack em Meu Perfil → Integrações para usar essa função.', 'info');
      return;
    }
    setLoadingSide(side);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pull-maxtrack`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ao buscar dados Maxtrack: HTTP ${res.status}`);
      }

      const apiData = await res.json();
      const events  = transformMaxtrackEvents(apiData?.events || []);

      if (events.length === 0) {
        toast('Nenhum evento encontrado na Maxtrack no momento.', 'info');
        return;
      }

      const meta = { name: 'Maxtrack (hoje)', rows: events.length, loadedAt: new Date().toISOString() };
      if (side === 'left') {
        setLeftEvents(events); setLeftMeta(meta);
        computeMatches(events, rightEvents);
      } else {
        setRightEvents(events); setRightMeta(meta);
        computeMatches(leftEvents, events);
      }
    } catch (err) {
      toast(err.message || 'Erro ao buscar dados da Maxtrack.', 'error');
    } finally {
      setLoadingSide(null);
    }
  }

  function computeMatches(left, right, options = {}) {
    const { silent = false } = options;
    const L = left  ?? leftEvents;
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

  function handleCompare() {
    if (leftEvents.length === 0 || rightEvents.length === 0) return;
    setComparing(true);
    setTimeout(() => {
      computeMatches(leftEvents, rightEvents);
      setComparing(false);
    }, 500);
  }

  function clearSide(side) {
    if (side === 'left') {
      setLeftEvents([]); setLeftMeta(EMPTY_META); setLeftInputKey(k => k + 1);
      computeMatches([], rightEvents, { silent: true });
    } else {
      setRightEvents([]); setRightMeta(EMPTY_META); setRightInputKey(k => k + 1);
      computeMatches(leftEvents, [], { silent: true });
    }
  }

  function clearAll() {
    setLeftEvents([]); setRightEvents([]); setLeftMeta(EMPTY_META); setRightMeta(EMPTY_META);
    setMatches([]); setLeftInputKey(k => k + 1); setRightInputKey(k => k + 1);
    setLeftCarrier(''); setRightCarrier('');
    setCarrierFilter(''); setCarrierFilterLabel('');
    setDateFrom(''); setDateTo('');
    setFilterBy('todos'); setSortBy('ocorrencias'); setOnlyDivergences(false);
    setSearchQuery(''); setActiveTab('todos');
    setFromCache(false); setCacheTimestamp(null);
    try { localStorage.removeItem(CACHE_KEY); } catch {}
  }

  function swapSides() {
    setLeftEvents(rightEvents);  setRightEvents(leftEvents);
    setLeftMeta(rightMeta);      setRightMeta(leftMeta);
    setLeftCarrier(rightCarrier); setRightCarrier(leftCarrier);
    setLeftInputKey(k => k + 1); setRightInputKey(k => k + 1);
    computeMatches(rightEvents, leftEvents, { silent: true });
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
      m.left.map(ev  => ev.driverRaw  || ev.plateRaw || '—').join(' | '),
      m.right.map(ev => ev.driverRaw  || ev.plateRaw || '—').join(' | '),
      m.left.map(ev  => ev.transportadoraRaw || 'Sem transportadora').join(' | '),
      m.right.map(ev => ev.transportadoraRaw || 'Sem transportadora').join(' | '),
      m.left.map(ev  => ev.severityRaw || 'Sem criticidade').join(' | '),
      m.right.map(ev => ev.severityRaw || 'Sem criticidade').join(' | '),
      m.left.map(ev  => ev.dateRaw || 'Sem data').join(' | '),
      m.right.map(ev => ev.dateRaw || 'Sem data').join(' | '),
    ].map(esc).join(';'));
    const csv  = [header.join(';'), ...rows].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `cross-check${mode === 'divergencias' ? '-divergencias' : ''}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="cc-page">
      {/* Cache notice */}
      {fromCache && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', padding: '8px 14px',
          marginBottom: 12, fontSize: 12, color: 'var(--text-muted)',
        }}>
          <i className="ti ti-device-floppy" style={{ color: 'var(--accent-500)', flexShrink: 0 }}></i>
          <span>
            Resultados da sessão anterior carregados do cache{cacheTimestamp ? ` · ${formatLoadedAt(cacheTimestamp)}` : ''}.
            Faça upload das planilhas para recalcular.
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={clearAll} style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <i className="ti ti-trash"></i> Limpar
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="cc-header">
        <div className="cc-header-left">
          <h1 className="cc-title">Cross-Check</h1>
          <p className="cc-subtitle">Comparar alertas entre plataformas</p>
        </div>
        <div className="cc-header-actions">
          {pageState === 'results' && (
            <>
              <button type="button" className="btn btn-sm" onClick={() => exportResults()} disabled={filteredMatches.length === 0}>
                <i className="ti ti-file-export"></i> Exportar resultados
              </button>
              <button type="button" className="btn btn-sm" onClick={() => exportResults('divergencias')} disabled={divergentMatches.length === 0}>
                <i className="ti ti-alert-triangle"></i> Exportar divergências
              </button>
            </>
          )}
          {(pageState === 'loaded' || pageState === 'results') && (
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button type="button" className="btn btn-sm" onClick={() => setShowMoreMenu(v => !v)}>
                <i className="ti ti-dots-vertical"></i>
              </button>
              {showMoreMenu && (
                <div className="cc-dropdown">
                  <button type="button" className="cc-dropdown-item" onClick={() => { swapSides(); setShowMoreMenu(false); }}>
                    <i className="ti ti-arrows-exchange"></i> Trocar lados
                  </button>
                  <button type="button" className="cc-dropdown-item" onClick={() => { clearSide('left'); setShowMoreMenu(false); }}>
                    <i className="ti ti-trash"></i> Limpar Planilha 1
                  </button>
                  <button type="button" className="cc-dropdown-item" onClick={() => { clearSide('right'); setShowMoreMenu(false); }}>
                    <i className="ti ti-trash"></i> Limpar Planilha 2
                  </button>
                  <div className="cc-dropdown-sep"></div>
                  <button type="button" className="cc-dropdown-item cc-dropdown-danger" onClick={() => { clearAll(); setShowMoreMenu(false); }}>
                    <i className="ti ti-trash"></i> Limpar tudo
                  </button>
                </div>
              )}
            </div>
          )}
          {leftEvents.length > 0 && rightEvents.length > 0 && pageState !== 'results' && (
            <button type="button" className="btn btn-primary" onClick={handleCompare} disabled={comparing || busy}>
              {comparing
                ? <><i className="ti ti-loader-2 cc-spin"></i> Comparando...</>
                : <><i className="ti ti-git-compare"></i> Comparar</>}
            </button>
          )}
          {pageState === 'results' && (
            <button type="button" className="btn btn-primary" onClick={handleCompare} disabled={comparing || busy || leftEvents.length === 0}>
              {comparing
                ? <><i className="ti ti-loader-2 cc-spin"></i> Comparando...</>
                : <><i className="ti ti-refresh"></i> Recomparar</>}
            </button>
          )}
        </div>
      </div>

      {/* Stats strip — shown only with results */}
      {pageState === 'results' && (
        <div className="stat-strip cc-stats-strip">
          <div className="stat-box">
            <div className="stat-label">Linhas processadas</div>
            <div className="stat-value">{totalRows}</div>
            <div className="stat-sub">{leftName}: {leftStats.rows} · {rightName}: {rightStats.rows}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Placas / Motoristas</div>
            <div className="stat-value">{totalPlates}</div>
            <div className="stat-sub">{totalPlates} em comum</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Matches encontrados</div>
            <div className="stat-value success">{perfectMatchCount}</div>
            <div className="stat-sub up"><i className="ti ti-check"></i> ocorrências iguais</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Divergências</div>
            <div className="stat-value danger">{divergenceCount}</div>
            <div className="stat-sub down"><i className="ti ti-alert-triangle"></i> prioridade de investigação</div>
          </div>
        </div>
      )}

      {/* Upload panels */}
      <div className={`cc-upload-section${pageState === 'results' ? ' cc-upload-collapsed' : ''}`}>
        <div className="cc-upload-grid">
          <UploadPanel
            label="Plataforma A"
            sublabel={leftName}
            meta={leftMeta}
            transportadora={leftCarrier}
            onTranspChange={setLeftCarrier}
            inputKey={`left-${leftInputKey}`}
            onUpload={e => handleUpload(e, 'left')}
            onDrop={e => handleDrop(e, 'left')}
            onRemove={() => clearSide('left')}
            accent="var(--accent-500)"
            loading={loadingSide === 'left'}
            onFetchMaxtrack={profile?.maxtrack_email ? () => handleFetchMaxtrack('left') : null}
          />
          <div className="cc-upload-divider">
            <div className="cc-swap-btn" title="Trocar lados" onClick={swapSides}>
              <i className="ti ti-arrows-exchange"></i>
            </div>
          </div>
          <UploadPanel
            label="Plataforma B"
            sublabel={rightName}
            meta={rightMeta}
            transportadora={rightCarrier}
            onTranspChange={setRightCarrier}
            inputKey={`right-${rightInputKey}`}
            onUpload={e => handleUpload(e, 'right')}
            onDrop={e => handleDrop(e, 'right')}
            onRemove={() => clearSide('right')}
            accent="var(--info-500)"
            loading={loadingSide === 'right'}
            onFetchMaxtrack={profile?.maxtrack_email ? () => handleFetchMaxtrack('right') : null}
          />
        </div>
      </div>

      {/* Empty guide */}
      {pageState === 'empty' && (
        <div className="cc-empty-guide">
          <div className="cc-empty-icon"><i className="ti ti-arrows-exchange"></i></div>
          <h3>Compare alertas de duas plataformas</h3>
          <p>Carregue as planilhas de cada plataforma acima para identificar matches e divergências entre motoristas e veículos.</p>
          <div className="cc-steps">
            <div className="cc-step">
              <span className="cc-step-num">1</span>
              <span>Carregue as planilhas (.xlsx, .xls, .csv)</span>
            </div>
            <div className="cc-step">
              <span className="cc-step-num">2</span>
              <span>Preencha a transportadora se necessário</span>
            </div>
            <div className="cc-step">
              <span className="cc-step-num">3</span>
              <span>Clique em "Comparar" para cruzar os dados</span>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {pageState === 'results' && (
        <div className="cc-results">
          {/* Tabs */}
          <div className="cc-results-header">
            <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
              {[
                { id: 'todos',           label: 'Todos',           count: displayedMatches.length },
                { id: 'matches',         label: 'Matches',         count: tabMatchCount },
                { id: 'divergencias',    label: 'Divergências',    count: tabDivCount },
                { id: 'transportadoras', label: 'Transportadoras', count: carrierCombined.length },
              ].map(tab => (
                <div
                  key={tab.id}
                  className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label} <span className="tab-count">{tab.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Active carrier filter badge */}
          {carrierFilterLabel && (
            <div style={{
              padding: '8px 18px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-1)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Filtrando por transportadora:</span>
              <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-building"></i> {carrierFilterLabel}
                <button
                  type="button"
                  onClick={() => { setCarrierFilter(''); setCarrierFilterLabel(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 4, color: 'inherit', display: 'flex', alignItems: 'center' }}
                >
                  <i className="ti ti-x" style={{ fontSize: 11 }}></i>
                </button>
              </span>
            </div>
          )}

          {/* Filter row (hidden on Transportadoras tab) */}
          {activeTab !== 'transportadoras' && (
            <div className="cc-filter-row">
              <div className="cc-filter-group">
                <label><i className="ti ti-calendar"></i></label>
                <input
                  type="date"
                  className="cc-filter-input cc-date-input"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  disabled={!hasDateData}
                  title={!hasDateData ? 'Nenhuma coluna de data identificada' : undefined}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>até</span>
                <input
                  type="date"
                  className="cc-filter-input cc-date-input"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  disabled={!hasDateData}
                  title={!hasDateData ? 'Nenhuma coluna de data identificada' : undefined}
                />
              </div>
              <div className="cc-filter-sep"></div>
              <div className="cc-filter-group">
                <label>Tipo</label>
                <select className="cc-filter-select" value={filterBy} onChange={e => setFilterBy(e.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="placa">Placas</option>
                  <option value="motorista">Motoristas</option>
                </select>
              </div>
              <div className="cc-filter-sep"></div>
              <div className="cc-filter-group">
                <label>Ordenar</label>
                <select className="cc-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="ocorrencias">Ocorrências</option>
                  <option value="alfabetica">Alfabética</option>
                </select>
              </div>
              <div className="cc-filter-sep"></div>
              {activeTab !== 'divergencias' && (
                <button
                  type="button"
                  className={`btn btn-sm${onlyDivergences ? ' btn-primary' : ''}`}
                  onClick={() => setOnlyDivergences(v => !v)}
                >
                  <i className="ti ti-filter"></i> Só divergências
                </button>
              )}
              <div style={{ flex: 1 }}></div>
              <div className="cc-search-mini">
                <i className="ti ti-search"></i>
                <input
                  placeholder="Placa ou motorista…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Table or Transportadoras view */}
          {activeTab !== 'transportadoras' ? (
            tableRows.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <i className="ti ti-layers-subtract"></i>
                <p>Nenhuma correspondência encontrada para os filtros atuais.</p>
              </div>
            ) : (
              <div className="cc-table-wrap">
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Motorista</th>
                      <th>Placa</th>
                      <th>Transportadora</th>
                      <th style={{ textAlign: 'center' }}>{leftName}</th>
                      <th style={{ textAlign: 'center' }}>{rightName}</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((m) => {
                      const driverName = m.by === 'motorista'
                        ? m.key
                        : (m.left[0]?.driverRaw || m.right[0]?.driverRaw || '—');
                      const plateName = m.by === 'placa'
                        ? m.key
                        : (m.left[0]?.plateRaw || m.right[0]?.plateRaw || '—');
                      const carrier = m.left[0]?.transportadoraRaw || m.right[0]?.transportadoraRaw || '—';
                      const isMatch = m.left.length === m.right.length;
                      const initials = driverName
                        .split(' ').slice(0, 2)
                        .map(w => w[0] || '').join('')
                        .toUpperCase();
                      return (
                        <tr key={`${m.by}-${m.key}`} className={!isMatch ? 'cc-row-div' : ''}>
                          <td>
                            <div className="cc-driver-cell">
                              <div className={`cc-driver-avatar ${isMatch ? 'success' : 'danger'}`}>
                                {initials || '?'}
                              </div>
                              <span>{driverName}</span>
                            </div>
                          </td>
                          <td><span className="cc-mono">{plateName}</span></td>
                          <td><span className="cc-transp-badge">{carrier}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="cc-count">{m.left.length}</span></td>
                          <td style={{ textAlign: 'center' }}><span className="cc-count">{m.right.length}</span></td>
                          <td style={{ textAlign: 'center' }}>
                            {isMatch ? (
                              <span className="badge badge-success">
                                <i className="ti ti-check" style={{ fontSize: 11 }}></i> Match
                              </span>
                            ) : (
                              <span className="badge badge-danger">
                                <i className="ti ti-alert-triangle" style={{ fontSize: 11 }}></i> Divergência
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <TransportadorasView data={carrierCombined} />
          )}
        </div>
      )}
    </div>
  );
}
