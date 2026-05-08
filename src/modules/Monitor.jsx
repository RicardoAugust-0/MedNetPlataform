import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useTemplates } from '../hooks/useTemplates';
import { useConfirm } from '../hooks/useConfirm';
import { iniciais } from '../utils';
import { parseSheetFile } from '../parseSheet';

/* ── Google Sheets via Supabase Edge Function ── */
async function postToSheets(payload, accessToken) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/append-sheet`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) console.warn('[Sheets]', data.error);
  } catch (e) {
    console.warn('[Sheets] falha ao registrar na planilha:', e.message);
  }
}

/* ── Push Notifications ── */
async function notificarCriticos(criticos) {
  if (!criticos.length || !('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;
  new Notification(`⚠️ ${criticos.length} motorista${criticos.length > 1 ? 's' : ''} em intervenção`, {
    body: criticos.slice(0, 3).map(d => `${d.nome.split(' ')[0]} · ${d.alertas} evento${d.alertas > 1 ? 's' : ''}`).join('\n'),
    icon: '/favicon.ico',
    tag: 'alerta-intervencao',
  });
}

/* ── Timer de fila ── */
function ElapsedTimer({ since }) {
  const [mins, setMins] = useState(() => since ? Math.floor((Date.now() - new Date(since)) / 60000) : 0);
  useEffect(() => {
    if (!since) return;
    const id = setInterval(() => setMins(Math.floor((Date.now() - new Date(since)) / 60000)), 30000);
    return () => clearInterval(id);
  }, [since]);
  if (!since || mins < 2) return null;
  const color = mins >= 20 ? 'var(--danger-500)' : mins >= 8 ? 'var(--warning-500)' : 'var(--text-muted)';
  const label = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? ` ${mins % 60}min` : ''}` : `${mins}min`;
  return (
    <span style={{ fontSize: 10.5, color, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
      <i className="ti ti-clock" style={{ fontSize: 9, marginRight: 2 }}></i>{label} na fila
    </span>
  );
}

/* ── CSV export ── */
function exportCSV(rows) {
  const header = ['Data', 'Hora', 'Motorista', 'Placa', 'Transportadora', 'Tipo', 'Operador', 'Observação'];
  const lines = rows.map(r => [
    new Date(r.created_at).toLocaleDateString('pt-BR'),
    r.hora || '',
    r.motorista || '',
    r.placa || '',
    r.transportadora || '',
    { intervencao: 'Intervenção', reportar: 'Reportar', descarte: 'Descarte', limpeza: 'Limpeza' }[r.tipo] || r.tipo,
    r.operador || '',
    (r.obs || '').replace(/,/g, ';'),
  ].map(v => `"${v}"`).join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `atendimentos_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

export default function Monitor() {
  const { drivers, setDrivers, filters, setFilters, excluirTecnicos, setExcluirTecnicos, setActivePanel } = useApp();
  const { profile, session } = useAuth();
  const { history, loading: histLoading, error: histError, registrar, loadByRange } = useAtendimentos();
  const { templates } = useTemplates();
  const confirm = useConfirm();
  const [templateModal, setTemplateModal] = useState(null);

  useEffect(() => {
    if (!templateModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setTemplateModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateModal]);

  const [activeTab,  setActiveTab]  = useState('intervencao');
  const [statusMsg,  setStatusMsg]  = useState(drivers.length > 0 ? `${drivers.length} motoristas na fila (planilha anterior)` : 'Aguardando carga da planilha (.xlsx ou .csv)');
  const [statusKind, setStatusKind] = useState(drivers.length > 0 ? 'active' : 'idle');
  const [loadStats,  setLoadStats]  = useState(null);
  const [loading,    setLoading]    = useState(false);

  const [sheetLoadedAt, setSheetLoadedAt] = useState(() => localStorage.getItem('mn_sheet_loaded_at'));
  const [sheetAgeMin,   setSheetAgeMin]   = useState(() => {
    const ts = localStorage.getItem('mn_sheet_loaded_at');
    return ts ? Math.floor((Date.now() - new Date(ts)) / 60000) : null;
  });

  useEffect(() => {
    if (!sheetLoadedAt) return;
    const id = setInterval(() => {
      setSheetAgeMin(Math.floor((Date.now() - new Date(sheetLoadedAt)) / 60000));
    }, 60000);
    return () => clearInterval(id);
  }, [sheetLoadedAt]);

  // Filtros do histórico
  const [histPeriod,  setHistPeriod]  = useState('hoje');
  const [histTipo,    setHistTipo]    = useState('');
  const [histSearch,  setHistSearch]  = useState('');
  const [histFrom,     setHistFrom]     = useState('');
  const [histTo,       setHistTo]       = useState('');
  const [rangeHistory, setRangeHistory] = useState([]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState(null);

  /* ── Filtros fila ── */
  const filtered = drivers.filter(d => {
    const f = filters;
    if (excluirTecnicos && d.alertas === 0 && d.reportaveis === 0) return false;
    if (f.turno && d.turno !== f.turno) return false;
    if (f.empresa && d.transportadora !== f.empresa) return false;
    if (f.comportamento) {
      const todos = [...(d.tipos || []), ...(d.tiposReportar || [])];
      if (!todos.some(t => t.includes(f.comportamento))) return false;
    }
    if (f.prioridade === 'gravissimo' && d.severidade !== 'Gravíssimo') return false;
    if (f.prioridade === 'grave'      && d.severidade !== 'Grave')      return false;
    if (f.prioridade === 'normal'     && d.severidade !== 'Normal')     return false;
    return true;
  });

  const intervencaoList = filtered.filter(d => d.alertas > 0).sort((a, b) => b.alertas - a.alertas);
  const reportarList    = filtered.filter(d => d.alertas === 0 && d.reportaveis > 0).sort((a, b) => b.reportaveis - a.reportaveis);
  const tecList         = filtered.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0);
  const transps         = [...new Set(drivers.map(d => d.transportadora))].sort();

  /* ── Filtros histórico ── */
  const histFiltered = useMemo(() => {
    const now = new Date();
    return history.filter(item => {
      const d = new Date(item.created_at);
      if (histPeriod === 'hoje'   && d.toDateString() !== now.toDateString()) return false;
      if (histPeriod === 'semana' && (now - d) > 7 * 86400000)                return false;
      if (histPeriod === 'mes'    && (now - d) > 30 * 86400000)               return false;
      if (histTipo && item.tipo !== histTipo) return false;
      if (histSearch) {
        const q = histSearch.toLowerCase();
        if (!item.motorista?.toLowerCase().includes(q) && !item.operador?.toLowerCase().includes(q) && !item.placa?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [history, histPeriod, histTipo, histSearch]);

  useEffect(() => {
    if (histPeriod !== 'intervalo') {
      setRangeHistory([]);
      setRangeError(null);
    }
  }, [histPeriod]);

  /* ── Upload ── */
  const handleFile = async (file) => {
    setLoading(true); setStatusKind('idle'); setStatusMsg(`Processando ${file.name}…`);
    try {
      const { drivers: newDrivers, stats } = await parseSheetFile(file);
      const loadedAt = new Date().toISOString();
      const timestamped = newDrivers.map(d => ({ ...d, _loadedAt: loadedAt }));
      setDrivers(timestamped);
      localStorage.setItem('mn_sheet_loaded_at', loadedAt);
      setSheetLoadedAt(loadedAt);
      setSheetAgeMin(0);
      setLoadStats(stats);
      setStatusKind('active');
      setStatusMsg(`${file.name} · ${stats.comIntervencao} para intervenção · ${stats.soReportar} para reportar · ${stats.falsosPositivos} falsos positivos removidos`);
      setActiveTab('intervencao');
      notificarCriticos(timestamped.filter(d => d.alertas >= 5));
    } catch (err) {
      setStatusKind('error');
      setStatusMsg(`Erro ao ler planilha: ${err.message}`);
    } finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  /* ── Ações ── */
  const attend = async (d) => {
    if (!(await confirm({ title: 'Iniciar contato', message: `Iniciar contato com ${d.nome}?` }))) return;
    const obs = `${d.alertas} evento(s) de intervenção (${d.tipos.join(', ') || '—'})`;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'intervencao', obs });
    setDrivers(drivers.map(x => x === d ? { ...x, alertas: 0, tipos: [] } : x));
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const data = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    const sev = d.severidade || 'Normal';
    const criticidade = sev === 'Gravíssimo' ? 'GRAVÍSSIMO' : sev === 'Grave' ? 'GRAVE' : 'MÉDIO';
    const classificacao = (sev === 'Gravíssimo' || sev === 'Grave') ? 'IMEDIATA' : 'PREVENTIVA';
    postToSheets({
      data,
      empresa:         d.transportadora || '',
      sistema:         'SASCAR',
      colaborador:     d.nome,
      placa:           d.placa || '',
      frota:           d.frota || '',
      criticidade,
      classificacao,
      motivo:          'FADIGA',
      solicitadoPor:   profile?.nome || '',
      horaSolicitacao: hora,
    }, session?.access_token);
  };

  const reportar = async (d) => {
    if (!(await confirm({ title: 'Registrar notificação', message: `Registrar notificação para a empresa: ${d.nome}?` }))) return;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'reportar', obs: `Reportado à transportadora · ${d.reportaveis} evento(s) (${d.tiposReportar.join(', ') || '—'})` });
    setDrivers(drivers.map(x => x === d ? { ...x, reportaveis: 0, tiposReportar: [] } : x));
  };

  const deleteAlert = async (d) => {
    if (!(await confirm({ title: 'Descartar alerta', message: `Descartar alerta de intervenção de ${d.nome}?`, danger: true }))) return;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'descarte', obs: `Alerta descartado · ${d.alertas} evento(s) removidos` });
    setDrivers(drivers.map(x => x === d ? { ...x, alertas: 0, tipos: [] } : x));
  };

  const clearQueue = async () => {
    if (!(await confirm({ title: 'Limpar fila', message: 'Tem certeza que deseja limpar toda a fila de motoristas?', danger: true }))) return;
    setDrivers([]);
    setLoadStats(null);
    setStatusKind('idle');
    setStatusMsg('Fila limpa. Aguardando nova planilha.');
    localStorage.removeItem('mn_sheet_loaded_at');
    setSheetLoadedAt(null);
    setSheetAgeMin(null);
  };

  const resetFilters = () => setFilters({ empresa: '', comportamento: '', turno: '', prioridade: '' });

  const applyTemplate = (rawText, d) => {
    if (!rawText) return '';
    const hour = new Date().getHours();
    const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    
    const nomeMotorista = (!d.nome || d.nome === d.placa || d.nome === '—') ? 'o condutor' : d.nome;
    
    return rawText
      .replace(/(?:\{\{saudacao\}\}|\[SAUDACAO\]|\[SAUDAÇÃO\])/gi, saudacao)
      .replace(/(?:\{\{nome\}\}|\[NOME\])/gi, nomeMotorista)
      .replace(/(?:\{\{placa\}\}|\[PLACA\])/gi, d.placa || '—')
      .replace(/(?:\{\{transportadora\}\}|\[TRANSPORTADORA\]|\[EMPRESA\])/gi, d.transportadora || '—')
      .replace(/\[HORA\]/gi, new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  };

  const openTemplate = (d) => {
    if (templates.length === 0) { setTemplateModal({ driver: d, templateId: null, text: null }); return; }
    
    // Prioritize 'contato' templates for the default selection, otherwise use the first available
    let defaultTemplate = templates.find(t => t.tag === 'contato') || templates[0];
    
    const text = applyTemplate(defaultTemplate.text, d);
    setTemplateModal({ driver: d, templateId: defaultTemplate.id, text });
  };

  const handleRangeSearch = async () => {
    if (!histFrom || !histTo) return;
    setRangeLoading(true);
    setRangeError(null);
    const { data, error } = await loadByRange(histFrom, histTo);
    setRangeHistory(data);
    if (error) setRangeError(error);
    setRangeLoading(false);
  };

  const displayHistory = histPeriod === 'intervalo' ? rangeHistory : histFiltered;
  const displayLoading = histPeriod === 'intervalo' ? rangeLoading : histLoading;
  const displayError   = histPeriod === 'intervalo' ? rangeError   : histError;

  const sheetAgeColor = sheetAgeMin === null ? null
    : sheetAgeMin < 30  ? 'var(--success-500, #22c55e)'
    : sheetAgeMin < 60  ? 'var(--warning-500)'
    : 'var(--danger-500)';

  const sheetAgeLabel = sheetAgeMin === null ? null
    : sheetAgeMin === 0 ? 'agora'
    : sheetAgeMin < 60  ? `${sheetAgeMin} min atrás`
    : `${Math.floor(sheetAgeMin / 60)}h${sheetAgeMin % 60 > 0 ? ` ${sheetAgeMin % 60}min` : ''} atrás`;

  const histIcon  = { intervencao: 'ti-headset', reportar: 'ti-building', descarte: 'ti-trash', limpeza: 'ti-trash' };
  const tipoLabel = { intervencao: 'Intervenção', reportar: 'Reportar', descarte: 'Descarte', limpeza: 'Limpeza' };
  const tipoBadge = { intervencao: 'danger', reportar: 'warning', descarte: 'info', limpeza: 'info' };
  const sevClass  = (d) => d.severidade === 'Gravíssimo' ? 'danger' : d.severidade === 'Grave' ? 'warning' : 'ok';

  const TiposBadge = ({ tipos }) =>
    tipos?.length > 0 ? <div className="d-tags">{tipos.map((t, i) => <span key={i} className="d-tag">{t}</span>)}</div> : null;

  return (
    <div className="monitor-grid">

      {/* Status bar */}
      <div className="status-bar" style={{ marginBottom: 12 }}>
        <div className={`dot ${statusKind === 'active' ? 'active' : statusKind === 'error' ? 'error' : ''}`}></div>
        <div className="status-text">{statusMsg}{loading && ' — a processar…'}</div>
        {sheetAgeMin !== null && (
          <span style={{
            display:'inline-flex', alignItems:'center', gap:4, fontSize:11,
            padding:'2px 10px', borderRadius:99, fontWeight:600, flexShrink:0,
            background: sheetAgeColor + '22', color: sheetAgeColor,
          }}>
            <i className="ti ti-clock" style={{ fontSize:10 }}></i>
            {sheetAgeLabel}
          </span>
        )}
        <button className="btn btn-sm btn-danger" onClick={clearQueue}><i className="ti ti-trash"></i> Limpar fila</button>
        <a href="https://www.sascar.com.br/" target="_blank" rel="noreferrer" className="btn btn-sm" style={{ textDecoration: 'none' }}>
          <i className="ti ti-external-link"></i> Abrir Sascar
        </a>
      </div>

      {/* Upload */}
      <label className="upload-area" style={{ cursor: 'pointer' }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
        onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
        onDrop={handleDrop}>
        <div className="upload-icon"><i className="ti ti-cloud-upload"></i></div>
        <div className="upload-text">
          <div className="upload-title">Solte aqui o relatório de detalhes de evento do Sascar</div>
          <div className="upload-hint">.xlsx · .xls · .csv &nbsp;·&nbsp; Falsos positivos removidos automaticamente</div>
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
      </label>

      {/* KPIs */}
      {loadStats && (
        <div className="stat-strip" style={{ marginTop: 12 }}>
          <div className="stat-box"><div className="stat-label">Placas carregadas</div><div className="stat-value">{loadStats.total}</div></div>
          <div className="stat-box"><div className="stat-label">Intervenção</div><div className="stat-value danger">{loadStats.comIntervencao}</div><div className="stat-sub">Bocejo · Olho fechado</div></div>
          <div className="stat-box"><div className="stat-label">Reportar</div><div className="stat-value warning">{loadStats.soReportar}</div><div className="stat-sub">Outros eventos</div></div>
          <div className="stat-box"><div className="stat-label">Só técnico</div><div className="stat-value">{loadStats.soTecnico}</div><div className="stat-sub">Obstrução / perda de vídeo</div></div>
          <div className="stat-box"><div className="stat-label">Falsos positivos</div><div className="stat-value" style={{ color: 'var(--text-muted)' }}>{loadStats.falsosPositivos}</div><div className="stat-sub">removidos</div></div>
        </div>
      )}

      {/* Config */}
      <div className="config-bar" style={{ marginTop: 12 }}>
        <div className="config-row">
          <div>
            <div className="config-text">Ocultar motoristas apenas com técnicos</div>
            <div className="config-hint">Esconde placas com apenas eventos técnicos (Obstrução de Câmera / Perda de vídeo). <em>Use com atenção</em></div>
          </div>
          <label className="toggle-wrap">
            <input type="checkbox" checked={excluirTecnicos} onChange={e => setExcluirTecnicos(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb"></span></span>
          </label>
        </div>
      </div>

      {/* Operador */}
      <div className="operator-bar">
        <label><i className="ti ti-user"></i> Operador:</label>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{profile?.nome}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile?.cargo} · {profile?.email}</span>
      </div>

      {/* Filtros fila */}
      <div className="filter-bar">
        <div className="filter-group"><label><i className="ti ti-filter"></i> Filtros:</label></div>
        <div className="filter-group">
          <label>Turno</label>
          <select value={filters.turno} onChange={e => setFilters({ ...filters, turno: e.target.value })}>
            <option value="">Ambos</option>
            <option value="diurno">Diurno (06–18h)</option>
            <option value="noturno">Noturno (18–06h)</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Severidade</label>
          <select value={filters.prioridade} onChange={e => setFilters({ ...filters, prioridade: e.target.value })}>
            <option value="">Todas</option>
            <option value="gravissimo">Gravíssimo</option>
            <option value="grave">Grave</option>
            <option value="normal">Normal</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Transportadora</label>
          <select value={filters.empresa} onChange={e => setFilters({ ...filters, empresa: e.target.value })}>
            <option value="">Todas</option>
            {transps.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Evento</label>
          <select value={filters.comportamento} onChange={e => setFilters({ ...filters, comportamento: e.target.value })}>
            <option value="">Todos</option>
            <optgroup label="— Intervenção —">
              <option value="Bocejo">Bocejo</option>
              <option value="Olho fechado">Olho fechado</option>
            </optgroup>
            <optgroup label="— Reportar —">
              <option value="Distração">Distração genérica</option>
              <option value="Uso de celular">Uso de celular</option>
              <option value="Fumando">Fumando</option>
            </optgroup>
          </select>
        </div>
        <button className="filter-reset" onClick={resetFilters}><i className="ti ti-x"></i> Limpar</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          ['intervencao', 'ti-phone-call',  'Intervenção',       intervencaoList.length, 'var(--danger-500)'],
          ['reportar',    'ti-building',    'Reportar à empresa', reportarList.length,    'var(--warning-500)'],
          ['tecnicos',    'ti-camera-off',  'Só técnico',        tecList.length,          null],
          ['historico',   'ti-history',     'Histórico',         histFiltered.length,     null],
        ].map(([id, icon, lbl, cnt, color]) => (
          <div key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
            <i className={`ti ${icon}`} style={color ? { color } : {}}></i> {lbl}
            <span className="tab-count">{cnt}</span>
          </div>
        ))}
      </div>

      {/* Tab: Intervenção */}
      {activeTab === 'intervencao' && (
        intervencaoList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum motorista requer intervenção" sub="Bocejo ou Olho fechado" />
          : <div className="driver-list">
              {intervencaoList.map(d => {
                const sev = sevClass(d);
                const isGravissimo = d.severidade === 'Gravíssimo';
                return (
                  <div className={`driver-item${isGravissimo ? ' is-gravissimo' : ''}`} key={d.placa}>
                    <div className={`d-avatar ${sev}`}>{iniciais(d.nome)}</div>
                    <div className="d-info">
                      <div className="d-name">
                        <span>{d.nome}</span>
                        <span className={`badge badge-${sev}`}>{d.alertas} {d.alertas === 1 ? 'evento' : 'eventos'}</span>
                        <span className={`badge badge-${sev}`} style={{ fontSize: 9.5 }}>{d.severidade}</span>
                        <ElapsedTimer since={d._loadedAt} />
                      </div>
                      <div className="d-detail">
                        <span><i className="ti ti-license"></i> {d.placa}</span>
                        <span className="sep">·</span>
                        <span><i className="ti ti-building"></i> {d.transportadora}</span>
                        <span className="sep">·</span>
                        <span><i className="ti ti-sun" style={{ color: d.turno === 'diurno' ? 'var(--warning-500)' : 'var(--accent-400)' }}></i> {d.turno === 'diurno' ? 'Diurno' : 'Noturno'}</span>
                      </div>
                      <TiposBadge tipos={d.tipos} />
                      {d.reportaveis > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>+ {d.reportaveis} evento(s) reportável(is): {d.tiposReportar.join(', ')}</div>}
                    </div>
                    <div className="d-actions">
                      <button className="btn btn-sm" onClick={() => openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
                      <button className="btn btn-sm btn-primary" onClick={() => attend(d)}><i className="ti ti-phone-call"></i> Inserir na planilha</button>
                      <button className="btn btn-sm btn-danger btn-icon-only" title="Descartar alerta" onClick={() => deleteAlert(d)}><i className="ti ti-trash"></i></button>
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {/* Tab: Reportar */}
      {activeTab === 'reportar' && (
        reportarList.length === 0
          ? <EmptyState icon="ti-building-off" msg="Nenhum evento para reportar" sub="Distração, Fumando, Uso de celular…" />
          : <div className="driver-list">
              {reportarList.map(d => {
                const sev = sevClass(d);
                return (
                  <div className="driver-item" key={d.placa}>
                    <div className={`d-avatar ${sev}`}>{iniciais(d.nome)}</div>
                    <div className="d-info">
                      <div className="d-name">
                        <span>{d.nome}</span>
                        <span className={`badge badge-${sev}`}>{d.reportaveis} {d.reportaveis === 1 ? 'evento' : 'eventos'}</span>
                      </div>
                      <div className="d-detail">
                        <span><i className="ti ti-license"></i> {d.placa}</span>
                        <span className="sep">·</span>
                        <span><i className="ti ti-building"></i> {d.transportadora}</span>
                        <span className="sep">·</span>
                        <span><i className="ti ti-sun" style={{ color: d.turno === 'diurno' ? 'var(--warning-500)' : 'var(--accent-400)' }}></i> {d.turno === 'diurno' ? 'Diurno' : 'Noturno'}</span>
                      </div>
                      <TiposBadge tipos={d.tiposReportar} />
                    </div>
                    <div className="d-actions">
                      <button className="btn btn-sm btn-primary" onClick={() => reportar(d)}><i className="ti ti-send"></i> Registrar</button>
                    </div>
                  </div>
                );
              })}
            </div>
      )}

      {/* Tab: Só técnico */}
      {activeTab === 'tecnicos' && (
        tecList.length === 0
          ? <EmptyState icon="ti-camera" msg="Nenhum alerta técnico" />
          : <div className="driver-list">
              {tecList.map(d => (
                <div className="driver-item" key={d.placa}>
                  <div className="d-avatar tech">{iniciais(d.nome)}</div>
                  <div className="d-info">
                    <div className="d-name">{d.nome}</div>
                    <div className="d-detail"><span>{d.placa} · {d.transportadora}</span><span className="sep">·</span><span>{d.tecnicos} {d.tecnicos === 1 ? 'evento técnico' : 'eventos técnicos'}</span></div>
                  </div>
                  <span className="badge badge-info">Técnico (câmera / vídeo)</span>
                </div>
              ))}
            </div>
      )}

      {/* Tab: Histórico */}
      {activeTab === 'historico' && (
        <div>
          {/* Filtros histórico */}
          <div className="filter-bar" style={{ marginBottom: 8 }}>
            <div className="filter-group">
              <label>Período</label>
              <select value={histPeriod} onChange={e => setHistPeriod(e.target.value)}>
                <option value="hoje">Hoje</option>
                <option value="semana">7 dias</option>
                <option value="mes">30 dias</option>
                <option value="todos">Todos</option>
                <option value="intervalo">Intervalo personalizado</option>
              </select>
            </div>
            {histPeriod === 'intervalo' && (
              <>
                <div className="filter-group">
                  <label>De</label>
                  <input
                    type="date"
                    value={histFrom}
                    onChange={e => setHistFrom(e.target.value)}
                    style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
                  />
                </div>
                <div className="filter-group">
                  <label>Até</label>
                  <input
                    type="date"
                    value={histTo}
                    onChange={e => setHistTo(e.target.value)}
                    style={{ padding:'4px 8px', fontSize:12, border:'1px solid var(--border-md)', borderRadius:'var(--radius-sm)', background:'var(--surface-0)', color:'var(--text-primary)' }}
                  />
                </div>
                <button className="btn btn-sm btn-primary" onClick={handleRangeSearch} disabled={!histFrom || !histTo}>
                  <i className="ti ti-search"></i> Buscar
                </button>
              </>
            )}
            <div className="filter-group">
              <label>Tipo</label>
              <select value={histTipo} onChange={e => setHistTipo(e.target.value)}>
                <option value="">Todos</option>
                <option value="intervencao">Intervenção</option>
                <option value="reportar">Reportar</option>
                <option value="descarte">Descarte</option>
                <option value="limpeza">Limpeza</option>
              </select>
            </div>
            <div className="filter-group" style={{ flex: 1 }}>
              <label>Busca</label>
              <input
                style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border-md)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-0)', color: 'var(--text-primary)', width: '100%' }}
                placeholder="Motorista, placa ou operador…"
                value={histSearch}
                onChange={e => setHistSearch(e.target.value)}
              />
            </div>
            <button className="btn btn-sm" onClick={() => exportCSV(displayHistory)}>
              <i className="ti ti-download"></i> Exportar CSV
            </button>
          </div>

          {displayLoading
            ? <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando histórico…</div>
            : displayError
              ? <div className="empty-state" style={{ color: 'var(--danger-500)' }}><i className="ti ti-alert-circle"></i> {displayError}</div>
              : displayHistory.length === 0
                ? <EmptyState icon="ti-history" msg="Nenhum registro encontrado" />
                : <div className="driver-list">
                    {displayHistory.map(item => (
                      <div className="history-item" key={item.id} style={{ opacity: item._pending ? 0.6 : 1 }}>
                        <div className="h-avatar"><i className={`ti ${histIcon[item.tipo] || 'ti-check'}`} style={{ fontSize: 13 }}></i></div>
                        <div className="h-info">
                          <div className="h-name">
                            {item.motorista}
                            {item.placa && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{item.placa}</span>}
                          </div>
                          <div className="h-meta">{item.operador} · {item.obs}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                          <div className="h-time">{new Date(item.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })} {item.hora}</div>
                          <span className={`badge badge-${tipoBadge[item.tipo] || 'info'}`} style={{ fontSize: 9.5 }}>{tipoLabel[item.tipo] || item.tipo}</span>
                        </div>
                      </div>
                    ))}
                  </div>
          }
        </div>
      )}

      {templateModal && createPortal(
        <div className="modal-overlay open" onClick={() => setTemplateModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="ti ti-message-2"></i>
                Template de contato — {(templateModal.driver.nome || '').split(' ')[0]}
              </div>
              <button className="btn-icon" onClick={() => setTemplateModal(null)}>
                <i className="ti ti-x"></i>
              </button>
            </div>
            {templates.length > 0 ? (
              <>
                <div className="form-group">
                  <label className="form-label">Selecionar Template</label>
                  <select 
                    className="form-control"
                    value={templateModal.templateId || ''}
                    onChange={e => {
                      const t = templates.find(x => x.id === e.target.value);
                      if (t) {
                        setTemplateModal(prev => ({ ...prev, templateId: t.id, text: applyTemplate(t.text, prev.driver) }));
                      }
                    }}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.title} ({t.tagLabel || t.tag || 'Sem categoria'})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Mensagem (Editável)</label>
                  <textarea
                    value={templateModal.text || ''}
                    onChange={e => setTemplateModal(prev => ({ ...prev, text: e.target.value }))}
                    className="form-control"
                    style={{ minHeight: 160 }}
                  />
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
                  <button className="btn" onClick={() => setTemplateModal(null)}>Fechar</button>
                  <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(templateModal.text); setTemplateModal(null); }}>
                    <i className="ti ti-copy"></i> Copiar e fechar
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <i className="ti ti-message-off"></i>
                Nenhum template de contato cadastrado.
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-ghost" style={{ textDecoration:'underline' }}
                    onClick={() => { setTemplateModal(null); setActivePanel('templates'); }}>
                    Criar um agora
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function EmptyState({ icon, msg, sub }) {
  return (
    <div className="empty-state">
      <i className={`ti ${icon}`}></i>{msg}
      {sub && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}
