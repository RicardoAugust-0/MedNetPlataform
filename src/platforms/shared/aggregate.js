import { normClf } from '../../utils/fatigueParser.js';
import { maxSeveridade } from './parsers.js';
import { buildClearMap, isAfterClear } from './history.js';

/**
 * Agrega eventos brutos (driver_events) e histórico de atendimentos (atendimentos)
 * na fila consolidada de motoristas (drivers) para o Monitor, calculando SLA.
 *
 * @param {Array} events - Eventos brutos da tabela driver_events
 * @param {Array} history - Tratativas recentes da tabela atendimentos
 * @param {Object} platform - Adapter da plataforma activa (Sascar, Maxtrack, OmniLink)
 * @param {Object} options - Opções extras (ex: operatorEmail)
 * @returns {Object} { drivers, stats }
 */
export function aggregate(events, history, platform, options = {}) {
  const rules = platform.rules || { slaLimitMin: 30, criticalAlertsCount: 5, minMovingSpeedKmh: 10 };
  const platformId = platform.id;

  let totalEventos = 0;
  let falsosPositivos = 0;
  let filtradosPorVelocidade = 0;

  // 1. Filtrar eventos brutos pertencentes a esta plataforma
  const platformEvents = (events || []).filter(e => e.platform_id === platformId);
  totalEventos = platformEvents.length;

  const validEvents = [];

  for (const e of platformEvents) {
    // Regra A: Falso Positivo
    const clf = normClf(e.analise_ia_plataforma);
    if (clf === 'Falso positivo') {
      falsosPositivos += 1;
      continue;
    }

    // Regra B: Velocidade Mínima
    if (e.velocidade_kmh !== null && e.velocidade_kmh !== undefined) {
      const speed = Number(e.velocidade_kmh);
      if (!isNaN(speed) && speed < (rules.minMovingSpeedKmh ?? 10)) {
        filtradosPorVelocidade += 1;
        continue;
      }
    }

    validEvents.push(e);
  }

  // 2. Agrupar eventos válidos por placa
  const byPlaca = {};
  for (const e of validEvents) {
    const placa = e.placa;
    if (!placa) continue;

    if (!byPlaca[placa]) {
      byPlaca[placa] = {
        nome:           '',
        placa,
        transportadora: e.transportadora || '—',
        frota:          e.frota || '',
        eventos:        [],
        turnos:         [],
        _platformId:    platformId,
        _loadedAt:      e.importado_em || new Date().toISOString(), // fallback
      };
    }

    const entry = byPlaca[placa];
    
    // Atualiza nome/frota se vazio
    if (!entry.nome && e.nome && e.nome !== '-') {
      entry.nome = e.nome;
    }
    if (!entry.frota && e.frota) {
      entry.frota = String(e.frota);
    }
    
    entry.eventos.push(e);
    if (e.turno) {
      entry.turnos.push(e.turno);
    }
  }

  // 3. Consolidar os motoristas antes do filtro de histórico
  const rawDrivers = Object.values(byPlaca).map(d => {
    const evIntervencao = d.eventos.filter(e => e.categoria_bucket === 'intervencao');
    const evReportar    = d.eventos.filter(e => e.categoria_bucket === 'reportar');
    const evTecnico     = d.eventos.filter(e => e.categoria_bucket === 'tecnico');

    const tiposIntervencao = [...new Set(evIntervencao.map(e => e.nome_evento))];
    const tiposReportar    = [...new Set(evReportar.map(e => e.nome_evento))];

    const tiposTecnico = {};
    evTecnico.forEach(e => {
      const tipo = e.nome_evento || '—';
      tiposTecnico[tipo] = (tiposTecnico[tipo] || 0) + 1;
    });

    const maxTs = arr => {
      const times = arr.map(e => e.ocorrido_em ? new Date(e.ocorrido_em).getTime() : 0).filter(Boolean);
      return times.length ? new Date(Math.max(...times)) : null;
    };

    const ultimoEvento = maxTs(evIntervencao);
    const ultimoEventoReportar = maxTs(evReportar);

    const severidadeMax = maxSeveridade(
      [...evIntervencao, ...evReportar].map(e => e.severidade)
    );

    const turnoCount = {};
    d.turnos.forEach(t => { turnoCount[t] = (turnoCount[t] || 0) + 1; });
    const turno = Object.entries(turnoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'diurno';

    const eventosDetalhados = [
      ...evIntervencao.map(e => ({ tipo: e.nome_evento || '—', bucket: 'intervencao', severidade: e.severidade || '', ts: e.ocorrido_em ? new Date(e.ocorrido_em) : null })),
      ...evReportar.map(e    => ({ tipo: e.nome_evento || '—', bucket: 'reportar',    severidade: e.severidade || '', ts: e.ocorrido_em ? new Date(e.ocorrido_em) : null })),
      ...evTecnico.map(e     => ({ tipo: e.nome_evento || '—', bucket: 'tecnico',     severidade: e.severidade || '', ts: e.ocorrido_em ? new Date(e.ocorrido_em) : null })),
    ];

    // O timestamp da carga do motorista será a data do evento mais recente para ordens operacionais
    const loadedDates = d.eventos.map(e => e.importado_em ? new Date(e.importado_em).getTime() : 0).filter(Boolean);
    const _loadedAt = loadedDates.length ? new Date(Math.max(...loadedDates)).toISOString() : d._loadedAt;

    return {
      nome:                 d.nome || d.placa,
      placa:                d.placa,
      transportadora:       d.transportadora,
      frota:                d.frota,
      turno,
      alertas:              evIntervencao.length,
      tipos:                tiposIntervencao,
      ultimoEvento,
      reportaveis:          evReportar.length,
      tiposReportar,
      ultimoEventoReportar,
      tecnicos:             evTecnico.length,
      tiposTecnico,
      severidade:           severidadeMax,
      intervencoes:         0,
      eventosDetalhados,
      _loadedAt,
      _platformId:          platformId,
    };
  });

  // 4. Aplicar filtro de histórico granular (exclusão de alertas já tratados no banco)
  const clearMap = buildClearMap(history);
  let filtradosPorHistorico = 0;

  const maxTsFromDateObj = arr => {
    const times = arr.map(e => e.ts?.getTime()).filter(Boolean);
    return times.length ? new Date(Math.max(...times)) : null;
  };

  let histFiltered = rawDrivers.map(d => {
    const clear = clearMap[d.placa] || {};
    let { alertas, tipos, ultimoEvento, reportaveis, tiposReportar, ultimoEventoReportar, tecnicos, tiposTecnico } = d;

    let eventosDetalhados = (d.eventosDetalhados || []).map(e => ({
      ...e, ts: e.ts ? new Date(e.ts) : null,
    }));

    // Filtro granular
    const evI = eventosDetalhados.filter(e => e.bucket === 'intervencao' && isAfterClear(e.ts, clear.lastIntervencao));
    const evR = eventosDetalhados.filter(e => e.bucket === 'reportar'    && isAfterClear(e.ts, clear.lastReportar));
    const evT = eventosDetalhados.filter(e => e.bucket === 'tecnico'     && isAfterClear(e.ts, clear.lastTecnico));

    filtradosPorHistorico +=
      eventosDetalhados.filter(e => e.bucket === 'intervencao').length - evI.length +
      eventosDetalhados.filter(e => e.bucket === 'reportar').length    - evR.length +
      eventosDetalhados.filter(e => e.bucket === 'tecnico').length     - evT.length;

    alertas              = evI.length;
    tipos                = [...new Set(evI.map(e => e.tipo))];
    ultimoEvento         = maxTsFromDateObj(evI);
    reportaveis          = evR.length;
    tiposReportar        = [...new Set(evR.map(e => e.tipo))];
    ultimoEventoReportar = maxTsFromDateObj(evR);
    tecnicos             = evT.length;

    const nextTiposTecnico = {};
    evT.forEach(e => {
      const t = e.tipo || '—';
      nextTiposTecnico[t] = (nextTiposTecnico[t] || 0) + 1;
    });
    tiposTecnico = nextTiposTecnico;

    eventosDetalhados    = [...evI, ...evR, ...evT];

    return {
      ...d,
      alertas,
      tipos,
      ultimoEvento,
      reportaveis,
      tiposReportar,
      ultimoEventoReportar,
      tecnicos,
      tiposTecnico,
      eventosDetalhados,
    };
  }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

  // 5. Aplicar pós-processamento da plataforma (Ex: Regra Dinon fumo no Sascar)
  let autoDescartes = [];
  if (typeof platform.postProcess === 'function') {
    const postRes = platform.postProcess(histFiltered);
    histFiltered = postRes.drivers || histFiltered;
    autoDescartes = postRes.autoDescartes || [];
  }

  // 6. Calcular SLA (slaAgeMin e slaBreached) sobre motoristas com alertas de intervenção pendentes
  const now = options.now ?? Date.now();
  const appliesBurstGate = platformId === 'maxtrack';
  const criticalAlertsCount = rules.criticalAlertsCount ?? 5;
  const slaLimitMin = rules.slaLimitMin ?? 30;
  let filtradosPorBurst = 0;

  const driversWithSla = histFiltered.map(d => {
    let { alertas, tipos, ultimoEvento, eventosDetalhados } = d;
    let slaAgeMin = 0;
    let slaBreached = false;

    if (alertas > 0) {
      const intervencaoEvs = eventosDetalhados.filter(e => e.bucket === 'intervencao' && e.ts);
      if (intervencaoEvs.length > 0) {
        const oldestTs = Math.min(...intervencaoEvs.map(e => e.ts.getTime()));
        slaAgeMin = Math.max(0, (now - oldestTs) / 60000);
        slaBreached = slaAgeMin > slaLimitMin;
      }

      // Regra de burst: um motorista só é considerado crítico (aparece na fila
      // de intervenção) quando acumula >= criticalAlertsCount alertas E o
      // último ainda está dentro da janela de slaLimitMin minutos. Depois
      // disso, sem novo evento, o burst se encerra e ele sai da fila — os
      // eventos brutos continuam intactos em driver_events/Analytics.
      const ageSinceLastMin = ultimoEvento ? (now - ultimoEvento.getTime()) / 60000 : Infinity;
      if (appliesBurstGate && (alertas < criticalAlertsCount || ageSinceLastMin > slaLimitMin)) {
        filtradosPorBurst += alertas;
        alertas = 0;
        tipos = [];
        ultimoEvento = null;
        eventosDetalhados = eventosDetalhados.filter(e => e.bucket !== 'intervencao');
        slaAgeMin = 0;
        slaBreached = false;
      }
    }

    return {
      ...d,
      alertas,
      tipos,
      ultimoEvento,
      eventosDetalhados,
      slaAgeMin,
      slaBreached,
    };
  }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

  // 7. Retornar dados agregados e estatísticas de fila
  const finalDrivers = driversWithSla;

  const stats = {
    total:                  finalDrivers.length,
    comIntervencao:         finalDrivers.filter(d => d.alertas > 0).length,
    soReportar:             finalDrivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
    soTecnico:              finalDrivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
    totalEventos,
    falsosPositivos,
    filtradosPorBurst,
    filtradosPorVelocidade,
    filtradosPorHistorico,
    autoDescartes,
  };

  return { drivers: finalDrivers, stats };
}
