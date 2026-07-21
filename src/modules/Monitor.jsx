// deno-lint-ignore-file
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useTemplates } from '../hooks/useTemplates';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast';
import { getPlatform } from '../platforms';

// Monitor Subcomponents
import { DriverListSkeleton, applyTemplate } from './monitor/utils';
import EmptyState from '../components/EmptyState';
import DriverCard from './monitor/DriverCard';
import MonitorFilters from './monitor/MonitorFilters';
import UploadArea from './monitor/UploadArea';
import MonitorModals from './monitor/MonitorModals';
import HistoryTab from './monitor/HistoryTab';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';
import { useSheetHistory } from '../hooks/useSheetHistory.js';
import { supabase } from '../supabase.js';
import { detect, parseCSV, readHeaders, buildImportRows } from '../utils/fatigueParser.js';
import { apiFetch } from '../lib/analyticsApi.js';

const normStr = s =>
  String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();

const normalizeSev  = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const normalizeText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function getOrCreatePlatformAdapter(platformId) {
  try {
    return getPlatform(platformId);
  } catch {
    return {
      id: platformId,
      name: platformId ? platformId.toUpperCase() : 'Desconhecido',
      sistema: platformId ? platformId.toUpperCase() : 'SASCAR',
      rules: { slaLimitMin: 30, criticalAlertsCount: 5, minMovingSpeedKmh: 10 },
      taxonomy: {
        intervencao: ['Fadiga', 'Distração', 'Bocejo', 'Olho Fechado'],
        tecnico: ['Câmera Obstruída', 'Falha Técnico', 'Perda de Vídeo'],
      }
    };
  }
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



export default function Monitor() {
  const navigate = useNavigate();
  const { tab: activeTab = 'intervencao' } = useParams();
  const [searchParams] = useSearchParams();

  const { drivers, driversLoading, reloadDrivers, filters, setFilters, lastImportedAt } = useApp();
  const { profile } = useAuth();
  const {
    history,
    loading: histLoading,
    error: histError,
    historyLoadedAt,
    registrar,
    loadByRange,
    loadDriverHistory,
  } = useAtendimentos();
  const { templates } = useTemplates();
  const confirm = useConfirm();
  const toast = useToast();

  const { resolveAlias } = useCarrierAliases();
  const sheetHistory   = useSheetHistory();

  // Estado dos cards expansíveis
  const [expandedPlacas, setExpandedPlacas] = useState(new Set());

  const handleToggleExpand = (placa) => {
    setExpandedPlacas(prev => {
      const next = new Set(prev);
      if (next.has(placa)) next.delete(placa);
      else next.add(placa);
      return next;
    });
  };

  const handleExpandAll = (list) => {
    setExpandedPlacas(new Set(list.map(d => d._driverKey || d.placa)));
  };

  const handleCollapseAll = () => {
    setExpandedPlacas(new Set());
  };

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
  const [prevTab, setPrevTab] = useState(activeTab);
  if (activeTab !== prevTab) {
    setPrevTab(activeTab);
    setCurrentPage(1);
  }

  const [statusMsg,  setStatusMsg]  = useState('Aguardando carga de eventos ou planilha.');
  const [statusKind, setStatusKind] = useState('idle');
  const [loadStats,  setLoadStats]  = useState(null);
  const [loading,    setLoading]    = useState(false);

  const [prevDriversLength, setPrevDriversLength] = useState(drivers.length);
  const [prevDriversLoading, setPrevDriversLoading] = useState(driversLoading);

  if (drivers.length !== prevDriversLength || driversLoading !== prevDriversLoading) {
    setPrevDriversLength(drivers.length);
    setPrevDriversLoading(driversLoading);
    if (driversLoading) {
      setStatusKind('idle');
      setStatusMsg('Carregando fila de motoristas...');
    } else if (drivers.length > 0) {
      setStatusKind('active');
      setStatusMsg(`${drivers.length} motorista(s) na fila do monitor.`);
    } else {
      setStatusKind('idle');
      setStatusMsg('Fila limpa. Aguardando novos eventos ou planilha.');
    }
  }

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const sheetAgeMin = lastImportedAt
    ? Math.floor((currentTime - new Date(lastImportedAt)) / 60000)
    : null;

  const historyAgeMin = historyLoadedAt
    ? Math.floor((currentTime - new Date(historyLoadedAt)) / 60000)
    : null;


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
  const comportamentos  = useMemo(() => {
    return [...new Set(drivers.flatMap(d => [
      ...(d.tipos || []),
      ...(d.tiposReportar || []),
      ...Object.keys(d.tiposTecnico || {})
    ]))].sort();
  }, [drivers]);

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
      const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error(`Falha ao ler o arquivo: ${file.name}`));
        if (isCsv) reader.readAsText(file, 'UTF-8');
        else reader.readAsArrayBuffer(file);
      });

      let aoa;
      if (isCsv) {
        aoa = parseCSV(fileData);
      } else {
        const XLSX = await import('xlsx');
        const data = new Uint8Array(fileData);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      }

      const { headers, dataRows } = readHeaders(aoa);
      if (!headers.length || !dataRows.length) {
        throw new Error('Não foi possível identificar o cabeçalho ou as linhas de dados.');
      }

      const detection = detect(headers, 'auto', file.name);
      const detectedPlatId = detection.platform;
      
      let rawEventRows = [];
      
      let operatorEmail = 'hevilyntfzero@gmail.com';
      try {
        const { data: configData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'omnilink_config')
          .maybeSingle();
        if (configData?.value?.operator_email) {
          operatorEmail = configData.value.operator_email;
        }
      } catch (err) {
        console.warn('[Monitor] Erro ao obter omnilink_config:', err);
      }

      const platAdapter = getOrCreatePlatformAdapter(detectedPlatId);
      const stage = {
        platformId: detectedPlatId,
        headers,
        dataRows,
        mapping: detection.mapping,
        taxonomy: platAdapter.taxonomy || {},
      };

      const { rows, stats } = buildImportRows(stage, operatorEmail);
      rawEventRows = rows || [];

      if (stats) {
        setLoadStats({
          total: stats.importadas || 0,
          comIntervencao: rawEventRows.filter(r => r.categoria_bucket === 'intervencao').length,
          soReportar: rawEventRows.filter(r => r.categoria_bucket === 'reportar').length,
          soTecnico: rawEventRows.filter(r => r.categoria_bucket === 'tecnico').length,
          falsosPositivos: 0,
          filtradosPorVelocidade: stats.velocidade || 0,
          totalNaFila: rawEventRows.length,
          novas: rawEventRows.length,
          atualizadas: 0
        });
      }

      const hash = await hashFile(file);
      if (hash) {
        let recent = [];
        try { recent = JSON.parse(localStorage.getItem('mn_sheet_hashes') || '[]'); } catch { /* storage não crítico */ }
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
            toast('Upload cancelado: planilha duplicada.', 'info');
            return;
          }
        }
        const updated = [{ hash, name: file.name, at: new Date().toISOString() }, ...recent.filter(r => r.hash !== hash)].slice(0, 10);
        try { localStorage.setItem('mn_sheet_hashes', JSON.stringify(updated)); } catch { /* storage não crítico */ }
      }

      // Persiste eventos brutos na tabela de histórico permanente
      if (rawEventRows && rawEventRows.length > 0) {
        const validEvents = rawEventRows.filter(r => r.ocorrido_em);
        if (validEvents.length > 0) {
          // Deduplica dentro do próprio batch (planilhas podem ter linhas repetidas)
          // antes do upsert para evitar o erro "ON CONFLICT DO UPDATE cannot affect row a second time".
          const seen = new Set();
          const deduped = validEvents.filter(r => {
            const key = `${r.platform_id}|${r.placa}|${r.ocorrido_em}|${r.nome_evento}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          const formData = new FormData();
          formData.append('files', file);
          formData.append('platformId', detectedPlatId);
          formData.append('platformName', detection.platformName);
          formData.append('mapping', JSON.stringify(detection.mapping));
          formData.append('operatorEmail', operatorEmail);

          const importResponse = await apiFetch('/api/analytics/import', {
            method: 'POST',
            body: formData,
            timeoutMs: 180000,
          });
          if (!importResponse.ok) {
            const errorBody = await importResponse.json().catch(() => ({}));
            throw new Error(errorBody.error || `Não foi possível salvar os eventos (HTTP ${importResponse.status}).`);
          }
        }
      }

      await reloadDrivers();
      
      setStatusKind('active');
      setStatusMsg(`${file.name} (${detection.platformName}) processada. Fila atualizada.`);
      toast(`${file.name} processada. Fila atualizada.`, 'success');
      navigate('/monitor/intervencao', { replace: true });
    } catch (err) {
      setStatusKind('error');
      setStatusMsg(`Erro ao ler planilha: ${err.message}`);
      toast(`Erro ao ler planilha: ${err.message}`, 'error');
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
    const { error } = await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'intervencao', bucket: 'intervencao', obs, platformId: d._platformId }) || {};
    if (error) return;
    toast(`Contato iniciado com ${d.nome}.`, 'success');
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const data = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    const sev = d.severidade || 'Normal';
    const criticidade = sev === 'Gravíssimo' ? 'GRAVÍSSIMO' : sev === 'Grave' ? 'GRAVE' : 'MÉDIO';
    const classificacao = (sev === 'Gravíssimo' || sev === 'Grave') ? 'IMEDIATA' : 'PREVENTIVA';
    
    const targetPlat = d._platformId ? getOrCreatePlatformAdapter(d._platformId) : { sistema: 'SASCAR' };
    
    postToSheets({
      data,
      empresa:         resolveAlias(d.transportadora || ''),
      sistema:         targetPlat.sistema,
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
    const { error } = await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'reportar', bucket: 'reportar', obs: `Reportado à transportadora · ${d.reportaveis} evento(s) (${d.tiposReportar.join(', ') || '—'})`, platformId: d._platformId }) || {};
    if (error) return;
    toast(`Notificação registrada para ${d.nome}.`, 'success');
  };

  const deleteAlert = (d, tipo = 'intervencao') => {
    setDiscardModal({ driver: d, tipo });
  };

  const performDiscard = async (d, tipo, reason) => {
    setDiscardModal(null);
    const isIntervencao = tipo === 'intervencao';
    const isReportar = tipo === 'reportar';
    const countStr = isIntervencao ? `${d.alertas} evento(s)`
                   : isReportar   ? `${d.reportaveis} evento(s) reportáveis`
                   :                `${d.tecnicos} evento(s) técnicos`;
    const { error } = await registrar({
      motorista: d.nome, placa: d.placa, transportadora: d.transportadora,
      tipo: 'descarte',
      bucket: tipo,
      obs: `Alerta descartado · ${countStr} · Motivo: ${reason}`,
      platformId: d._platformId,
    }) || {};
    if (error) return;
    toast(`Alerta de ${d.nome} descartado.`, 'success');
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

    const targetBucket = tab === 'intervencao' ? 'intervencao' : tab === 'reportar' ? 'reportar' : 'tecnico';

    const results = await Promise.allSettled(list.map(d => registrar({
      motorista: d.nome, placa: d.placa, transportadora: d.transportadora,
      tipo: 'descarte', bucket: targetBucket, obs: obsFor(d),
      platformId: d._platformId,
    })));
    const ok = results.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
    const fail = list.length - ok;

    await reloadDrivers();

    setLoading(false);
    setStatusKind(fail > 0 ? 'error' : 'active');
    setStatusMsg(`Descarte em massa: ${ok} ok${fail > 0 ? ` · ${fail} falha(s)` : ''}`);
    toast(
      `${ok} alerta(s) de ${tabLabel} descartado(s)${fail > 0 ? ` · ${fail} falha(s)` : ''}.`,
      fail > 0 ? 'error' : 'success'
    );
  };

  const clearQueue = async () => {
    const allActive = [...intervencaoList, ...reportarList, ...tecList];
    if (allActive.length === 0) {
      toast('A fila já está vazia.', 'info');
      return;
    }
    if (!(await confirm({
      title: 'Limpar fila',
      message: `Limpar a fila do Monitor para ${allActive.length} motorista(s)? Os eventos continuam preservados no Analytics — só saem da fila de atendimento.`,
      danger: true,
    }))) return;

    setLoading(true);
    setStatusMsg('Limpando fila…');
    try {
      const jobs = [];
      for (const d of allActive) {
        if (d.alertas > 0) jobs.push({ d, bucket: 'intervencao', count: d.alertas });
        if (d.reportaveis > 0) jobs.push({ d, bucket: 'reportar', count: d.reportaveis });
        if (d.tecnicos > 0) jobs.push({ d, bucket: 'tecnico', count: d.tecnicos });
      }

      const results = await Promise.allSettled(jobs.map(({ d, bucket, count }) => registrar({
        motorista: d.nome, placa: d.placa, transportadora: d.transportadora,
        tipo: 'limpeza', bucket, obs: `Fila limpa em massa · ${count} evento(s)`,
        platformId: d._platformId,
      })));
      const ok = results.filter(r => r.status === 'fulfilled' && !r.value?.error).length;
      const fail = jobs.length - ok;

      await reloadDrivers();
      setLoadStats(null);
      setStatusKind(fail > 0 ? 'error' : 'idle');
      setStatusMsg(fail > 0 ? `Fila limpa com ${fail} falha(s).` : 'Fila limpa. Aguardando novos eventos ou planilha.');
      toast(fail > 0 ? `Fila limpa com ${fail} falha(s).` : 'Fila limpa.', fail > 0 ? 'error' : 'success');
    } catch (err) {
      console.warn('[Monitor] Erro ao limpar fila:', err.message);
      toast('Não foi possível limpar a fila.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => setFilters({ empresa: '', comportamento: '', turno: '', prioridade: '', busca: '' });

  const savePreset = (name) => {
    const preset = { id: crypto.randomUUID(), name, filters: { ...filters } };
    const next = [preset, ...presets].slice(0, 5);
    setPresets(next);
    try { localStorage.setItem('mn_filter_presets', JSON.stringify(next)); } catch { /* storage não crítico */ }
  };

  const loadPreset = (preset) => setFilters({ ...preset.filters });

  const deletePreset = (id) => {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    try { localStorage.setItem('mn_filter_presets', JSON.stringify(next)); } catch { /* storage não crítico */ }
  };

  const exportActiveTab = () => {
    const list = activeTab === 'intervencao' ? intervencaoList
               : activeTab === 'reportar'    ? reportarList
               : activeTab === 'tecnicos'    ? tecList : [];
    if (list.length === 0) {
      toast('Nenhum dado para exportar nesta aba.', 'warning');
      return;
    }

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
    const filename = `monitor-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exportado: ${filename}`, 'success');
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

  const openWhatsappChat = (d) => {
    navigate(`/automacoes?name=${encodeURIComponent(d.nome)}`);
  };

  const openWhatsappCarrier = (d) => {
    navigate(`/automacoes?name=${encodeURIComponent(d.transportadora)}`);
  };

  const handlers = { openDossie, openTemplate, attend, deleteAlert, reportar, openWhatsappChat, openWhatsappCarrier };

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
        clearQueue={clearQueue} handleDrop={handleDrop} handleFile={handleFile} loadStats={loadStats}
        historyAgeMin={historyAgeMin}
      />

      <MonitorFilters
        profile={profile} filters={filters} setFilters={setFilters}
        transps={transps} resetFilters={resetFilters}
        comportamentos={comportamentos}
        presets={presets} onSavePreset={savePreset} onLoadPreset={loadPreset} onDeletePreset={deletePreset}
      />

      {/* Tabs */}
      <nav className="tabs" aria-label="Abas do Monitor de Frota" style={{ display: 'flex', alignItems: 'center' }}>
        {[
          ['intervencao', 'ti-phone-call',  'Intervenção',       intervencaoList.length, 'var(--danger-500)'],
          ['reportar',    'ti-building',    'Reportar à empresa', reportarList.length,    'var(--warning-500)'],
          ['tecnicos',    'ti-camera-off',  'Só técnico',        tecList.length,          null],
          ['historico',   'ti-history',     'Histórico',         history.length,     null],
        ].map(([id, icon, lbl, cnt, color]) => (
          <div 
            key={id} 
            className={`tab ${activeTab === id ? 'active' : ''}`} 
            onClick={() => navigate('/monitor/' + id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/monitor/' + id);
              }
            }}
            aria-selected={activeTab === id}
            style={{ cursor: 'pointer' }}
          >
            <i className={`ti ${icon}`} style={color ? { color } : {}}></i> {lbl}
            <span className="tab-count">{cnt}</span>
          </div>
        ))}
        {activeTab !== 'historico' && activeList.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => handleExpandAll(activeList)}
              title="Expandir todos os detalhes"
            >
              <i className="ti ti-layout-navbar-expand"></i> Expandir tudo
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={handleCollapseAll}
              title="Ocultar todos os detalhes"
            >
              <i className="ti ti-layout-navbar-collapse"></i> Colapsar tudo
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={exportActiveTab}
              title="Exportar aba atual como CSV"
            >
              <i className="ti ti-download"></i> Exportar
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={bulkDiscard}
              disabled={loading}
              title={`Descartar todos os ${activeList.length} alerta(s) visíveis na aba`}
            >
              <i className="ti ti-trash-x"></i> Descartar todos ({activeList.length})
            </button>
          </div>
        )}
      </nav>

      {/* Tab: Intervenção */}
      {activeTab === 'intervencao' && (
        driversLoading && drivers.length === 0
          ? <DriverListSkeleton />
          : intervencaoList.length === 0
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
                acc.push(<DriverCard key={d._driverKey || d.placa} d={d} type="intervencao" handlers={handlers} daysSince={reincidenteMap.get(d.nome)?.daysSince} sheetsEntry={sheetsAttendedMap.get(normStr(d.nome))} expanded={expandedPlacas.has(d._driverKey || d.placa)} onToggleExpand={() => handleToggleExpand(d._driverKey || d.placa)} />);
                return acc;
              }, [])}
            </div>
      )}

      {/* Tab: Reportar */}
      {activeTab === 'reportar' && (
        driversLoading && drivers.length === 0
          ? <DriverListSkeleton />
          : reportarList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum motorista para reportar" sub="Distração, uso de celular" />
          : <div className="driver-list">
              {paginate(reportarList).map(d => (
                <DriverCard key={d._driverKey || d.placa} d={d} type="reportar" handlers={handlers} daysSince={reincidenteMap.get(d.nome)?.daysSince} sheetsEntry={sheetsAttendedMap.get(normStr(d.nome))} expanded={expandedPlacas.has(d._driverKey || d.placa)} onToggleExpand={() => handleToggleExpand(d._driverKey || d.placa)} />
              ))}
            </div>
      )}

      {/* Tab: Só técnico */}
      {activeTab === 'tecnicos' && (
        driversLoading && drivers.length === 0
          ? <DriverListSkeleton />
          : tecList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum evento técnico isolado" />
          : <div className="driver-list">
              {paginate(tecList).map(d => (
                <DriverCard key={d._driverKey || d.placa} d={d} type="tecnicos" handlers={handlers} sheetsEntry={sheetsAttendedMap.get(normStr(d.nome))} expanded={expandedPlacas.has(d._driverKey || d.placa)} onToggleExpand={() => handleToggleExpand(d._driverKey || d.placa)} />
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
