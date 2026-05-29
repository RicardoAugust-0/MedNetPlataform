/**
 * scheduler.js — loop principal do robô.
 *
 * Lê rpa_config a cada 30 segundos e dispara os scrapings:
 *   - Alertas Abertos: Roda a cada 2 minutos (frequência alta para a fila do operador).
 *   - Alertas Fechados: Roda a cada 10 minutos (ou o configurado no Admin).
 *
 * Atualiza last_run_* no Supabase após cada ciclo.
 */

import { createClient } from '@supabase/supabase-js';
import { downloadReport } from './maxtrack.js';
import { writeEvents, updateRpaStatus } from './writer.js';
import { parseCsv } from './parser-bridge.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

let lastRunAbertosAt = null;
let lastRunFechadosAt = null;
let isRunningAbertos = false;
let isRunningFechados = false;

async function getConfig() {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'rpa_config')
      .single();
    return data?.value || {};
  } catch (err) {
    console.error('[Scheduler] Erro ao buscar configuração:', err.message);
    return {};
  }
}

async function runAbertosCycle() {
  if (isRunningAbertos) return;
  isRunningAbertos = true;
  
  console.log(`[${new Date().toISOString()}] Iniciando ciclo RPA Maxtrack (Abertos)…`);
  await updateRpaStatus('running', 'Processando alertas abertos...');

  try {
    const csvContent = await downloadReport('abertos');
    const { rawEventRows } = await parseCsv(csvContent);
    const { inserted, skipped } = await writeEvents(rawEventRows);

    const msg = `Abertos: ${inserted} evento(s) inserido(s), ${skipped} ignorado(s)`;
    console.log('[RPA-Abertos]', msg);
    await updateRpaStatus('success', msg);
    lastRunAbertosAt = new Date().toISOString();
  } catch (err) {
    console.error('[RPA-Abertos] Erro:', err.message);
    await updateRpaStatus('error', `Abertos falhou: ${err.message}`);
  } finally {
    isRunningAbertos = false;
  }
}

async function runFechadosCycle() {
  if (isRunningFechados) return;
  isRunningFechados = true;
  
  console.log(`[${new Date().toISOString()}] Iniciando ciclo RPA Maxtrack (Fechados)…`);
  await updateRpaStatus('running', 'Processando alertas fechados...');

  try {
    const csvContent = await downloadReport('fechados');
    const { rawEventRows } = await parseCsv(csvContent);
    const { inserted, skipped } = await writeEvents(rawEventRows);

    const msg = `Fechados: ${inserted} evento(s) inserido(s), ${skipped} ignorado(s)`;
    console.log('[RPA-Fechados]', msg);
    await updateRpaStatus('success', msg);
    lastRunFechadosAt = new Date().toISOString();
  } catch (err) {
    console.error('[RPA-Fechados] Erro:', err.message);
    await updateRpaStatus('error', `Fechados falhou: ${err.message}`);
  } finally {
    isRunningFechados = false;
  }
}

export async function start() {
  console.log('[Scheduler] Iniciado. Monitorando rpa_config a cada 30 segundos...');

  const tick = async () => {
    const config = await getConfig();

    if (!config.enabled) {
      return; // robô desativado pelo painel administrativo
    }

    const intervalAbertosMs = 2 * 60 * 1000; // Alertas abertos fixado em 2 minutos para alta reatividade
    const intervalFechadosMs = (config.interval_minutes || 10) * 60 * 1000; // Alertas fechados configurável (padrão 10m)

    const sinceLastAbertos = lastRunAbertosAt
      ? Date.now() - new Date(lastRunAbertosAt).getTime()
      : Infinity;

    const sinceLastFechados = lastRunFechadosAt
      ? Date.now() - new Date(lastRunFechadosAt).getTime()
      : Infinity;

    // Dispara o ciclo de abertos
    if (sinceLastAbertos >= intervalAbertosMs && !isRunningAbertos) {
      await runAbertosCycle();
    }

    // Dispara o ciclo de fechados, contanto que não corram em paralelo exato
    if (sinceLastFechados >= intervalFechadosMs && !isRunningFechados && !isRunningAbertos) {
      await runFechadosCycle();
    }
  };

  // Executa o tick inicial imediatamente, depois roda a cada 30 segundos
  await tick();
  setInterval(tick, 30 * 1000);
}
