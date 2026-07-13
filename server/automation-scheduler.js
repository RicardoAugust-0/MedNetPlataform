import { buildAutomationWebhookBody } from './automation-webhook.js';

const DEFAULT_INTERVAL_MS = 30_000;
const CLAIM_LIMIT = 10;

function timeLabel(date = new Date()) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

function parseResponseBody(rawBody) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return { message: rawBody };
  }
}

async function finishClaim(supabase, claim, success, error = null) {
  const { error: finishError } = await supabase.rpc('finish_automation_schedule', {
    p_automation_id: claim.automation_id,
    p_claim_id: claim.claim_id,
    p_success: success,
    p_error: error,
  });
  if (finishError) throw finishError;
}

async function writeExecutionLog(supabase, claim, { success, duration, detail, lines }) {
  const { error } = await supabase.from('automation_logs').insert({
    automation_id: claim.automation_id,
    status: success ? 'success' : 'failure',
    duration,
    detail,
    logs: lines,
  });
  if (error) throw error;
}

export async function executeScheduledAutomation(
  supabase,
  claim,
  { fetchImpl = fetch, logger = console } = {},
) {
  const startedAt = Date.now();
  const lines = [
    {
      t: timeLabel(),
      lvl: 'info',
      m: `Execução agendada pela plataforma · prevista para ${new Date(claim.scheduled_for).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    },
    { t: timeLabel(), lvl: 'info', m: `Chamando webhook VPS: ${claim.automation_endpoint}` },
  ];

  let success = false;
  let detail = 'Falha na execução agendada';
  let errorMessage = null;

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': claim.claim_id,
    };
    if (claim.automation_token) headers.Authorization = `Bearer ${claim.automation_token}`;

    const response = await fetchImpl(claim.automation_endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildAutomationWebhookBody(claim.automation_endpoint, {
        trigger: 'agendado',
        timestamp: new Date().toISOString(),
        scheduled_for: claim.scheduled_for,
        automation_id: claim.automation_id,
        automation_name: claim.automation_name,
        idempotency_key: claim.claim_id,
      })),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = parseResponseBody(await response.text());
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `Webhook respondeu com status ${response.status}`);
    }

    success = true;
    detail = payload.detail || payload.message || 'Webhook agendado acionado com sucesso';
    lines.push({ t: timeLabel(), lvl: 'ok', m: detail });
  } catch (error) {
    errorMessage = error?.message || 'Erro desconhecido ao chamar o webhook';
    detail = errorMessage;
    lines.push({ t: timeLabel(), lvl: 'err', m: `Falha: ${errorMessage}` });
    logger.error(`[Automation Scheduler] ${claim.automation_name}:`, error);
  }

  const duration = `${((Date.now() - startedAt) / 1000).toFixed(1)} s`;
  try {
    await writeExecutionLog(supabase, claim, { success, duration, detail, lines });
  } catch (error) {
    logger.error('[Automation Scheduler] Falha ao gravar log:', error);
  }

  try {
    await finishClaim(supabase, claim, success, errorMessage);
  } catch (error) {
    // A trava expira em 10 minutos. Se a finalização falhar, a execução volta
    // a ser elegível com a mesma data prevista em vez de ficar perdida.
    logger.error('[Automation Scheduler] Falha ao finalizar agendamento:', error);
  }

  return success;
}

export async function runAutomationSchedulerTick(
  supabase,
  { fetchImpl = fetch, logger = console } = {},
) {
  const { data: claims, error } = await supabase.rpc('claim_due_automations', {
    p_limit: CLAIM_LIMIT,
  });
  if (error) throw error;
  if (!claims?.length) return 0;

  await Promise.all(
    claims.map((claim) => executeScheduledAutomation(supabase, claim, { fetchImpl, logger })),
  );
  return claims.length;
}

export function startAutomationScheduler(
  supabase,
  { enabled = true, intervalMs = DEFAULT_INTERVAL_MS, logger = console } = {},
) {
  if (!enabled) {
    logger.warn('[Automation Scheduler] Desativado: SUPABASE_SERVICE_ROLE_KEY ausente.');
    return () => {};
  }

  let running = false;
  let lastErrorAt = 0;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const count = await runAutomationSchedulerTick(supabase, { logger });
      if (count > 0) logger.log(`[Automation Scheduler] ${count} execução(ões) processada(s).`);
    } catch (error) {
      // Evita inundar os logs se a migration ainda não tiver sido aplicada.
      if (Date.now() - lastErrorAt > 5 * 60_000) {
        logger.error('[Automation Scheduler] Falha ao consultar agenda:', error);
        lastErrorAt = Date.now();
      }
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(tick, 5_000);
  const interval = setInterval(tick, intervalMs);
  initialTimer.unref?.();
  interval.unref?.();
  logger.log(`[Automation Scheduler] Ativo · verificação a cada ${Math.round(intervalMs / 1000)}s.`);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}
