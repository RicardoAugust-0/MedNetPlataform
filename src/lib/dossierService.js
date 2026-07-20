import { supabase } from '../supabase.js';

const HEALTH_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEALTH_FIELDS = new Set([
  'motorista_nome',
  'escala_epworth',
  'polissonografia',
  'historico_clinico',
  'ultimo_exame_em',
  'placa',
  'transportadora',
  'frota',
  'turno',
  'cpf',
  'rg',
  'data_nascimento',
  'cnh_numero',
  'cnh_categoria',
  'cnh_validade',
  'updated_at',
]);

function cleanText(value) {
  const cleaned = String(value ?? '').trim();
  return cleaned || null;
}

export function normalizeDossierName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function normalizeDossierPlate(value) {
  return String(value ?? '').replace(/[^\p{L}\p{N}]+/gu, '').toLocaleUpperCase('pt-BR');
}

export function buildDossierIdentityParams(driver) {
  const healthId = cleanText(driver?.healthId ?? driver?.driver_health_id);
  const motoristaNome = cleanText(driver?.nome ?? driver?.motorista_nome);
  const placa = cleanText(driver?.placa);

  if (healthId && !HEALTH_ID_RE.test(healthId)) {
    throw new Error('Identificador de prontuário inválido');
  }
  if (!healthId && !motoristaNome) {
    throw new Error('Motorista sem identidade para consulta');
  }

  return {
    p_driver_health_id: healthId,
    p_motorista_nome: motoristaNome,
    p_placa: placa,
  };
}

export function mapDossierDriver(row) {
  return {
    healthId: row.driver_health_id || null,
    identityKey: row.identity_key,
    nome: row.nome,
    placa: row.placa || '',
    transportadora: row.transportadora || '—',
    frota: row.frota || '',
    turno: row.turno || 'diurno',
    hasHealthRecord: Boolean(row.has_health_record),
  };
}

export async function listDossierDrivers({ search = null, limit = 500, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('list_dossier_drivers', {
    p_search: cleanText(search),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data || []).map(mapDossierDriver);
}

export async function getDossierDriver(driver, {
  eventLimit = 200,
  atendimentoLimit = 100,
  since = null,
} = {}) {
  const { data, error } = await supabase.rpc('get_dossier_driver', {
    ...buildDossierIdentityParams(driver),
    p_event_limit: eventLimit,
    p_atendimento_limit: atendimentoLimit,
    p_since: since,
  });
  if (error) throw error;
  return data;
}

function sanitizeHealthPatch(patch) {
  return Object.fromEntries(
    Object.entries(patch || {}).filter(([key]) => HEALTH_FIELDS.has(key)),
  );
}

export async function saveDossierDriverHealth(driver, patch) {
  const identity = buildDossierIdentityParams(driver);
  const payload = sanitizeHealthPatch({
    ...patch,
    motorista_nome: cleanText(patch?.motorista_nome) || identity.p_motorista_nome,
    placa: cleanText(patch?.placa) ?? identity.p_placa,
    updated_at: patch?.updated_at || new Date().toISOString(),
  });

  let query;
  if (identity.p_driver_health_id) {
    query = supabase
      .from('driver_health')
      .update(payload)
      .eq('id', identity.p_driver_health_id);
  } else {
    query = supabase
      .from('driver_health')
      .upsert(payload, { onConflict: 'motorista_nome_normalizado,placa_normalizada' });
  }

  const { data, error } = await query
    .select('id, motorista_nome, placa, transportadora, frota, turno')
    .single();
  if (error) throw error;
  return data;
}
