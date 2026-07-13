import { normalizePlate } from '../src/modules/crosscheck/utils.js';

// A Horizon e a MaxTrack espelham a mesma frota. Uma ocorrencia Horizon pode
// receber a tratativa da ocorrencia MaxTrack mais proxima, dentro desta janela.
// O vinculo e unico pelo evento Horizon para impedir que varios alertas
// MaxTrack tentem tratar a mesma linha do portal.
const MATCH_WINDOW_HOURS = 4;
const MATCH_WINDOW_MS = MATCH_WINDOW_HOURS * 3600e3;
const PAGE_SIZE = 1000;

export function sugerirIntervencaoHorizon(classificacao, motivoRaw) {
  const fallback = 'Fadiga - Positivo - Não necessário intervenção';
  if (classificacao !== 'Positivo') return fallback;

  const motivo = (motivoRaw || '').toLowerCase();
  if (motivo.includes('intervenção com motorista') || motivo.includes('parada preventiva')) {
    return 'Fadiga - Positivo - Intervenção realizada e motorista liberado para seguir';
  }
  if (motivo.includes('intervenção já solicitada aguardando a parada')) {
    return 'Fadiga - Positivo - Tentativa de intervenção sem sucesso';
  }
  if (motivo.includes('desatenção') && !motivo.includes('fadiga')) {
    return 'Olhando para o Painel / Fora da via - Positivo - Não foi necessário intervenção';
  }
  return fallback;
}

export function isHorizonEventTreated(event) {
  const classification = event?.analise_ia_plataforma?.trim();
  return Boolean(classification && classification !== 'Não classificado');
}

export function shouldPreserveHorizonQueueItem(status) {
  return ['processing', 'done', 'already_synced', 'error'].includes(status);
}

/**
 * Atribui cada evento Horizon a somente um evento MaxTrack: o de mesma placa
 * com horario mais proximo dentro da janela. Um MaxTrack ainda pode ser fonte
 * de varios alertas Horizon, mas um alerta Horizon nunca sera tratado duas vezes.
 */
export function assignHorizonEventsToClosestMaxtrack(maxtrackEvents, horizonEvents) {
  const assignments = new Map((maxtrackEvents || []).map((event) => [event.id, []]));
  const sourcesByPlate = new Map();

  for (const source of maxtrackEvents || []) {
    const plate = normalizePlate(source.placa);
    const occurredAt = new Date(source.ocorrido_em).getTime();
    if (!plate || !Number.isFinite(occurredAt)) continue;
    if (!sourcesByPlate.has(plate)) sourcesByPlate.set(plate, []);
    sourcesByPlate.get(plate).push({ source, occurredAt });
  }

  for (const target of horizonEvents || []) {
    const plate = normalizePlate(target.placa);
    const targetOccurredAt = new Date(target.ocorrido_em).getTime();
    if (!plate || !Number.isFinite(targetOccurredAt)) continue;

    let best = null;
    for (const candidate of sourcesByPlate.get(plate) || []) {
      const diff = Math.abs(candidate.occurredAt - targetOccurredAt);
      if (diff > MATCH_WINDOW_MS) continue;

      const candidateId = String(candidate.source.id);
      const bestId = best ? String(best.source.id) : '';
      if (!best || diff < best.diff || (diff === best.diff && candidateId < bestId)) {
        best = { ...candidate, diff };
      }
    }

    if (best) assignments.get(best.source.id)?.push(target);
  }

  return assignments;
}

async function listCandidateHorizonEvents(supabase, maxtrackEvents) {
  const timestamps = (maxtrackEvents || [])
    .map((event) => new Date(event.ocorrido_em).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return [];

  const from = new Date(Math.min(...timestamps) - MATCH_WINDOW_MS).toISOString();
  const to = new Date(Math.max(...timestamps) + MATCH_WINDOW_MS).toISOString();
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('driver_events')
      .select('id, placa, nome, ocorrido_em, analise_ia_plataforma')
      .eq('platform_id', 'horizon')
      .gte('ocorrido_em', from)
      .lte('ocorrido_em', to)
      .order('ocorrido_em', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function upsertQueueItem(supabase, sourceEvent, horizonEvent) {
  const { data: existing, error: existingError } = await supabase
    .from('horizon_treatment_queue')
    .select('id, driver_event_id, status')
    .eq('horizon_driver_event_id', horizonEvent.id)
    .maybeSingle();
  if (existingError) throw existingError;

  // Claims ativos e tratativas terminais nunca sao reatribuidos. Isso mantem
  // estavel o ID entregue ao Playwright mesmo se uma importacao ocorrer no
  // meio da execucao.
  if (existing && shouldPreserveHorizonQueueItem(existing.status)) return;

  const { error } = await supabase.from('horizon_treatment_queue').upsert({
    driver_event_id: sourceEvent.id,
    placa: sourceEvent.placa,
    nome: sourceEvent.nome,
    ocorrido_em: sourceEvent.ocorrido_em,
    classificacao: sourceEvent.analise_ia_plataforma,
    empresa: sourceEvent.frota || null,
    motivo_raw: sourceEvent.descricao,
    intervencao_sugerida: sugerirIntervencaoHorizon(
      sourceEvent.analise_ia_plataforma,
      sourceEvent.descricao,
    ),
    horizon_driver_event_id: horizonEvent.id,
    match_key: horizonEvent.id,
    status: isHorizonEventTreated(horizonEvent) ? 'already_synced' : 'pending',
    erro: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'horizon_driver_event_id' });
  if (error) throw error;
}

async function removeStaleNonterminalMatches(supabase, sourceEvent, assignedTargetIds) {
  const { data, error } = await supabase
    .from('horizon_treatment_queue')
    .select('id, horizon_driver_event_id, status')
    .eq('driver_event_id', sourceEvent.id)
    .eq('status', 'pending')
    .not('horizon_driver_event_id', 'is', null);
  if (error) throw error;

  const staleIds = (data || [])
    .filter((row) => !assignedTargetIds.has(row.horizon_driver_event_id))
    .map((row) => row.id);
  if (!staleIds.length) return;

  const { error: deleteError } = await supabase
    .from('horizon_treatment_queue')
    .delete()
    .in('id', staleIds);
  if (deleteError) throw deleteError;
}

async function removeUnmatchedPlaceholder(supabase, sourceEvent) {
  const { error } = await supabase
    .from('horizon_treatment_queue')
    .delete()
    .eq('driver_event_id', sourceEvent.id)
    .eq('match_key', 'unmatched');
  if (error) throw error;
}

async function upsertUnmatchedPlaceholder(supabase, sourceEvent) {
  const { error } = await supabase.from('horizon_treatment_queue').upsert({
    driver_event_id: sourceEvent.id,
    placa: sourceEvent.placa,
    nome: sourceEvent.nome,
    ocorrido_em: sourceEvent.ocorrido_em,
    classificacao: sourceEvent.analise_ia_plataforma,
    empresa: sourceEvent.frota || null,
    motivo_raw: sourceEvent.descricao,
    intervencao_sugerida: sugerirIntervencaoHorizon(
      sourceEvent.analise_ia_plataforma,
      sourceEvent.descricao,
    ),
    horizon_driver_event_id: null,
    match_key: 'unmatched',
    status: 'no_horizon_match',
    erro: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'driver_event_id,match_key' });
  if (error) throw error;
}

async function recentEligibleMaxtrackEvents(supabase) {
  const { data, error } = await supabase
    .from('driver_events')
    .select('id, placa, nome, ocorrido_em, analise_ia_plataforma, descricao, frota')
    .eq('platform_id', 'maxtrack')
    .in('analise_ia_plataforma', ['Positivo', 'Falso positivo'])
    .order('ocorrido_em', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function processRecentMaxtrackEvents(supabase) {
  const sourceEvents = await recentEligibleMaxtrackEvents(supabase);
  if (!sourceEvents.length) return;

  const horizonEvents = await listCandidateHorizonEvents(supabase, sourceEvents);
  const assignments = assignHorizonEventsToClosestMaxtrack(sourceEvents, horizonEvents);

  // Primeiro reivindica/reatribui cada alvo Horizon. O indice unico no banco
  // garante que uma corrida concorrente tambem nao duplique a tratativa.
  for (const sourceEvent of sourceEvents) {
    for (const horizonEvent of assignments.get(sourceEvent.id) || []) {
      await upsertQueueItem(supabase, sourceEvent, horizonEvent);
    }
  }

  // Depois remove vinculos antigos e mantem o placeholder sem correspondencia
  // apenas para eventos MaxTrack que realmente nao possuem um alvo Horizon.
  for (const sourceEvent of sourceEvents) {
    const targets = assignments.get(sourceEvent.id) || [];
    const targetIds = new Set(targets.map((target) => target.id));
    await removeStaleNonterminalMatches(supabase, sourceEvent, targetIds);
    if (targets.length) {
      await removeUnmatchedPlaceholder(supabase, sourceEvent);
    } else {
      await upsertUnmatchedPlaceholder(supabase, sourceEvent);
    }
  }
}

// Reconciliacao defensiva antes de entregar a fila ao Playwright. Se um alerta
// foi tratado diretamente na Horizon entre duas importacoes, ele deixa de ser
// pending e nao sera procurado na grade de alertas abertos.
export async function reconcilePendingHorizonTreatments(supabase) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('horizon_treatment_queue')
      .select(`
        id,
        horizon_event:driver_events!horizon_treatment_queue_horizon_driver_event_id_fkey(
          analise_ia_plataforma
        )
      `)
      .eq('status', 'pending')
      .not('horizon_driver_event_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const alreadyTreatedIds = rows
    .filter((row) => isHorizonEventTreated(row.horizon_event))
    .map((row) => row.id);
  if (!alreadyTreatedIds.length) return 0;

  const { error } = await supabase
    .from('horizon_treatment_queue')
    .update({ status: 'already_synced', erro: null, updated_at: new Date().toISOString() })
    .in('id', alreadyTreatedIds);
  if (error) throw error;
  return alreadyTreatedIds.length;
}

// Tanto uma nova carga MaxTrack quanto uma nova carga Horizon podem alterar o
// melhor pareamento ou revelar que um evento ja foi tratado.
export async function runAutoCrossCheck(supabase, platformId) {
  if (platformId === 'maxtrack' || platformId === 'horizon') {
    await processRecentMaxtrackEvents(supabase);
  }
}

// Resumo operacional usado pelos logs da MaxTrack. As contagens sao feitas
// pelo banco (HEAD + count exact), sem trazer a fila inteira para o Node.
export async function getHorizonTreatmentQueueSummary(supabase) {
  const statuses = ['pending', 'processing', 'done', 'error', 'no_horizon_match'];
  const results = await Promise.all(statuses.map((status) => (
    supabase
      .from('horizon_treatment_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
  )));

  const summary = {};
  results.forEach((result, index) => {
    if (result.error) throw result.error;
    summary[statuses[index]] = result.count || 0;
  });
  return summary;
}
