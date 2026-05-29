// deno-lint-ignore-file
import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useTemplates } from '../hooks/useTemplates';
import { useConfirm } from '../hooks/useConfirm';
import { getPlatform, listPlatforms } from '../platforms';
import { applyHistoryFilter } from '../platforms/shared/history.js';

// Monitor Subcomponents
import { EmptyState, applyTemplate } from './monitor/utils';
import DriverCard from './monitor/DriverCard';
import MonitorFilters from './monitor/MonitorFilters';
import UploadArea from './monitor/UploadArea';
import MonitorModals from './monitor/MonitorModals';
import HistoryTab from './monitor/HistoryTab';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';
import { useSheetHistory } from '../hooks/useSheetHistory.js';
import { supabase, isSupabaseConfigured } from '../supabase.js';

const normStr = s =>
  String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();

const normalizeSev  = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizeText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Reconstrói os campos derivados de stats após filtro de histórico e postProcess.
function recomputeStats(rawStats, drivers, filtradosPorHistorico, autoDescartes) {
  return {
    ...rawStats,
    total:                 drivers.length,
    comIntervencao:        drivers.filter(d => d.alertas > 0).length,
    soReportar:            drivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
    soTecnico:             drivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
    filtradosPorHistorico,
    autoDescartes,
  };
}

/* ── Google Sheets via Supabase Table Insert (which triggers Edge Function) ── */
async function postToSheets(payload) {
  try {
    const { error } = await supabase
      .from('intervencoes_sheet')
      .insert({
        data:             payload.data,
        empresa:          payload.empresa,
        sistema:          payload.sistema,
        colaborador:      payload.colaborador,
        placa:            payload.placa,
        frota:            payload.frota,
        criticidade:      payload.criticidade,
        classificacao:    payload.classificacao,
        realizado:        'NÃO',
        motivo:           payload.motivo || 'FADIGA',
        solicitado_por:   payload.solicitadoPor,
        hora_solicitacao: payload.horaSolicitacao,
        status_sync:      'pendente',
        tentativas_sync:  0,
      });
    if (error) throw error;
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

export default function Monitor() {
  const navigate = useNavigate();
  const { tab: activeTab = 'intervencao' } = useParams();
  const [searchParams] = useSearchParams();

  const { drivers, replaceDrivers, updateDriver, bulkUpdateDrivers, clearDrivers, filters, setFilters, platformId, setPlatformId } = useApp();
  const { profile } = useAuth();
  const { history, loading: histLoading, error: histError, historyLoadedAt, registrar, reload: reloadHistory, loadByRange, loadDriverHistory, loadAtendimentosForFilter } = useAtendimentos();
  const { templates } = useTemplates();
  const confirm = useConfirm();

  const platform       = useMemo(() => getPlatform(platformId), [platformId]);
  const allPlatforms   = useMemo(() => listPlatforms({ includePlanned: true }), []);
  const { resolveAlias } = useCarrierAliases();
  const sheetHistory   = useSheetHistory();

  // Carrega dados do Sheets em background ao montar o Monitor
  useEffect(() => {
    if (!sheetHistory.loaded) {
      sheetHistory.load();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mapa de lookup: nome normalizado → entrada mais recente no Sheets
  const sheetsAttendedMap = useMemo(() => {
    const map = new Map();
    sheetHistory.rows.forEach(row => {
      if (!row.colaborador) return;
      const key = normStr(row.colaborador);
      if (!map.has(key)) map.set(key, row); // rows já ordenadas do mais recente
    });
    return map;
  }, [sheetHistory.rows]);

  const [templateModal, setTemplateModal] = useState(null);
  const [dossieDriver, setDossieDriver] = useState(null);
  const [dossieData, setDossieData] = useState([]);
  const [dossieLoading, setDossieLoading] = useState(false);
  const [discardModal, setDiscardModal] = useState(null);

  // Presets de filtro
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mn_filter_presets') || '[]'); } catch { return []; }
  });

  // Reincidência: motoristas atendidos (intervencao/reportar) nos últimos 30 dias.
  // nowMs via useState initializer para evitar Date.now() em render.
  const [nowMs] = useState(() => Date.now());
  const reincidenteMap = useMemo(() => {
    const cutoffISO = new Date(nowMs - 30 * 86400000).toISOString();
    const map = new Map(); // nome → { date: ISO string, daysSince: number }
    history.forEach(h => {
      if ((h.tipo === 'intervencao' || h.tipo === 'reportar') && h.created_at > cutoffISO) {
        const existing = map.get(h.motorista);
        if (!existing || h.created_at > existing.date) {
          map.set(h.motorista, {
            date: h.created_at,
            daysSince: Math.floor((nowMs - new Date(h.created_at).getTime()) / 86400000),
          });
        }
      }
    });
    return map;
  }, [history, nowMs]);

  useEffect(() => {
    if (!templateModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setTemplateModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateModal]);

  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => setCurrentPage(1), [activeTab]);
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

  const [historyAgeMin, setHistoryAgeMin] = useState(null);
  useEffect(() => {
    if (!historyLoadedAt) { setHistoryAgeMin(null); return; }
    const tick = () => setHistoryAgeMin(Math.floor((Date.now() - new Date(historyLoadedAt)) / 60000));
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [historyLoadedAt]);

  const [autoRefresh, setAutoRefresh] = useState(() => localStorage.getItem('mn_auto_refresh') === 'true');
  const [autoRefreshMin, setAutoRefreshMin] = useState(() => parseInt(localStorage.getItem('mn_auto_refresh_min') || '5'));

  const [rpaLastRunAt,     setRpaLastRunAt]     = useState(null);
  const [rpaLastRunStatus, setRpaLastRunStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase.from('app_settings').select('value').eq('key', 'rpa_config').maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.value) return;
        setRpaLastRunAt(data.value.last_run_at || null);
        setRpaLastRunStatus(data.value.last_run_status || null);
      });
    const ch = supabase.channel('rpa_config_monitor-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'app_settings', filter: 'key=eq.rpa_config' }, (p) => {
        setRpaLastRunAt(p.new?.value?.last_run_at || null);
        setRpaLastRunStatus(p.new?.value?.last_run_status || null);
      })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  // Ref sempre atualizado com a versão mais recente de handleScrape (evita closure stale no setInterval)
  const handleScrapeRef = useRef(null);

  useEffect(() => {
    if (!autoRefresh || !platform?.scraper?.pull) return;
    const id = setInterval(() => { if (!loading) handleScrapeRef.current?.(); }, autoRefreshMin * 60 * 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, autoRefreshMin, platform?.id]);

  /* ── Filtros fila ── */
  const buscaNorm = useMemo(() => normalizeText(filters.busca).trim(), [filters.busca]);
  const filtered = useMemo(() => drivers.filter(d => {
    if (filters.turno && d.turno !== filters.turno) return false;
    if (filters.empresa && d.transportadora !== filters.empresa) return false;
    if (filters.comportamento) {
      const todos = [...(d.tipos || []), ...(d.tiposReportar || [])];
      if (!todos.some(t => t.includes(filters.comportamento))) return false;
    }
    if (filters.prioridade && normalizeSev(d.severidade) !== filters.prioridade) return false;
    if (buscaNorm && !normalizeText(d.placa).includes(buscaNorm) && !normalizeText(d.nome).includes(buscaNorm)) return false;
    return true;
  }), [drivers, filters.turno, filters.empresa, filters.comportamento, filters.prioridade, buscaNorm]);

  const intervencaoList = useMemo(() => filtered.filter(d => d.alertas > 0).sort((a, b) => b.alertas - a.alertas), [filtered]);
  const reportarList    = useMemo(() => filtered.filter(d => d.alertas === 0 && d.reportaveis > 0).sort((a, b) => b.reportaveis - a.reportaveis), [filtered]);
  const tecList         = useMemo(() => filtered.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0), [filtered]);
  const transps         = useMemo(() => [...new Set(drivers.map(d => d.transportadora))].sort(), [drivers]);

  /* ── Upload ── */
  const hashFile = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { return null; }
  };

  const handleFile = async (file) => {
    setLoading(true); setStatusKind('idle'); setStatusMsg(`Processando ${file.name}…`);
    try {
      if (!platform.spreadsheet?.parse) {
        throw new Error(`Plataforma "${platform.name}" não suporta upload de planilha.`);
      }
      const hash = await hashFile(file);
      if (hash) {
        let recent = [];
        try { recent = JSON.parse(localStorage.getItem('mn_sheet_hashes') || '[]'); } catch {}
        const dup = recent.find(r => r.hash === hash);
        if (dup) {
          const when = new Date(dup.at).toLocaleString('pt-BR');
          const ok = await confirm({
            title: 'Planilha já carregada',
            message: `Esta planilha (${dup.name}) já foi processada em ${when}. Deseja carregar novamente?`,
          });
          if (!ok) {
            setLoading(false);
            setStatusKind('idle');
            setStatusMsg('Upload cancelado: planilha duplicada.');
            return;
          }
        }
        const updated = [{ hash, name: file.name, at: new Date().toISOString() }, ...recent.filter(r => r.hash !== hash)].slice(0, 10);
        try { localStorage.setItem('mn_sheet_hashes', JSON.stringify(updated)); } catch {}
      }
      const filterHistory = await loadAtendimentosForFilter(90);
      const { drivers: rawDrivers, stats: rawStats, rawEventRows } = await platform.spreadsheet.parse(file);
      const { drivers: histFiltered, filtradosPorHistorico } = applyHistoryFilter(rawDrivers, filterHistory);
      const postProcessed = platform.postProcess?.(histFiltered);
      const newDrivers    = postProcessed?.drivers    ?? histFiltered;
      const autoDescartes = postProcessed?.autoDescartes ?? [];
      const stats = recomputeStats(rawStats, newDrivers, filtradosPorHistorico, autoDescartes);
      const loadedAt = new Date().toISOString();
      const timestamped = newDrivers.map(d => ({ ...d, _loadedAt: loadedAt, _platformId: platform.id }));
      const existingPlacas = new Set(drivers.map(d => d.placa));
      const newPlacas = new Set(timestamped.map(d => d.placa));
      const novas = timestamped.filter(d => !existingPlacas.has(d.placa)).length;
      const atualizadas = timestamped.length - novas;
      const merged = [...drivers.filter(d => !newPlacas.has(d.placa)), ...timestamped];

      // Persiste eventos brutos na tabela de histórico permanente
      if (rawEventRows && rawEventRows.length > 0) {
        const validEvents = rawEventRows.filter(r => r.ocorrido_em);
        if (validEvents.length > 0) {
          const { error: evInsertErr } = await supabase
            .from('driver_events')
            .upsert(validEvents, { onConflict: 'platform_id,placa,ocorrido_em,nome_evento', ignoreDuplicates: true });
          if (evInsertErr) console.warn('[Monitor] Erro ao persistir driver_events:', evInsertErr.message);
        }
      }

      replaceDrivers(timestamped, platform.id);
      localStorage.setItem('mn_sheet_loaded_at', loadedAt);
      const platRawData = {
        total: stats.totalFechados || 0,
        platform: platform.id,
        date: new Date(loadedAt).toDateString(),
      };
      localStorage.setItem('mn_plat_raw_total', JSON.stringify(platRawData));
      if (isSupabaseConfigured) {
        supabase
          .from('app_settings')
          .upsert({
            key: 'plat_raw_total',
            value: platRawData,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' })
          .then(({ error }) => {
            if (error) console.warn('[Monitor] Erro ao sincronizar plat_raw_total:', error.message);
          });
      }
      setSheetLoadedAt(loadedAt);
      setSheetAgeMin(0);
      setLoadStats({ ...stats, totalNaFila: merged.length, novas, atualizadas });
      setStatusKind('active');
      const filtroMsg     = stats.filtradosPorHistorico > 0 ? ` · ${stats.filtradosPorHistorico} eventos pré-atendimento ignorados` : '';
      const velocidadeMsg = stats.filtradosPorVelocidade > 0 ? ` · ${stats.filtradosPorVelocidade} eventos abaixo de 10 km/h ignorados` : '';
      const autoDesc      = stats.autoDescartes || [];
      const autoDescMsg   = autoDesc.length > 0 ? ` · ${autoDesc.reduce((s, x) => s + x.count, 0)} evento(s) auto-descartados` : '';
      const mergeMsg      = existingPlacas.size > 0 ? ` · ${novas} nova(s) · ${atualizadas} atualizada(s) · ${merged.length} na fila` : '';
      setStatusMsg(`${file.name} · ${stats.comIntervencao} para intervenção · ${stats.soReportar} para reportar · ${stats.falsosPositivos} falsos positivos removidos${velocidadeMsg}${filtroMsg}${autoDescMsg}${mergeMsg}`);
      navigate('/monitor/intervencao', { replace: true });
      notificarCriticos(merged.filter(d => d.alertas >= 5));

      // Auto-register platform-specific discards silently in the background
      for (const item of autoDesc) {
        registrar({
          motorista: item.nome,
          placa: item.placa,
          transportadora: item.transportadora,
          tipo: 'descarte',
          obs: `Auto-descarte · ${item.motivo || platform.name} · ${item.count} evento(s)`,
        }).catch(console.warn);
      }
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

  /* ── Scraper (Maxtrack e futuras plataformas com modo 'scraper') ── */
  const handleScrape = async () => {
    if (!platform.scraper?.pull) return;
    setLoading(true); setStatusKind('idle'); setStatusMsg(`Buscando eventos em ${platform.name}…`);
    try {
      const filterHistory = await loadAtendimentosForFilter(90);
      const { drivers: rawDrivers, stats: rawStats, rawEventRows } = await platform.scraper.pull();
      const { drivers: histFiltered, filtradosPorHistorico } = applyHistoryFilter(rawDrivers, filterHistory);
      const postProcessed = platform.postProcess?.(histFiltered);
      const newDrivers    = postProcessed?.drivers    ?? histFiltered;
      const autoDescartes = postProcessed?.autoDescartes ?? [];
      const stats = recomputeStats(rawStats, newDrivers, filtradosPorHistorico, autoDescartes);
      const loadedAt = new Date().toISOString();
      const timestamped = newDrivers.map(d => ({ ...d, _loadedAt: loadedAt, _platformId: platform.id }));
      const existingPlacas = new Set(drivers.map(d => d.placa));
      const newPlacas = new Set(timestamped.map(d => d.placa));
      const novas = timestamped.filter(d => !existingPlacas.has(d.placa)).length;
      const atualizadas = timestamped.length - novas;
      const merged = [...drivers.filter(d => !newPlacas.has(d.placa)), ...timestamped];

      // Persiste eventos brutos na tabela de histórico permanente
      if (rawEventRows && rawEventRows.length > 0) {
        const validEvents = rawEventRows.filter(r => r.ocorrido_em);
        if (validEvents.length > 0) {
          const { error: evInsertErr } = await supabase
            .from('driver_events')
            .upsert(validEvents, { onConflict: 'platform_id,placa,ocorrido_em,nome_evento', ignoreDuplicates: true });
          if (evInsertErr) console.warn('[Monitor] Erro ao persistir driver_events:', evInsertErr.message);
        }
      }

      replaceDrivers(timestamped, platform.id);
      localStorage.setItem('mn_sheet_loaded_at', loadedAt);
      const platRawData = {
        total: stats.totalFechados || 0,
        platform: platform.id,
        date: new Date(loadedAt).toDateString(),
      };
      localStorage.setItem('mn_plat_raw_total', JSON.stringify(platRawData));
      if (isSupabaseConfigured) {
        supabase
          .from('app_settings')
          .upsert({
            key: 'plat_raw_total',
            value: platRawData,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'key' })
          .then(({ error }) => {
            if (error) console.warn('[Monitor] Erro ao sincronizar plat_raw_total:', error.message);
          });
      }
      setSheetLoadedAt(loadedAt);
      setSheetAgeMin(0);
      setLoadStats({ ...stats, totalNaFila: merged.length, novas, atualizadas });
      setStatusKind('active');
      const filtroMsg     = stats.filtradosPorHistorico > 0 ? ` · ${stats.filtradosPorHistorico} eventos pré-atendimento ignorados` : '';
      const velocidadeMsg = stats.filtradosPorVelocidade > 0 ? ` · ${stats.filtradosPorVelocidade} eventos abaixo de 10 km/h ignorados` : '';
      const autoDescMsg   = (stats.autoDescartes || []).length > 0 ? ` · ${stats.autoDescartes.reduce((s, x) => s + x.count, 0)} auto-descartado(s)` : '';
      const mergeMsg      = existingPlacas.size > 0 ? ` · ${novas} nova(s) · ${atualizadas} atualizada(s) · ${merged.length} na fila` : '';
      setStatusMsg(`${platform.name} · ${stats.comIntervencao} para intervenção · ${stats.soReportar} para reportar${velocidadeMsg}${filtroMsg}${autoDescMsg}${mergeMsg}`);
      navigate('/monitor/intervencao', { replace: true });
      notificarCriticos(merged.filter(d => d.alertas >= 5));
      for (const item of (stats.autoDescartes || [])) {
        registrar({
          motorista: item.nome, placa: item.placa, transportadora: item.transportadora,
          tipo: 'descarte',
          obs: `Auto-descarte · ${item.motivo || platform.name} · ${item.count} evento(s)`,
        }).catch(console.warn);
      }
    } catch (err) {
      setStatusKind('error');
      if (err.code === 'TOKEN_EXPIRED') {
        setStatusMsg(`Token Sascar expirado. Clique no Favorito Sascar no portal para renovar e tente novamente.`);
      } else if (err.code === 'NO_TOKEN') {
        setStatusMsg(`Token Sascar não configurado. Acesse Meu Perfil → Integrações → Sascar.`);
        navigate('/perfil');
      } else {
        setStatusMsg(`Erro ao buscar ${platform.name}: ${err.message}`);
      }
    } finally { setLoading(false); }
  };

  /* ── Ações ── */
  const attend = async (d) => {
    if (!(await confirm({ title: 'Iniciar contato', message: `Iniciar contato com ${d.nome}?` }))) return;
    const obs = `${d.alertas} evento(s) de intervenção (${d.tipos.join(', ') || '—'})`;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'intervencao', obs });
    updateDriver(d.placa, { alertas: 0, tipos: [] });
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const data = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    const sev = d.severidade || 'Normal';
    const criticidade = sev === 'Gravíssimo' ? 'GRAVÍSSIMO' : sev === 'Grave' ? 'GRAVE' : 'MÉDIO';
    const classificacao = (sev === 'Gravíssimo' || sev === 'Grave') ? 'IMEDIATA' : 'PREVENTIVA';
    postToSheets({
      data,
      empresa:         resolveAlias(d.transportadora || ''),
      sistema:         platform.sistema,
      colaborador:     d.nome,
      placa:           d.placa || '',
      frota:           d.frota || '',
      criticidade,
      classificacao,
      motivo:          'FADIGA',
      solicitadoPor:   (profile?.nome || '').split(' ')[0],
      horaSolicitacao: hora,
    });
  };

  const reportar = async (d) => {
    if (!(await confirm({ title: 'Registrar notificação', message: `Registrar notificação para a empresa: ${d.nome}?` }))) return;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'reportar', obs: `Reportado à transportadora · ${d.reportaveis} evento(s) (${d.tiposReportar.join(', ') || '—'})` });
    updateDriver(d.placa, { reportaveis: 0, tiposReportar: [] });
  };

  const deleteAlert = (d, tipo = 'intervencao') => {
    setDiscardModal({ driver: d, tipo });
  };

  const performDiscard = async (d, tipo, reason) => {
    setDiscardModal(null);
    const isIntervencao = tipo === 'intervencao';
    const isReportar = tipo === 'reportar';
    const isTecnico = tipo === 'tecnico';
    const countStr = isIntervencao ? `${d.alertas} evento(s)`
                   : isReportar   ? `${d.reportaveis} evento(s) reportáveis`
                   :                `${d.tecnicos} evento(s) técnicos`;
    await registrar({
      motorista: d.nome, placa: d.placa, transportadora: d.transportadora,
      tipo: 'descarte',
      obs: `Alerta descartado · ${countStr} · Motivo: ${reason}`,
    });
    const patch = {};
    if (isIntervencao) { patch.alertas = 0; patch.tipos = []; }
    if (isReportar)    { patch.reportaveis = 0; patch.tiposReportar = []; }
    if (isTecnico)     { patch.tecnicos = 0; }
    updateDriver(d.placa, patch);
  };

  const bulkDiscard = async () => {
    const tab = activeTab;
    if (!['intervencao', 'reportar', 'tecnicos'].includes(tab)) return;
    const list = tab === 'intervencao' ? intervencaoList : tab === 'reportar' ? reportarList : tecList;
    if (list.length === 0) return;
    const tabLabel = tab === 'intervencao' ? 'intervenção' : tab === 'reportar' ? 'reportar' : 'técnico';
    if (!(await confirm({
      title: `Descartar todos os alertas de ${tabLabel}`,
      message: `Descartar ${list.length} alerta(s) de ${tabLabel} visíveis na fila atual? Cada motorista terá um atendimento "descarte" registrado.`,
      danger: true,
    }))) return;

    setLoading(true);
    setStatusMsg(`Descartando ${list.length} alerta(s) de ${tabLabel}…`);

    const obsFor = (d) => tab === 'intervencao' ? `Descarte em massa · ${d.alertas} evento(s)`
                       : tab === 'reportar'    ? `Descarte em massa · ${d.reportaveis} evento(s) reportáveis`
                       :                         `Descarte em massa · ${d.tecnicos} evento(s) técnicos`;

    const results = await Promise.allSettled(list.map(d => registrar({
      motorista: d.nome, placa: d.placa, transportadora: d.transportadora,
      tipo: 'descarte', obs: obsFor(d),
    })));
    const ok = results.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
    const fail = list.length - ok;

    const placasDescartadas = [...new Set(list.map(d => d.placa))];
    const bulkPatch = {};
    if (tab === 'intervencao') { bulkPatch.alertas = 0; bulkPatch.tipos = []; }
    if (tab === 'reportar')    { bulkPatch.reportaveis = 0; bulkPatch.tiposReportar = []; }
    if (tab === 'tecnicos')    { bulkPatch.tecnicos = 0; }
    bulkUpdateDrivers(placasDescartadas, bulkPatch);

    setLoading(false);
    setStatusKind(fail > 0 ? 'error' : 'active');
    setStatusMsg(`Descarte em massa: ${ok} ok${fail > 0 ? ` · ${fail} falha(s)` : ''}`);
  };

  const clearQueue = async () => {
    if (!(await confirm({ title: 'Limpar fila', message: 'Tem certeza que deseja limpar toda a fila de motoristas?', danger: true }))) return;
    clearDrivers();
    setLoadStats(null);
    setStatusKind('idle');
    setStatusMsg('Fila limpa. Aguardando nova planilha.');
    localStorage.removeItem('mn_sheet_loaded_at');
    setSheetLoadedAt(null);
    setSheetAgeMin(null);
  };

  const resetFilters = () => setFilters({ empresa: '', comportamento: '', turno: '', prioridade: '', busca: '' });

  const savePreset = (name) => {
    const preset = { id: crypto.randomUUID(), name, filters: { ...filters } };
    const next = [preset, ...presets].slice(0, 5);
    setPresets(next);
    try { localStorage.setItem('mn_filter_presets', JSON.stringify(next)); } catch {}
  };

  const loadPreset = (preset) => setFilters({ ...preset.filters });

  const deletePreset = (id) => {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    try { localStorage.setItem('mn_filter_presets', JSON.stringify(next)); } catch {}
  };

  const exportActiveTab = () => {
    const list = activeTab === 'intervencao' ? intervencaoList
               : activeTab === 'reportar'    ? reportarList
               : activeTab === 'tecnicos'    ? tecList : [];
    if (list.length === 0) return;

    // Ponto e vírgula como separador para abrir corretamente no Excel/LibreOffice
    // com locale pt-BR (onde a vírgula é separador decimal).
    const SEP = ';';
    const esc = v => { const s = String(v ?? ''); return `"${s.replace(/"/g, '""')}"`; };

    const fmtDate = (d) => {
      if (!d) return '';
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return '';
      return dt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    const bucketAtivo = activeTab === 'intervencao' ? 'intervencao'
                      : activeTab === 'reportar'    ? 'reportar'
                      : 'tecnico';

    // Se qualquer driver tiver eventosDetalhados, exporta uma linha por evento.
    // Caso contrário (plataforma sem suporte) cai no resumo por motorista.
    const temDetalhados = list.some(d => d.eventosDetalhados?.length > 0);

    let header, rows;
    if (temDetalhados) {
      header = ['Nome', 'Placa', 'Transportadora', 'Turno', 'Severidade do Motorista', 'Tipo de Evento', 'Categoria', 'Severidade do Evento', 'Data/Hora'];
      rows = list.flatMap(d => {
        const eventos = (d.eventosDetalhados || []).filter(e => e.bucket === bucketAtivo);
        if (eventos.length === 0) return [];
        return eventos
          .slice()
          .sort((a, b) => (a.ts ? new Date(a.ts) : 0) - (b.ts ? new Date(b.ts) : 0))
          .map(e => [
            d.nome, d.placa, d.transportadora, d.turno, d.severidade,
            e.tipo, e.bucket, e.severidade, fmtDate(e.ts),
          ].map(esc).join(SEP));
      });
    } else {
      header = ['Nome', 'Placa', 'Transportadora', 'Turno', 'Severidade', 'Qtd. Eventos', 'Tipos de Evento', 'Último Evento'];
      rows = list.map(d => {
        const count = activeTab === 'intervencao' ? d.alertas : activeTab === 'reportar' ? d.reportaveis : d.tecnicos;
        const tipos = activeTab === 'intervencao' ? (d.tipos?.join(', ') || '')
                    : activeTab === 'reportar'    ? (d.tiposReportar?.join(', ') || '')
                    : Object.entries(d.tiposTecnico || {}).map(([t, n]) => `${t} (${n})`).join(', ');
        const ultimoEvt = activeTab === 'intervencao' ? fmtDate(d.ultimoEvento)
                        : activeTab === 'reportar'    ? fmtDate(d.ultimoEventoReportar)
                        : '';
        return [d.nome, d.placa, d.transportadora, d.turno, d.severidade, count, tipos, ultimoEvt].map(esc).join(SEP);
      });
    }

    const csv = [header.map(esc).join(SEP), ...rows].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `monitor-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openDossie = async (nome) => {
    setDossieDriver(nome);
    setDossieLoading(true);
    const { data } = await loadDriverHistory(nome);
    setDossieData(data || []);
    setDossieLoading(false);
  };

  const openTemplate = (d) => {
    if (templates.length === 0) { setTemplateModal({ driver: d, templateId: null, text: null }); return; }
    let defaultTemplate = templates.find(t => t.tag === 'contato') || templates[0];
    const text = applyTemplate(defaultTemplate.text, d);
    setTemplateModal({ driver: d, templateId: defaultTemplate.id, text });
  };

  // Mantém ref sincronizado com a versão atual de handleScrape
  useEffect(() => { handleScrapeRef.current = handleScrape; });

  const handlers = useMemo(
    () => ({ openDossie, openTemplate, attend, deleteAlert, reportar }),
    [openDossie, openTemplate, attend, deleteAlert, reportar],
  );

  const sheetAgeColor = sheetAgeMin === null ? null
    : sheetAgeMin < 30  ? 'var(--success-500, #22c55e)'
    : sheetAgeMin < 60  ? 'var(--warning-500)'
    : 'var(--danger-500)';

  const sheetAgeLabel = sheetAgeMin === null ? null
    : sheetAgeMin === 0 ? 'agora'
    : sheetAgeMin < 60  ? `${sheetAgeMin} min atrás`
    : `${Math.floor(sheetAgeMin / 60)}h${sheetAgeMin % 60 > 0 ? ` ${sheetAgeMin % 60}min` : ''} atrás`;

  // Pagination fila
  const pageSize = 10;
  const activeList = activeTab === 'intervencao' ? intervencaoList :
                     activeTab === 'reportar'    ? reportarList :
                     activeTab === 'tecnicos'    ? tecList : [];
                     
  const totalPages = activeTab !== 'historico' ? Math.ceil(activeList.length / pageSize) || 1 : 1;
  const paginate = (list) => list.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="monitor-grid">

      <UploadArea
        statusKind={statusKind} statusMsg={statusMsg} loading={loading}
        sheetAgeMin={sheetAgeMin} sheetAgeColor={sheetAgeColor} sheetAgeLabel={sheetAgeLabel}
        clearQueue={clearQueue} handleDrop={handleDrop} handleFile={handleFile} handleScrape={handleScrape} loadStats={loadStats}
        hasSascarToken={!!profile?.sascar_token} sascarTokenSavedAt={profile?.sascar_token_saved_at || null}
        onNavigateToPerfil={() => navigate('/perfil')}
        platform={platform} platforms={allPlatforms} onPlatformChange={setPlatformId}
        historyAgeMin={historyAgeMin} reloadHistory={reloadHistory} histLoading={histLoading}
        autoRefresh={autoRefresh} autoRefreshMin={autoRefreshMin}
        onAutoRefreshChange={(v) => { setAutoRefresh(v); localStorage.setItem('mn_auto_refresh', String(v)); }}
        onAutoRefreshMinChange={(v) => { setAutoRefreshMin(v); localStorage.setItem('mn_auto_refresh_min', String(v)); }}
        rpaLastRunAt={rpaLastRunAt} rpaLastRunStatus={rpaLastRunStatus}
      />

      <MonitorFilters
        profile={profile} filters={filters} setFilters={setFilters}
        transps={transps} resetFilters={resetFilters}
        platform={platform}
        presets={presets} onSavePreset={savePreset} onLoadPreset={loadPreset} onDeletePreset={deletePreset}
      />

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', alignItems: 'center' }}>
        {[
          ['intervencao', 'ti-phone-call',  'Intervenção',       intervencaoList.length, 'var(--danger-500)'],
          ['reportar',    'ti-building',    'Reportar à empresa', reportarList.length,    'var(--warning-500)'],
          ['tecnicos',    'ti-camera-off',  'Só técnico',        tecList.length,          null],
          ['historico',   'ti-history',     'Histórico',         history.length,     null],
        ].map(([id, icon, lbl, cnt, color]) => (
          <div key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => navigate('/monitor/' + id)}>
            <i className={`ti ${icon}`} style={color ? { color } : {}}></i> {lbl}
            <span className="tab-count">{cnt}</span>
          </div>
        ))}
        {activeTab !== 'historico' && activeList.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={exportActiveTab}
              title="Exportar aba atual como CSV"
            >
              <i className="ti ti-download"></i> Exportar
            </button>
            <button
              className="btn btn-sm"
              onClick={bulkDiscard}
              disabled={loading}
              title={`Descartar todos os ${activeList.length} alerta(s) visíveis na aba`}
            >
              <i className="ti ti-trash-x"></i> Descartar todos ({activeList.length})
            </button>
          </div>
        )}
      </div>

      {/* Tab: Intervenção */}
      {activeTab === 'intervencao' && (
        intervencaoList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum motorista requer intervenção" sub="Bocejo ou Olho fechado" />
          : <div className="driver-list">
              {paginate(intervencaoList).reduce((acc, d, i, arr) => {
                if (i > 0 && arr[i - 1].alertas >= 5 && d.alertas < 5) {
                  acc.push(
                    <div key="divider-below-5" className="driver-list-divider">
                      <i className="ti ti-arrow-down"></i>
                      <span>Abaixo de 5 eventos</span>
                    </div>
                  );
                }
                acc.push(<DriverCard key={d.placa} d={d} type="intervencao" handlers={handlers} daysSince={reincidenteMap.get(d.nome)?.daysSince} sheetsEntry={sheetsAttendedMap.get(normStr(d.nome))} />);
                return acc;
              }, [])}
            </div>
      )}

      {/* Tab: Reportar */}
      {activeTab === 'reportar' && (
        reportarList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum motorista para reportar" sub="Distração, uso de celular" />
          : <div className="driver-list">
              {paginate(reportarList).map(d => (
                <DriverCard key={d.placa} d={d} type="reportar" handlers={handlers} daysSince={reincidenteMap.get(d.nome)?.daysSince} sheetsEntry={sheetsAttendedMap.get(normStr(d.nome))} />
              ))}
            </div>
      )}

      {/* Tab: Só técnico */}
      {activeTab === 'tecnicos' && (
        tecList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum evento técnico isolado" />
          : <div className="driver-list">
              {paginate(tecList).map(d => (
                <DriverCard key={d.placa} d={d} type="tecnicos" handlers={handlers} sheetsEntry={sheetsAttendedMap.get(normStr(d.nome))} />
              ))}
            </div>
      )}

      {/* Tab: Histórico */}
      {activeTab === 'historico' && (
        <HistoryTab
          history={history} histLoading={histLoading} histError={histError}
          loadByRange={loadByRange}
          currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize}
          initialSearch={searchParams.get('placa') || ''}
        />
      )}

      {/* Queue Pagination */}
      {activeTab !== 'historico' && totalPages > 1 && (
        <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <i className="ti ti-chevron-left"></i>
          </button>
          <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--text-muted)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <i className="ti ti-chevron-right"></i>
          </button>
        </div>
      )}

      <MonitorModals
        templateModal={templateModal} setTemplateModal={setTemplateModal}
        templates={templates} applyTemplate={applyTemplate} onNavigateToTemplates={() => navigate('/templates')}
        dossieDriver={dossieDriver} setDossieDriver={setDossieDriver}
        dossieLoading={dossieLoading} dossieData={dossieData}
        discardModal={discardModal} setDiscardModal={setDiscardModal} onDiscardConfirm={performDiscard}
      />

    </div>
  );
}
