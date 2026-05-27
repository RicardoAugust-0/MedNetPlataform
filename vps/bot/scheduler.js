/**
 * scheduler.js — loop principal do robô.
 *
 * Lê rpa_config a cada minuto e dispara o bot quando o intervalo configurado
 * pelo Admin for atingido. Atualiza last_run_* no Supabase após cada ciclo.
 */

import { createClient } from '@supabase/supabase-js';
import { downloadReport } from './maxtrack.js';
import { writeEvents, updateRpaStatus } from './writer.js';

// O parser da Maxtrack roda em Node — importado do frontend via cópia ou symlink.
// TODO: extrair src/platforms/maxtrack/parser.js para um pacote compartilhado
// e importar aqui. Por ora, use um parser-bridge simples:
import { parseCsv } from './parser-bridge.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

let lastRunAt = null; // ISO string da última execução bem-sucedida

async function getConfig() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'rpa_config')
    .single();
  return data?.value || {};
}

async function runCycle() {
  console.log(`[${new Date().toISOString()}] Iniciando ciclo RPA Maxtrack…`);
  await updateRpaStatus('running');

  try {
    const csvContent = await downloadReport();
    const { rawEventRows } = await parseCsv(csvContent);
    const { inserted, skipped } = await writeEvents(rawEventRows);

    const msg = `${inserted} evento(s) inserido(s), ${skipped} ignorado(s) (sem timestamp ou duplicata)`;
    console.log('[RPA]', msg);
    await updateRpaStatus('success', msg);
    lastRunAt = new Date().toISOString();
  } catch (err) {
    console.error('[RPA] Erro:', err.message);
    await updateRpaStatus('error', err.message);
  }
}

export async function start() {
  console.log('[Scheduler] Iniciado. Verificando rpa_config a cada 60s…');

  const tick = async () => {
    const config = await getConfig();

    if (!config.enabled) return; // robô desativado pelo Admin

    const intervalMs = (config.interval_minutes || 30) * 60 * 1000;
    const sinceLastRun = lastRunAt
      ? Date.now() - new Date(lastRunAt).getTime()
      : Infinity;

    if (sinceLastRun >= intervalMs) {
      await runCycle();
    }
  };

  // Executa imediatamente no boot, depois a cada minuto
  await tick();
  setInterval(tick, 60 * 1000);
}
