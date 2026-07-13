import { normalizePlate } from '../src/modules/crosscheck/utils.js';

// A Horizon e a MaxTrack espelham a mesma frota. A tratativa concluída na
// MaxTrack é a fonte de verdade: todos os alertas Horizon abertos da mesma
// placa na janela temporal devem receber a mesma tratativa.
const MATCH_WINDOW_HOURS = 4;

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

async function upsertQueueItem(supabase, event, horizonEvent) {
  const alreadyTreated = horizonEvent.analise_ia_plataforma
    && horizonEvent.analise_ia_plataforma !== 'Não classificado';
  const matchKey = horizonEvent.id;
  const { data: existing, error: existingError } = await supabase
    .from('horizon_treatment_queue')
    .select('status')
    .eq('driver_event_id', event.id)
    .eq('match_key', matchKey)
    .maybeSingle();
  if (existingError) throw existingError;

  const preserveTerminalStatus = ['done', 'error'].includes(existing?.status);
  const { error } = await supabase.from('horizon_treatment_queue').upsert({
    driver_event_id: event.id,
    placa: event.placa,
    nome: event.nome,
    ocorrido_em: event.ocorrido_em,
    classificacao: event.analise_ia_plataforma,
    empresa: event.frota || null,
    motivo_raw: event.descricao,
    intervencao_sugerida: sugerirIntervencaoHorizon(event.analise_ia_plataforma, event.descricao),
    horizon_driver_event_id: horizonEvent.id,
    match_key: matchKey,
    status: preserveTerminalStatus ? existing.status : (alreadyTreated ? 'already_synced' : 'pending'),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'driver_event_id,match_key' });
  if (error) throw error;
}

// Um evento MaxTrack pode ter vários alertas Horizon da mesma placa. Todos são
// enfileirados; o robô de tratamento consome cada linha individualmente.
async function matchAndUpsert(supabase, event) {
  const center = new Date(event.ocorrido_em).getTime();
  const from = new Date(center - MATCH_WINDOW_HOURS * 3600e3).toISOString();
  const to = new Date(center + MATCH_WINDOW_HOURS * 3600e3).toISOString();
  const targetPlate = normalizePlate(event.placa);

  const { data: candidates, error: searchError } = await supabase
    .from('driver_events')
    .select('id, placa, nome, analise_ia_plataforma')
    .eq('platform_id', 'horizon')
    .gte('ocorrido_em', from)
    .lte('ocorrido_em', to);
  if (searchError) throw searchError;

  const matches = (candidates || []).filter((candidate) => normalizePlate(candidate.placa) === targetPlate);
  if (!matches.length) {
    const { error } = await supabase.from('horizon_treatment_queue').upsert({
      driver_event_id: event.id,
      placa: event.placa,
      nome: event.nome,
      ocorrido_em: event.ocorrido_em,
      classificacao: event.analise_ia_plataforma,
      empresa: event.frota || null,
      motivo_raw: event.descricao,
      intervencao_sugerida: sugerirIntervencaoHorizon(event.analise_ia_plataforma, event.descricao),
      horizon_driver_event_id: null,
      match_key: 'unmatched',
      status: 'no_horizon_match',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_event_id,match_key' });
    if (error) throw error;
    return;
  }

  // Um novo relatório Horizon pode completar uma pendência antiga.
  const { error: removeUnmatchedError } = await supabase
    .from('horizon_treatment_queue')
    .delete()
    .eq('driver_event_id', event.id)
    .eq('match_key', 'unmatched');
  if (removeUnmatchedError) throw removeUnmatchedError;

  for (const horizonEvent of matches) {
    await upsertQueueItem(supabase, event, horizonEvent);
  }
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
  const events = await recentEligibleMaxtrackEvents(supabase);
  for (const event of events) await matchAndUpsert(supabase, event);
}

async function retryUnmatchedAfterHorizonIngest(supabase) {
  const { data: pending, error } = await supabase
    .from('horizon_treatment_queue')
    .select('driver_event_id, placa, nome, ocorrido_em, classificacao, motivo_raw, empresa')
    .eq('status', 'no_horizon_match')
    .order('ocorrido_em', { ascending: false })
    .limit(500);
  if (error) throw error;

  for (const item of pending || []) {
    await matchAndUpsert(supabase, {
      id: item.driver_event_id,
      placa: item.placa,
      nome: item.nome,
      ocorrido_em: item.ocorrido_em,
      analise_ia_plataforma: item.classificacao,
      frota: item.empresa,
      descricao: item.motivo_raw,
    });
  }
}

// Called after each successful ingest. MaxTrack refreshes the recent queue;
// Horizon refreshes entries that were previously missing a matching alert.
export async function runAutoCrossCheck(supabase, platformId) {
  if (platformId === 'maxtrack') {
    await processRecentMaxtrackEvents(supabase);
  } else if (platformId === 'horizon') {
    await retryUnmatchedAfterHorizonIngest(supabase);
  }
}
