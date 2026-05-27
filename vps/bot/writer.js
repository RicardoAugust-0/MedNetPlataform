/**
 * writer.js — escreve eventos no Supabase via service_role.
 *
 * Recebe rawEventRows (gerados por parser.js da Maxtrack) e:
 *   1. Insere em driver_events com ON CONFLICT DO NOTHING (deduplicação automática).
 *   2. Atualiza rpa_config.last_run_* em app_settings para o painel Admin.
 *
 * Dependências: SUPABASE_URL e SUPABASE_SERVICE_KEY em .env
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY, // service_role bypassa RLS
);

/**
 * Insere linhas em driver_events.
 * Rows sem ocorrido_em são descartadas silenciosamente.
 *
 * @param {Array} rawEventRows — saída de parser.parse().rawEventRows
 * @returns {{ inserted: number, skipped: number }}
 */
export async function writeEvents(rawEventRows) {
  const valid = rawEventRows.filter(r => r.ocorrido_em);
  if (valid.length === 0) return { inserted: 0, skipped: rawEventRows.length };

  const { error, count } = await supabase
    .from('driver_events')
    .upsert(valid, {
      onConflict: 'platform_id,placa,ocorrido_em,nome_evento',
      ignoreDuplicates: true,
      count: 'exact',
    });

  if (error) throw new Error('writeEvents: ' + error.message);

  return { inserted: count ?? valid.length, skipped: rawEventRows.length - valid.length };
}

/**
 * Atualiza last_run_* em app_settings sem sobrescrever enabled/interval_minutes.
 *
 * @param {'success'|'error'|'running'} status
 * @param {string|null} message — mensagem de erro (ou null)
 */
export async function updateRpaStatus(status, message = null) {
  const { data, error: fetchErr } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'rpa_config')
    .single();

  if (fetchErr) throw new Error('updateRpaStatus (fetch): ' + fetchErr.message);

  const next = {
    ...(data?.value || {}),
    last_run_at:      new Date().toISOString(),
    last_run_status:  status,
    last_run_message: message,
  };

  const { error: updateErr } = await supabase
    .from('app_settings')
    .update({ value: next, updated_at: new Date().toISOString() })
    .eq('key', 'rpa_config');

  if (updateErr) throw new Error('updateRpaStatus (update): ' + updateErr.message);
}
