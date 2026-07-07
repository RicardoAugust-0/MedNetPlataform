import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { getPlatform } from '../platforms';
import { aggregate } from '../platforms/shared/aggregate.js';
import { applyCustomRules } from '../platforms/shared/customRules.js';

const SEV_LEVELS = { 'Gravíssimo': 3, 'Grave': 2, 'Médio': 1, 'Normal': 0, 'Leve': -1 };
function maxSeveridade(list) {
  let maxVal = -2;
  let maxStr = 'Normal';
  for (const s of list) {
    const v = SEV_LEVELS[s] ?? 0;
    if (v > maxVal) { maxVal = v; maxStr = s; }
  }
  return maxStr;
}

function getOrCreatePlatformAdapter(platformId) {
  try {
    return getPlatform(platformId);
  } catch {
    return {
      id: platformId,
      name: platformId.charAt(0).toUpperCase() + platformId.slice(1),
      rules: { slaLimitMin: 30, criticalAlertsCount: 5, minMovingSpeedKmh: 10 },
      taxonomy: {
        intervencao: ['Fadiga', 'Distração', 'Bocejo', 'Olho Fechado'],
        tecnico: ['Câmera Obstruída', 'Falha Técnico', 'Perda de Vídeo'],
      }
    };
  }
}

function mergeDrivers(d1, d2) {
  const evIntervencaoCount = d1.alertas + d2.alertas;
  const evReportarCount = d1.reportaveis + d2.reportaveis;
  const evTecnicoCount = d1.tecnicos + d2.tecnicos;

  const tipos = [...new Set([...(d1.tipos || []), ...(d2.tipos || [])])];
  const tiposReportar = [...new Set([...(d1.tiposReportar || []), ...(d2.tiposReportar || [])])];

  const tiposTecnico = { ...(d1.tiposTecnico || {}) };
  Object.entries(d2.tiposTecnico || {}).forEach(([t, n]) => {
    tiposTecnico[t] = (tiposTecnico[t] || 0) + n;
  });

  const ultimoEvento = d1.ultimoEvento && d2.ultimoEvento 
    ? new Date(Math.max(d1.ultimoEvento.getTime(), d2.ultimoEvento.getTime()))
    : d1.ultimoEvento || d2.ultimoEvento;

  const ultimoEventoReportar = d1.ultimoEventoReportar && d2.ultimoEventoReportar
    ? new Date(Math.max(d1.ultimoEventoReportar.getTime(), d2.ultimoEventoReportar.getTime()))
    : d1.ultimoEventoReportar || d2.ultimoEventoReportar;

  const severidade = maxSeveridade([d1.severidade, d2.severidade]);
  
  const turnos = [d1.turno, d2.turno].filter(Boolean);
  const turno = turnos[0] || 'diurno';

  const eventosDetalhados = [...(d1.eventosDetalhados || []), ...(d2.eventosDetalhados || [])];
  
  const _loadedAt = new Date(Math.max(new Date(d1._loadedAt).getTime(), new Date(d2._loadedAt).getTime())).toISOString();

  const nome = (d1.nome && d1.nome !== d1.placa) ? d1.nome : d2.nome;

  const _platformId = d1.alertas >= d2.alertas ? d1._platformId : d2._platformId;

  const slaAgeMin = Math.max(d1.slaAgeMin || 0, d2.slaAgeMin || 0);
  const slaBreached = d1.slaBreached || d2.slaBreached;

  return {
    ...d1,
    nome,
    turno,
    alertas: evIntervencaoCount,
    tipos,
    ultimoEvento,
    reportaveis: evReportarCount,
    tiposReportar,
    ultimoEventoReportar,
    tecnicos: evTecnicoCount,
    tiposTecnico,
    severidade,
    eventosDetalhados,
    _loadedAt,
    _platformId,
    slaAgeMin,
    slaBreached,
  };
}

export function useOpenAlerts() {
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [customRules, setCustomRules] = useState([]);
  const [overrideEmail, setOverrideEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  // Fallback do email do operador logado
  const operatorEmail = useMemo(() => {
    return overrideEmail || profile?.email || 'hevilyntfzero@gmail.com';
  }, [overrideEmail, profile]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!isSupabaseConfigured) return;
    if (!silent) setLoading(true);
    try {
      // 1. Carregar omnilink_config
      const { data: configData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'omnilink_config')
        .maybeSingle();
      if (configData?.value?.operator_email) {
        setOverrideEmail(configData.value.operator_email);
      }

      // 2. Carregar driver_events das últimas 24 horas para todas as plataformas
      const startISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: evData, error: evErr } = await supabase
        .from('driver_events')
        .select('id, platform_id, placa, nome, transportadora, frota, turno, nome_evento, categoria_bucket, severidade, ocorrido_em, importado_em, analise_ia_plataforma, velocidade_kmh')
        .gte('ocorrido_em', startISO);

      if (evErr) throw evErr;

      // 3. Carregar atendimentos recentes (últimos 3 dias)
      const histStartISO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: histData, error: histErr } = await supabase
        .from('atendimentos')
        .select('id, placa, created_at, tipo, bucket')
        .gte('created_at', histStartISO)
        .order('created_at', { ascending: false });

      if (histErr) throw histErr;

      // 4. Carregar regras customizadas de descarte
      const { data: rulesData } = await supabase
        .from('custom_rules')
        .select('id, platform_id, transportadora, nome_evento, acao, ativa')
        .eq('ativa', true);

      setEvents(evData || []);
      setHistory(histData || []);
      setCustomRules(rulesData || []);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      console.warn('[useOpenAlerts] Erro ao carregar alertas/atendimentos:', err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Refresh periódico silencioso: sem isso, o corte de "últimas 24h" fica
  // congelado no instante do mount (só avança quando reloadDrivers() é chamado
  // manualmente após uma ação no Monitor), fazendo a fila de "em aberto" oscilar
  // de forma abrupta e imprevisível em vez de envelhecer suavemente com o tempo.
  useEffect(() => {
    const id = setInterval(() => load({ silent: true }), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  // Escutar Realtime para driver_events e atendimentos
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `open-alerts-live-universal-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_events' }, ({ new: row }) => {
        setEvents(prev => {
          if (prev.some(e => e.id === row.id)) return prev;
          return [...prev, row];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'driver_events' }, ({ new: row }) => {
        setEvents(prev => prev.map(e => e.id === row.id ? row : e));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'driver_events' }, ({ old: row }) => {
        setEvents(prev => prev.filter(e => e.id !== row.id));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atendimentos' }, ({ new: row }) => {
        setHistory(prev => {
          if (prev.some(h => h.id === row.id)) return prev;
          return [row, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'atendimentos' }, ({ new: row }) => {
        setHistory(prev => prev.map(h => h.id === row.id ? row : h));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'atendimentos' }, ({ old: row }) => {
        setHistory(prev => prev.filter(h => h.id !== row.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Agregação dinâmica reativa consolidando todas as plataformas
  const { drivers, stats } = useMemo(() => {
    const eventsByPlatform = {};
    for (const e of events) {
      const pid = e.platform_id || 'auto';
      if (!eventsByPlatform[pid]) eventsByPlatform[pid] = [];
      eventsByPlatform[pid].push(e);
    }

    const allDrivers = [];
    const totalStats = {
      total: 0,
      comIntervencao: 0,
      soReportar: 0,
      soTecnico: 0,
      totalEventos: 0,
      falsosPositivos: 0,
      filtradosPorVelocidade: 0,
      filtradosPorHistorico: 0,
      filtradosPorBurst: 0,
      autoDescartes: [],
    };

    for (const [pid, platEvents] of Object.entries(eventsByPlatform)) {
      const platAdapter = getOrCreatePlatformAdapter(pid);
      let { drivers: platDrivers, stats: platStats } = aggregate(platEvents, history, platAdapter, { operatorEmail });

      // Aplica regras customizadas do banco (substitui hardcodes de plataforma)
      const { drivers: ruledDrivers, autoDescartes: ruleDescartes } = applyCustomRules(platDrivers, customRules, pid);
      platDrivers = ruledDrivers;
      if (platStats.autoDescartes) platStats.autoDescartes.push(...ruleDescartes);
      else platStats.autoDescartes = ruleDescartes;

      allDrivers.push(...platDrivers);

      totalStats.totalEventos += platStats.totalEventos || 0;
      totalStats.falsosPositivos += platStats.falsosPositivos || 0;
      totalStats.filtradosPorVelocidade += platStats.filtradosPorVelocidade || 0;
      totalStats.filtradosPorHistorico += platStats.filtradosPorHistorico || 0;
      totalStats.filtradosPorBurst += platStats.filtradosPorBurst || 0;
      if (platStats.autoDescartes) {
        totalStats.autoDescartes.push(...platStats.autoDescartes);
      }
    }

    const mergedDriversMap = {};
    for (const d of allDrivers) {
      const key = d.placa;
      if (!mergedDriversMap[key]) {
        mergedDriversMap[key] = d;
      } else {
        mergedDriversMap[key] = mergeDrivers(mergedDriversMap[key], d);
      }
    }

    const mergedDrivers = Object.values(mergedDriversMap);

    totalStats.total = mergedDrivers.length;
    totalStats.comIntervencao = mergedDrivers.filter(d => d.alertas > 0).length;
    totalStats.soReportar = mergedDrivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length;
    totalStats.soTecnico = mergedDrivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length;

    return { drivers: mergedDrivers, stats: totalStats };
  }, [events, history, customRules, operatorEmail]);

  // Calcula reativamente a data da planilha mais recente carregada baseando-se no importado_em de eventos ativos
  const lastImportedAt = useMemo(() => {
    if (!events.length) return null;
    let max = null;
    for (const e of events) {
      if (e.importado_em) {
        if (!max || e.importado_em > max) {
          max = e.importado_em;
        }
      }
    }
    return max;
  }, [events]);

  return {
    drivers,
    stats,
    loading,
    loadedAt,
    lastImportedAt,
    reload: load,
  };
}
