import { normalizeText, normalizePlate } from '../src/modules/crosscheck/utils.js';

// Janela de tempo pra considerar que um evento MaxTrack e um evento Horizon
// são "o mesmo alerta" nas duas plataformas (mesma placa+motorista, timestamps
// próximos mas não idênticos entre as duas exportações).
const MATCH_WINDOW_HOURS = 4;

// Mapeamento confirmado em 2026-07-02 (ver docs/PLANO_AUTOMACAO_HORIZON.md,
// seção B3): decide qual das 6 opções fixas de "Intervenção" da Horizon o
// Bot_HorizonTreatment deve escolher, a partir do veredito + do texto cru
// da coluna "Motivo" da MaxTrack (lista de tags tipo
// "Fadiga Leve;Intervenção com motorista;"). Falso positivo e qualquer
// motivo não mapeado caem no fallback — decisão do usuário: a tratativa na
// Horizon é sempre "Procedente", nunca "Justificada".
export function sugerirIntervencaoHorizon(classificacao, motivoRaw) {
  const FALLBACK = 'Fadiga - Positivo - Não necessário intervenção';
  if (classificacao !== 'Positivo') return FALLBACK;

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
  return FALLBACK;
}

// Tenta achar, em driver_events(platform_id='horizon'), um par pro evento
// MaxTrack informado (mesma placa + nome normalizados, dentro da janela de
// tempo) e grava/atualiza a linha correspondente em horizon_treatment_queue.
async function matchAndUpsert(supabase, evento) {
  const centro = new Date(evento.ocorrido_em).getTime();
  const desde = new Date(centro - MATCH_WINDOW_HOURS * 3600e3).toISOString();
  const ate = new Date(centro + MATCH_WINDOW_HOURS * 3600e3).toISOString();

  const { data: candidatosHorizon, error: errBusca } = await supabase
    .from('driver_events')
    .select('id, placa, nome, analise_ia_plataforma')
    .eq('platform_id', 'horizon')
    .gte('ocorrido_em', desde)
    .lte('ocorrido_em', ate);
  if (errBusca) throw errBusca;

  const placaAlvo = normalizePlate(evento.placa);
  const nomeAlvo = normalizeText(evento.nome);
  const match = (candidatosHorizon || []).find((h) => {
    if (normalizePlate(h.placa) !== placaAlvo) return false;
    if (!nomeAlvo) return true;
    return normalizeText(h.nome) === nomeAlvo;
  });

  let status = 'no_horizon_match';
  let horizonEventId = null;
  if (match) {
    const jaTratado = match.analise_ia_plataforma && match.analise_ia_plataforma !== 'Não classificado';
    status = jaTratado ? 'already_synced' : 'pending';
    horizonEventId = match.id;
  }

  const { error: errUpsert } = await supabase.from('horizon_treatment_queue').upsert(
    {
      driver_event_id: evento.id,
      placa: evento.placa,
      nome: evento.nome,
      ocorrido_em: evento.ocorrido_em,
      classificacao: evento.analise_ia_plataforma,
      motivo_raw: evento.descricao,
      intervencao_sugerida: sugerirIntervencaoHorizon(evento.analise_ia_plataforma, evento.descricao),
      horizon_driver_event_id: horizonEventId,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'driver_event_id' },
  );
  if (errUpsert) throw errUpsert;
}

// Chamado depois de um ingest da MaxTrack: pega eventos já classificados
// (Positivo/Falso positivo) que ainda não têm linha na fila e tenta casar
// cada um com um par na Horizon.
async function processarNovosEventosMaxtrack(supabase) {
  const { data: eventos, error: errEventos } = await supabase
    .from('driver_events')
    .select('id, placa, nome, ocorrido_em, analise_ia_plataforma, descricao')
    .eq('platform_id', 'maxtrack')
    .in('analise_ia_plataforma', ['Positivo', 'Falso positivo'])
    .order('ocorrido_em', { ascending: false })
    .limit(500);
  if (errEventos) throw errEventos;
  if (!eventos?.length) return;

  const ids = eventos.map((e) => e.id);
  const { data: jaNaFila, error: errFila } = await supabase
    .from('horizon_treatment_queue')
    .select('driver_event_id')
    .in('driver_event_id', ids);
  if (errFila) throw errFila;

  const idsExistentes = new Set((jaNaFila || []).map((r) => r.driver_event_id));
  const pendentes = eventos.filter((e) => !idsExistentes.has(e.id));

  for (const evento of pendentes) {
    await matchAndUpsert(supabase, evento);
  }
}

// Chamado depois de um ingest da Horizon: novos eventos Horizon podem ser o
// par que faltava pra pendências antigas sem match — reavalia essas.
async function tentarResolverPendenciasSemMatch(supabase) {
  const { data: pendencias, error } = await supabase
    .from('horizon_treatment_queue')
    .select('driver_event_id, placa, nome, ocorrido_em, classificacao, motivo_raw')
    .eq('status', 'no_horizon_match')
    .order('ocorrido_em', { ascending: false })
    .limit(500);
  if (error) throw error;
  if (!pendencias?.length) return;

  for (const p of pendencias) {
    await matchAndUpsert(supabase, {
      id: p.driver_event_id,
      placa: p.placa,
      nome: p.nome,
      ocorrido_em: p.ocorrido_em,
      analise_ia_plataforma: p.classificacao,
      descricao: p.motivo_raw,
    });
  }
}

// Ponto de entrada chamado pelas rotas de ingest (horizon-routes.js e
// maxtrack-routes.js) logo depois de um import bem-sucedido.
export async function runAutoCrossCheck(supabase, platformId) {
  if (platformId === 'maxtrack') {
    await processarNovosEventosMaxtrack(supabase);
  } else if (platformId === 'horizon') {
    await tentarResolverPendenciasSemMatch(supabase);
  }
}
