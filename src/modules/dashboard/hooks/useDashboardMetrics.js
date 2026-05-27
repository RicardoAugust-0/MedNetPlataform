import { useMemo } from 'react';
import { parseSheetRowDate, parseTimeStrToMin } from '../_helpers';

// Hook que concentra todas as derivações (useMemos) do Dashboard.
// Recebe dados brutos + filtros e devolve métricas prontas pra UI.
//
// Entradas:
//   - drivers, atHistory, sheetHistory: dados brutos
//   - now, todayStr: clock
//   - filters + helpers (showTipo, showResultado, empresaFilterFn): filtros ativos
//   - resolveAlias: dedup de transportadoras
//   - compareYesterday, slaLimit: settings
//   - profiles: equipe (lista de operadores ativos)
//
// Saídas: todos os useMemos derivados que o Dashboard consumia inline.

const criticThreshold = (platformId) => platformId === 'maxtrack' ? 8 : 5;

export function useDashboardMetrics({
  drivers, atHistory, sheetHistory,
  now, todayStr,
  filters, showTipo, showResultado, empresaFilterFn,
  resolveAlias, profiles,
  compareYesterday, slaLimit,
}) {
  // ── Janela de período: hoje (00h-now) vs turno atual (diurno 06-18 / noturno 18-06)
  const periodoWindow = useMemo(() => {
    if (filters.periodo === 'turno') {
      const isDiurno = now.getHours() >= 6 && now.getHours() < 18;
      const start = new Date(now);
      if (isDiurno) {
        start.setHours(6, 0, 0, 0);
      } else {
        if (now.getHours() < 6) start.setDate(start.getDate() - 1);
        start.setHours(18, 0, 0, 0);
      }
      return { start, end: new Date(now) };
    }
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { start, end: new Date(now) };
  }, [filters.periodo, now]);

  // ── Sheet: linhas no período (com filtro de empresa) ──────────────────────
  const sheetRowsPeriodo = useMemo(() => {
    return sheetHistory.rows.filter(r => {
      const d = parseSheetRowDate(r);
      if (!d) return false;
      if (filters.periodo === 'hoje') {
        if (d.toDateString() !== todayStr) return false;
      } else {
        if (d < new Date(periodoWindow.start.getFullYear(), periodoWindow.start.getMonth(), periodoWindow.start.getDate())) return false;
        if (d > periodoWindow.end) return false;
      }
      if (!empresaFilterFn(r.empresa)) return false;
      return true;
    });
  }, [sheetHistory.rows, todayStr, periodoWindow, filters.periodo, empresaFilterFn]);

  // ── Atendimentos no período (com filtros: periodo + empresa + operador + tipo)
  const atendimentosHoje = useMemo(() => {
    return atHistory.filter(a => {
      const d = new Date(a.created_at);
      if (d < periodoWindow.start || d > periodoWindow.end) return false;
      if (filters.operador !== 'todos' && a.operador !== filters.operador) return false;
      if (!empresaFilterFn(a.transportadora)) return false;
      if (filters.tipo.length > 0) {
        if (a.tipo === 'intervencao' && !showTipo('fadiga')) return false;
        if (a.tipo === 'reportar' && !showTipo('comportamento')) return false;
      }
      return true;
    });
  }, [atHistory, periodoWindow, filters.operador, filters.tipo, empresaFilterFn, showTipo]);

  // ── Base de drivers com filtros (empresa + tipo)
  const driversFiltered = useMemo(() => {
    return drivers.filter(d => {
      if (!empresaFilterFn(d.transportadora)) return false;
      if (filters.tipo.length > 0) {
        const isFadiga  = (d.alertas || 0) > 0;
        const isComport = (d.reportaveis || 0) > 0 && !isFadiga;
        if (isFadiga && !showTipo('fadiga')) return false;
        if (isComport && !showTipo('comportamento')) return false;
        if (!isFadiga && !isComport) return false;
      }
      return true;
    });
  }, [drivers, filters.tipo, empresaFilterFn, showTipo]);

  const driversAtivos = useMemo(
    () => driversFiltered.filter(d => (d.alertas || 0) > 0 || (d.reportaveis || 0) > 0),
    [driversFiltered]
  );
  const driversIntervencao = useMemo(
    () => driversFiltered.filter(d => (d.alertas || 0) > 0),
    [driversFiltered]
  );

  // ── Placas com intervenção prévia (excl. hoje) ────────────────────────────
  // Combina Supabase atendimentos (30d) e planilha (90d com realizadoPor).
  const placasPrevia30d = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff30 = today.getTime() - 30 * 86400000;
    const cutoff90 = today.getTime() - 90 * 86400000;
    const set = new Set();
    for (const a of atHistory) {
      if (a.tipo !== 'intervencao' || !a.placa) continue;
      const t = new Date(a.created_at).getTime();
      if (t < cutoff30) continue;
      if (new Date(a.created_at).toDateString() === todayStr) continue;
      set.add(a.placa);
    }
    for (const r of sheetHistory.rows) {
      if (!r.placa || !r.realizadoPor) continue;
      const d = parseSheetRowDate(r);
      if (!d) continue;
      const t = d.getTime();
      if (t < cutoff90) continue;
      if (d.toDateString() === todayStr) continue;
      set.add(r.placa);
    }
    return set;
  }, [atHistory, todayStr, sheetHistory.rows]);

  // Lookup placa → última intervenção registrada antes de hoje.
  const lastIntervByPlaca = useMemo(() => {
    const map = new Map();
    for (const a of atHistory) {
      if (a.tipo !== 'intervencao' || !a.placa) continue;
      if (new Date(a.created_at).toDateString() === todayStr) continue;
      const existing = map.get(a.placa);
      if (!existing || a.created_at > existing.created_at) {
        map.set(a.placa, a);
      }
    }
    return map;
  }, [atHistory, todayStr]);

  // ── KPIs base ───────────────────────────────────────────────────────────────
  const fechadosHoje = useMemo(
    () => atendimentosHoje.filter(a => {
      if (a.tipo !== 'intervencao' && a.tipo !== 'reportar') return false;
      const isPP = a.placa && placasPrevia30d.has(a.placa);
      if (isPP && !showResultado('pos-positivo')) return false;
      if (!isPP && !showResultado('positivo'))    return false;
      return true;
    }),
    [atendimentosHoje, placasPrevia30d, showResultado]
  );

  // RESULTADOS é a fonte única de verdade para Pós-positivo/Positivo/Em aberto.
  // SEMPRE absoluto (sem filtros de resultado/operador/empresa) — chip e card
  // KPI exibem o mesmo número.
  const RESULTADOS = useMemo(() => {
    const atsHojeFull = atHistory.filter(a => new Date(a.created_at).toDateString() === todayStr);
    const fechadosFull = atsHojeFull.filter(a => a.tipo === 'intervencao' || a.tipo === 'reportar');
    
    const sheetRowsToday = sheetHistory.rows.filter(r => {
      const d = parseSheetRowDate(r);
      return d && d.toDateString() === todayStr;
    });
    const sheetFechadosToday = sheetRowsToday.filter(r => r.realizadoPor);
    const sheetPpToday = sheetFechadosToday.filter(r => r.placa && placasPrevia30d.has(r.placa)).length;
    const sheetPosToday = sheetFechadosToday.length - sheetPpToday;

    const ppFull = fechadosFull.filter(a => a.placa && placasPrevia30d.has(a.placa)).length + sheetPpToday;
    const posFull = (fechadosFull.length - (ppFull - sheetPpToday)) + sheetPosToday;
    const emAbertoFull = drivers.filter(d => (d.alertas || 0) > 0 || (d.reportaveis || 0) > 0).length;

    return [
      { id: 'positivo',     label: 'Positivo',      color: '#2DA75A', count: posFull,      hint: 'Atendimento sem histórico recente' },
      { id: 'pos-positivo', label: 'Pós-positivo',  color: '#2A8DD9', count: ppFull,       hint: 'Reincidiu após intervenção (30d)' },
      { id: 'aberto',       label: 'Em aberto',     color: '#8A94A6', count: emAbertoFull, hint: 'Motoristas aguardando tratamento' },
    ];
  }, [atHistory, sheetHistory.rows, todayStr, placasPrevia30d, drivers]);

  const TIPOS = useMemo(() => {
    const fadigaCount  = drivers.filter(d => (d.alertas || 0) > 0).length;
    const comportCount = drivers.filter(d => (d.reportaveis || 0) > 0 && (d.alertas || 0) === 0).length;
    return [
      { id: 'fadiga',        label: 'Fadiga',        color: '#E24B4A', count: fadigaCount,  hint: 'Motoristas em intervenção (fadiga/sonolência)' },
      { id: 'comportamento', label: 'Comportamento', color: '#E8A020', count: comportCount, hint: 'Motoristas só para reportar (comportamento)' },
    ];
  }, [drivers]);

  const sheetIntervencoesHoje = sheetRowsPeriodo.filter(r => r.realizadoPor).length;
  const intervencoesRegistradas = fechadosHoje.length + sheetIntervencoesHoje;

  const closedInterventionsFiltered = atendimentosHoje.filter(a => a.tipo === 'intervencao' || a.tipo === 'reportar');
  const sheetInterventionsFiltered = sheetRowsPeriodo.filter(r => r.realizadoPor);
  const platPP = closedInterventionsFiltered.filter(a => a.placa && placasPrevia30d.has(a.placa)).length;
  const sheetPP = sheetInterventionsFiltered.filter(r => r.placa && placasPrevia30d.has(r.placa)).length;

  const posPositivo  = platPP + sheetPP;
  const positivo     = (closedInterventionsFiltered.length + sheetInterventionsFiltered.length) - posPositivo;
  const fechados     = closedInterventionsFiltered.length + sheetInterventionsFiltered.length;
  const emAberto     = showResultado('aberto') ? driversAtivos.length : 0;
  const encerradosPlataforma = atHistory.filter(a => new Date(a.created_at).toDateString() === todayStr && (a.tipo === 'intervencao' || a.tipo === 'reportar')).length;
  const totalAlertas = fechados + emAberto;
  const pctConcluido = totalAlertas > 0 ? Math.round((fechados / totalAlertas) * 100) : 0;
  // % baseado apenas na plataforma, para KPI "Fechados hoje" (sem cruzar com planilha)
  const pctConcluidoPlataforma = (encerradosPlataforma + emAberto) > 0
    ? Math.round((encerradosPlataforma / (encerradosPlataforma + emAberto)) * 100)
    : 0;
  const taxaReinc    = (positivo + posPositivo) > 0 ? (posPositivo / (positivo + posPositivo)) * 100 : 0;

  // Filtered versions for drill-down details
  const volumeTipos = useMemo(() => {
    const closedInterventionsFiltered = atendimentosHoje.filter(a => a.tipo === 'intervencao');
    const closedReportarFiltered = atendimentosHoje.filter(a => a.tipo === 'reportar');
    const sheetInterventionsFiltered = sheetRowsPeriodo.filter(r => r.realizadoPor);

    const activeFadigaFiltered = driversAtivos.filter(d => (d.alertas || 0) > 0).length;
    const activeComportFiltered = driversAtivos.filter(d => (d.alertas || 0) === 0 && (d.reportaveis || 0) > 0).length;

    const fadigaCount = closedInterventionsFiltered.length + sheetInterventionsFiltered.length + activeFadigaFiltered;
    const comportCount = closedReportarFiltered.length + activeComportFiltered;

    return [
      { id: 'fadiga',        label: 'Fadiga',        color: '#E24B4A', count: fadigaCount },
      { id: 'comportamento', label: 'Comportamento', color: '#E8A020', count: comportCount },
    ];
  }, [atendimentosHoje, sheetRowsPeriodo, driversAtivos]);

  const emAbertoTipos = useMemo(() => {
    const fadigaCount = driversAtivos.filter(d => (d.alertas || 0) > 0).length;
    const comportCount = driversAtivos.filter(d => (d.alertas || 0) === 0 && (d.reportaveis || 0) > 0).length;
    return [
      { id: 'fadiga',        label: 'Fadiga',        color: '#E24B4A', count: fadigaCount },
      { id: 'comportamento', label: 'Comportamento', color: '#E8A020', count: comportCount },
    ];
  }, [driversAtivos]);

  const volumeResultados = useMemo(() => {
    const closedInterventionsFiltered = atendimentosHoje.filter(a => a.tipo === 'intervencao' || a.tipo === 'reportar');
    const sheetInterventionsFiltered = sheetRowsPeriodo.filter(r => r.realizadoPor);

    const platPP = closedInterventionsFiltered.filter(a => a.placa && placasPrevia30d.has(a.placa)).length;
    const sheetPP = sheetInterventionsFiltered.filter(r => r.placa && placasPrevia30d.has(r.placa)).length;
    
    const ppCount = platPP + sheetPP;
    const posCount = (closedInterventionsFiltered.length + sheetInterventionsFiltered.length) - ppCount;
    
    return [
      { id: 'positivo',     label: 'Positivo',      color: '#2DA75A', count: posCount },
      { id: 'pos-positivo', label: 'Pós-positivo',  color: '#2A8DD9', count: ppCount },
      { id: 'aberto',       label: 'Em aberto',     color: '#8A94A6', count: emAberto },
    ];
  }, [atendimentosHoje, sheetRowsPeriodo, placasPrevia30d, emAberto]);

  // Reincidentes em aberto: drivers na fila cujas placas têm histórico recente.
  const reincidentesAtivos = useMemo(
    () => driversAtivos.filter(d => d.placa && placasPrevia30d.has(d.placa)).length,
    [driversAtivos, placasPrevia30d]
  );

  // ── Comparação com ontem (escopada aos mesmos filtros pra delta fazer sentido)
  const ONTEM = useMemo(() => {
    if (!compareYesterday) return null;
    const yStr = new Date(now.getTime() - 86400000).toDateString();
    const yAtsAll = atHistory.filter(a => {
      if (new Date(a.created_at).toDateString() !== yStr) return false;
      if (filters.operador !== 'todos' && a.operador !== filters.operador) return false;
      if (!empresaFilterFn(a.transportadora)) return false;
      if (filters.tipo.length > 0) {
        if (a.tipo === 'intervencao' && !showTipo('fadiga')) return false;
        if (a.tipo === 'reportar' && !showTipo('comportamento')) return false;
      }
      return true;
    });
    const yInterv   = yAtsAll.filter(a => a.tipo === 'intervencao');
    const yFechados = yAtsAll.filter(a => a.tipo === 'intervencao' || a.tipo === 'reportar');
    const cutoffY = new Date(now.getTime() - 31 * 86400000);
    const placasPreviaY = new Set(
      atHistory
        .filter(a =>
          a.tipo === 'intervencao' &&
          new Date(a.created_at) > cutoffY &&
          new Date(a.created_at).toDateString() !== yStr
        )
        .map(a => a.placa)
        .filter(Boolean)
    );
    const ppY = yInterv.filter(a => a.placa && placasPreviaY.has(a.placa)).length;
    const yPlacasEvts    = new Set(yAtsAll.filter(a => a.placa).map(a => a.placa));
    const yPlacasFechado = new Set(yFechados.map(a => a.placa).filter(Boolean));
    const emAbertoY      = [...yPlacasEvts].filter(p => !yPlacasFechado.has(p)).length;
    return { total: yFechados.length + emAbertoY, fechados: yFechados.length, posPositivo: ppY, emAberto: emAbertoY };
  }, [atHistory, compareYesterday, now, filters.operador, filters.tipo, empresaFilterFn, showTipo]);

  // ── Motoristas críticos com SLA (limiares por plataforma: Sascar ≥5, Maxtrack ≥8)
  const criticos = useMemo(() => {
    const tiposFadiga = ['Bocejo', 'Olho fechado', 'Sonolência', 'Fadiga'];
    const nowMs = now.getTime();
    return driversIntervencao
      .filter(d => (d.alertas || 0) >= criticThreshold(d._platformId))
      .map(d => {
        const tipo       = d.alertas > 0 ? 'fadiga' : 'comportamento';
        const reincidente = d.placa && placasPrevia30d.has(d.placa);
        const lastInterv = lastIntervByPlaca.get(d.placa);
        const ultimaIntervencao = lastInterv
          ? `${Math.floor((nowMs - new Date(lastInterv.created_at).getTime()) / 86400000)}d`
          : null;
        const lastEvt = d.ultimoEvento || d.ultimoEventoReportar;
        const abertoMin = lastEvt ? (nowMs - new Date(lastEvt).getTime()) / 60000 : 0;
        return {
          nome: d.nome,
          placa: d.placa,
          platformId: d._platformId,
          transportadora: resolveAlias(d.transportadora),
          frota: d.frota,
          turno: d.turno,
          alertas: d.alertas,
          tipo,
          reincidente,
          abertoMin,
          ultimaIntervencao,
          eventos: d.eventosDetalhados || [],
        };
      })
      .sort((a, b) => b.abertoMin - a.abertoMin);
  }, [driversIntervencao, lastIntervByPlaca, placasPrevia30d, now, resolveAlias]);

  const slaVencidos = criticos.filter(c => c.abertoMin > slaLimit).length;

  // ── Sheet: TMA, criticidade, classificação e pendências ──────────────────────

  const sheetTMA = useMemo(() => {
    const deltas = [];
    for (const r of sheetRowsPeriodo) {
      if (!r.realizadoPor) continue;
      const ts = parseTimeStrToMin(r.horaSolicitacao);
      const tr = parseTimeStrToMin(r.horaRealizacao);
      if (ts == null || tr == null) continue;
      let delta = tr - ts;
      if (delta < 0) delta += 24 * 60;
      if (delta > 12 * 60) continue;
      deltas.push(delta);
    }
    if (deltas.length === 0) return { avg: null, n: 0 };
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    return { avg, n: deltas.length };
  }, [sheetRowsPeriodo]);

  const sheetCriticidade = useMemo(() => {
    const COL = { 'GRAVÍSSIMO': '#E24B4A', 'GRAVISSIMO': '#E24B4A', 'GRAVE': '#E8A020', 'NORMAL': '#2DA75A' };
    const counts = new Map();
    for (const r of sheetRowsPeriodo) {
      const raw = (r.criticidade || '').trim();
      if (!raw) continue;
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count, color: COL[label.toUpperCase()] || '#8A94A6' }))
      .sort((a, b) => b.count - a.count);
  }, [sheetRowsPeriodo]);

  const sheetClassificacao = useMemo(() => {
    const counts = new Map();
    for (const r of sheetRowsPeriodo) {
      const raw = (r.classificacao || '').trim();
      if (!raw) continue;
      counts.set(raw, (counts.get(raw) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }, [sheetRowsPeriodo]);

  const sheetPendencias = useMemo(() => {
    let count = 0;
    for (const r of sheetHistory.rows) {
      if (!r.solicitadoPor) continue;
      if (r.realizadoPor) continue;
      if (!empresaFilterFn(r.empresa)) continue;
      count++;
    }
    return count;
  }, [sheetHistory.rows, empresaFilterFn]);

  const sheetAgeMin = useMemo(() => {
    if (!sheetHistory.loadedAt) return null;
    return Math.floor((now.getTime() - new Date(sheetHistory.loadedAt).getTime()) / 60000);
  }, [sheetHistory.loadedAt, now]);

  // ── Transportadoras ─────────────────────────────────────────────────────────
  const transpStats = useMemo(() => {
    const map = new Map();
    driversAtivos.forEach(d => {
      if (!d.transportadora) return;
      const name = resolveAlias(d.transportadora);
      const e = map.get(name) || { name, total: 0, abertos: 0, posPositivos: 0, motoristas: 0 };
      e.abertos++;
      e.motoristas++;
      e.total += (d.alertas || 0) + (d.reportaveis || 0);
      if (d.placa && placasPrevia30d.has(d.placa)) e.posPositivos++;
      map.set(name, e);
    });
    atendimentosHoje
      .filter(a => (a.tipo === 'intervencao' || a.tipo === 'reportar') && a.transportadora)
      .forEach(a => {
        const name = resolveAlias(a.transportadora);
        const e = map.get(name) || { name, total: 0, abertos: 0, posPositivos: 0, motoristas: 0 };
        e.total++;
        if (a.placa && placasPrevia30d.has(a.placa)) e.posPositivos++;
        map.set(name, e);
      });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [driversAtivos, atendimentosHoje, placasPrevia30d, resolveAlias]);

  // Transportadoras pros chips do filtro — base UNFILTERED
  const transpForFilter = useMemo(() => {
    const map = new Map();
    drivers.forEach(d => {
      const name = resolveAlias(d.transportadora);
      if (!name) return;
      const e = map.get(name) || { name, total: 0, abertos: 0 };
      if ((d.alertas || 0) > 0 || (d.reportaveis || 0) > 0) {
        e.total++;
        e.abertos++;
      }
      map.set(name, e);
    });
    return [...map.values()]
      .filter(t => t.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [drivers, resolveAlias]);

  // Lista de operadores pro dropdown — equipe atual (profiles).
  const operadoresForFilter = useMemo(() => {
    const team = (profiles || [])
      .filter(p => p.role === 'operador' || p.role === 'admin')
      .map(p => ({ nome: p.nome }))
      .filter(p => p.nome);
    return team.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [profiles]);

  // ── Atividade por hora (24h)
  const HOURLY = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => {
      const closed = atendimentosHoje.filter(
        a => (a.tipo === 'intervencao' || a.tipo === 'reportar') &&
             new Date(a.created_at).getHours() === h
      ).length;
      const open = driversAtivos.filter(
        d => d.ultimoEvento && new Date(d.ultimoEvento).getHours() === h
      ).length;
      return { h: `${String(h).padStart(2, '0')}h`, closed, open };
    });
  }, [atendimentosHoje, driversAtivos]);

  // ── Alertas técnicos ────────────────────────────────────────────────────────
  const tecnicos = useMemo(() => {
    const techIcons = {
      'Câmera obstruída': 'ti-camera-off',
      'Perda de vídeo':   'ti-video-off',
      'Sem motorista':    'ti-user-off',
    };
    const techMap = {};
    const baseTech = drivers.filter(d => d.tecnicos > 0 && empresaFilterFn(d.transportadora));
    baseTech.forEach(d => {
      Object.keys(d.tiposTecnico || {}).forEach(tipo => {
        if (!techMap[tipo]) {
          techMap[tipo] = { id: tipo, label: tipo, count: 0, icon: techIcons[tipo] || 'ti-tools', placas: [] };
        }
        techMap[tipo].count += d.tiposTecnico[tipo] || 0;
        if (d.placa) techMap[tipo].placas.push(d.placa);
      });
    });
    return Object.values(techMap);
  }, [drivers, empresaFilterFn]);

  // ── Produtividade da equipe ─────────────────────────────────────────────────
  // Calculado diretamente (sem useMemo) para garantir que a planilha carregada
  // de forma assíncrona seja sempre refletida — o useMemo ficava stale quando
  // sheetRowsPeriodo atualizava após o mount e a tabela atendimentos está vazia.
  const equipe = (() => {
    const getFullOperatorName = (shortOrFullName) => {
      if (!shortOrFullName) return '';
      const norm = shortOrFullName.trim().toLowerCase();

      const excludeNames = new Set(['', '—', '-', 'auto-descarte', 'limpeza', 'descarte', 'não realizado', 'nao realizado', 'sem contato', 'sistema']);
      if (excludeNames.has(norm)) return '';

      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(norm)) return '';
      if (/^\d{1,4}[-/]\d{1,2}([-/]\d{1,4})?$/.test(norm)) return '';
      if (/^\d+$/.test(norm)) return '';

      const exact = profiles.find(p => p.nome && p.nome.trim().toLowerCase() === norm);
      if (exact) return exact.nome;

      const firstNameMatch = profiles.find(p => {
        if (!p.nome) return false;
        const parts = p.nome.trim().toLowerCase().split(' ');
        return parts[0] === norm || parts.includes(norm);
      });
      if (firstNameMatch) return firstNameMatch.nome;

      const inputParts = norm.split(' ');
      const profileMatchByInputFirst = profiles.find(p => {
        if (!p.nome) return false;
        const pFirst = p.nome.trim().toLowerCase().split(' ')[0];
        return pFirst === inputParts[0];
      });
      if (profileMatchByInputFirst) return profileMatchByInputFirst.nome;

      return shortOrFullName;
    };

    const opMap = {};
    atendimentosHoje.forEach(a => {
      if (!a.operador || a.tipo === 'limpeza') return;
      const opName = getFullOperatorName(a.operador);
      if (!opName) return;
      if (!opMap[opName]) opMap[opName] = { nome: opName, interv: 0, pp: 0, reportes: 0 };
      if (a.tipo === 'intervencao') {
        opMap[opName].interv++;
        if (a.placa && placasPrevia30d.has(a.placa)) opMap[opName].pp++;
      } else if (a.tipo === 'reportar') {
        opMap[opName].reportes++;
      }
    });

    sheetRowsPeriodo.forEach(r => {
      const raw = (r.realizadoPor || '').trim();
      if (!raw) return;
      // Descarta horários (00:52), datas (27/05) e números puros antes de usar como nome
      if (/^\d{1,2}:\d{2}/.test(raw)) return;
      if (/^\d{1,4}[-/]\d{1,2}/.test(raw)) return;
      if (/^\d+$/.test(raw)) return;
      const normRaw = raw.toLowerCase();
      const skipSet = new Set(['—', '-', 'auto-descarte', 'limpeza', 'descarte', 'não realizado', 'nao realizado', 'sem contato', 'sistema']);
      if (skipSet.has(normRaw)) return;
      // Após filtragem, nome resolvido via perfis ou o nome bruto da planilha
      const opName = getFullOperatorName(raw) || raw;
      if (!opMap[opName]) opMap[opName] = { nome: opName, interv: 0, pp: 0, reportes: 0 };
      opMap[opName].interv++;
      if (r.placa && placasPrevia30d.has(r.placa)) opMap[opName].pp++;
    });

    const colors = ['#9E1A45', '#2A8DD9', '#2DA75A', '#E8A020', '#7A1235', '#C24A6A'];
    return Object.values(opMap)
      .filter(op => op.interv + op.reportes > 0)
      .map((op, idx) => ({
        nome:         op.nome,
        cargo:        '',
        avatarColor:  colors[idx % colors.length],
        tratados:     { fadigaPos: op.interv - op.pp, fadigaPP: op.pp, compPos: op.reportes, compPP: 0 },
        tempoMedio:   null,
      }))
      .sort((a, b) => {
        const ta = a.tratados.fadigaPos + a.tratados.fadigaPP + a.tratados.compPos;
        const tb = b.tratados.fadigaPos + b.tratados.fadigaPP + b.tratados.compPos;
        return tb - ta;
      });
  })();

  // Contagem de drivers ativos por plataforma — base absoluta
  const platformCounts = useMemo(() => {
    const counts = { maxtrack: 0, sascar: 0 };
    for (const d of drivers) {
      if ((d.alertas || 0) === 0 && (d.reportaveis || 0) === 0) continue;
      if (d._platformId === 'maxtrack') counts.maxtrack++;
      else if (d._platformId === 'sascar') counts.sascar++;
    }
    return counts;
  }, [drivers]);

  // ── Atualizado há Xmin (mais recente entre drivers/ats/sheet)
  const lastAtendimentoAt = useMemo(() => {
    if (!atHistory.length) return null;
    return atHistory.reduce((max, a) => {
      const t = new Date(a.created_at).getTime();
      return t > max ? t : max;
    }, 0);
  }, [atHistory]);

  return {
    // periodo / windows
    periodoWindow,
    // bases filtradas
    atendimentosHoje, driversFiltered, driversAtivos, driversIntervencao,
    placasPrevia30d, lastIntervByPlaca,
    // KPIs principais
    fechadosHoje, posPositivo, positivo, fechados, emAberto,
    encerradosPlataforma, intervencoesRegistradas, sheetIntervencoesHoje,
    totalAlertas, pctConcluido, pctConcluidoPlataforma, taxaReinc, reincidentesAtivos,
    // chips
    TIPOS, RESULTADOS,
    // volume e tipos filtrados para os drills
    volumeTipos, emAbertoTipos, volumeResultados,
    // ontem
    ONTEM,
    // críticos
    criticos, slaVencidos,
    // sheet
    sheetRowsPeriodo, sheetTMA, sheetCriticidade, sheetClassificacao,
    sheetPendencias, sheetAgeMin,
    // transp / equipe
    transpStats, transpForFilter, operadoresForFilter,
    // misc
    HOURLY, tecnicos, equipe, platformCounts, lastAtendimentoAt,
  };
}
