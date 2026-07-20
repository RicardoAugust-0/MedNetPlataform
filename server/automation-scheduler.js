import { createHash } from 'node:crypto';
import { buildAutomationWebhookBody, isPlaywrightAutomationEndpoint } from './automation-webhook.js';
import { retryTransientFetch } from './transient-retry.js';
import { fetchAutomationWebhook, validateAutomationEndpoint } from './security.js';

const DEFAULT_INTERVAL_MS = 30_000;
const CLAIM_LIMIT = 10;
const WEBHOOK_MAX_ATTEMPTS = 3;
const WEBHOOK_TIMEOUT_MS = 15_000;
const WEBHOOK_RETRY_BASE_DELAY_MS = 5_000;
const WEBHOOK_MAX_RETRY_AFTER_MS = 30_000;
const SCHEDULER_DB_TIMEOUT_MS = 15_000;
const RETRYABLE_WEBHOOK_STATUSES = new Set([425, 429]);

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

export function buildAutomationDispatchKey(claim) {
  const scheduledFor = new Date(claim.scheduled_for).toISOString();
  return createHash('sha256')
    .update(`${claim.automation_id}|${scheduledFor}`)
    .digest('hex');
}

function webhookErrorMessage(error) {
  const message = error?.message || 'Erro desconhecido ao chamar o webhook';
  const causeCode = error?.cause?.code;
  const formatted = causeCode && !message.includes(causeCode) ? `${message} (${causeCode})` : message;
  const uncertainDelivery = error?.requestOutcomeUnknown
    || (error?.requestMayHaveBeenSent && !error?.httpStatus);
  return uncertainDelivery
    ? `${formatted}. Resultado do envio incerto; nova tentativa bloqueada para evitar duplicidade.`
    : formatted;
}

function parseRetryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), WEBHOOK_MAX_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return 0;
  return Math.min(Math.max(0, dateMs - now), WEBHOOK_MAX_RETRY_AFTER_MS);
}

function createWebhookTimeoutError() {
  const error = new Error('The operation was aborted due to timeout');
  error.name = 'TimeoutError';
  error.code = 'ETIMEDOUT';
  error.requestOutcomeUnknown = true;
  return error;
}

async function withAbortableDeadline(operation, timeoutMs, createTimeoutError) {
  const controller = new AbortController();
  let timer;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = createTimeoutError();
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function withWebhookDeadline(operation, timeoutMs) {
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : WEBHOOK_TIMEOUT_MS;
  return withAbortableDeadline(operation, boundedTimeoutMs, createWebhookTimeoutError);
}

function withSchedulerDbDeadline(label, operation, timeoutMs) {
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : SCHEDULER_DB_TIMEOUT_MS;
  return withAbortableDeadline(operation, boundedTimeoutMs, () => {
    const error = new Error(`${label} excedeu o limite de tempo.`);
    error.name = 'TimeoutError';
    error.code = 'ETIMEDOUT';
    return error;
  });
}

function abortablePostgrest(query, signal) {
  return typeof query?.abortSignal === 'function' ? query.abortSignal(signal) : query;
}

export function isRetryableWebhookError(error) {
  if (error?.retrySafe === true) return true;
  if (error?.requestOutcomeUnknown || error?.requestMayHaveBeenSent) return false;
  const preSendTransportFailure = /UND_ERR_CONNECT_TIMEOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH/i
    .test(`${error?.message || ''} ${error?.code || ''} ${error?.cause?.code || ''}`);
  return preSendTransportFailure
    || RETRYABLE_WEBHOOK_STATUSES.has(error?.httpStatus);
}

async function finishClaim(supabase, claim, success, error = null, dbTimeoutMs = SCHEDULER_DB_TIMEOUT_MS) {
  const { data: finished, error: finishError } = await withSchedulerDbDeadline(
    'Finalizacao do agendamento',
    (signal) => abortablePostgrest(supabase.rpc('finish_automation_schedule', {
      p_automation_id: claim.automation_id,
      p_claim_id: claim.claim_id,
      p_success: success,
      p_error: error,
    }), signal),
    dbTimeoutMs,
  );
  if (finishError) throw finishError;
  if (finished !== true) {
    const fencingError = new Error('Finalizacao recusada: a claim nao pertence mais a esta instancia.');
    fencingError.code = 'AUTOMATION_CLAIM_OWNERSHIP_LOST';
    throw fencingError;
  }
}

async function writeExecutionLog(
  supabase,
  claim,
  { success, duration, detail, lines },
  dbTimeoutMs = SCHEDULER_DB_TIMEOUT_MS,
) {
  const { error } = await withSchedulerDbDeadline(
    'Gravacao do log da automacao',
    (signal) => abortablePostgrest(supabase.from('automation_logs').insert({
      automation_id: claim.automation_id,
      status: success ? 'success' : 'failure',
      duration,
      detail,
      logs: lines,
    }), signal),
    dbTimeoutMs,
  );
  if (error) throw error;
}

export async function executeScheduledAutomation(
  supabase,
  claim,
  {
    fetchImpl = fetch,
    endpointValidator = validateAutomationEndpoint,
    logger = console,
    schedulerDbTimeoutMs = SCHEDULER_DB_TIMEOUT_MS,
    webhookRetryBaseDelayMs = WEBHOOK_RETRY_BASE_DELAY_MS,
    webhookTimeoutMs = WEBHOOK_TIMEOUT_MS,
  } = {},
) {
  const startedAt = Date.now();
  const lines = [
    {
      t: timeLabel(),
      lvl: 'info',
      m: `Execução agendada pela plataforma · prevista para ${new Date(claim.scheduled_for).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    },
    { t: timeLabel(), lvl: 'info', m: 'Chamando webhook VPS configurado.' },
  ];

  let success = false;
  let detail = 'Falha na execução agendada';
  let errorMessage = null;
  let webhookAttempts = 0;

  try {
    const dispatchKey = buildAutomationDispatchKey(claim);
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': dispatchKey,
    };
    if (claim.automation_token) headers.Authorization = `Bearer ${claim.automation_token}`;

    // A chave deriva da automação + horário previsto, então permanece igual até
    // se a lease expirar e o banco gerar outra claim. Ela é defesa adicional,
    // não garantia: o receptor ainda precisa deduplicá-la persistentemente.
    const body = JSON.stringify(buildAutomationWebhookBody(claim.automation_endpoint, {
      trigger: 'agendado',
      timestamp: new Date().toISOString(),
      scheduled_for: claim.scheduled_for,
      automation_id: claim.automation_id,
      automation_name: claim.automation_name,
      idempotency_key: dispatchKey,
    }));

    const { payload } = await retryTransientFetch(() => withWebhookDeadline(async (signal) => {
      webhookAttempts += 1;
      const response = await fetchAutomationWebhook(claim.automation_endpoint, {
        method: 'POST',
        headers,
        body,
        signal,
      }, {
        fetchImpl,
        validateEndpoint: endpointValidator,
      });

      const responsePayload = parseResponseBody(await response.text());
      if (!response.ok) {
        const responseMessage = responsePayload.error || responsePayload.message || 'Resposta sem detalhes';
        const error = new Error(`Webhook respondeu HTTP ${response.status}: ${responseMessage}`);
        error.httpStatus = response.status;
        error.retryAfterMs = parseRetryAfterMs(response.headers?.get?.('retry-after'));
        error.requestMayHaveBeenSent = true;
        error.retrySafe = RETRYABLE_WEBHOOK_STATUSES.has(response.status)
          || (response.status === 503 && responseMessage.trim().toLowerCase() === 'no available server');
        throw error;
      }
      return { payload: responsePayload };
    }, webhookTimeoutMs), {
      label: `Webhook ${claim.automation_name}`,
      maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      baseDelayMs: webhookRetryBaseDelayMs,
      logger,
      shouldRetry: isRetryableWebhookError,
      onRetry: ({ error, attempt, maxAttempts, delayMs }) => {
        lines.push({
          t: timeLabel(),
          lvl: 'warn',
          m: `Tentativa ${attempt}/${maxAttempts} falhou: ${webhookErrorMessage(error)}. Nova tentativa em ${(delayMs / 1000).toFixed(1)}s.`,
        });
      },
    });

    success = true;
    detail = payload.detail || payload.message || 'Webhook agendado acionado com sucesso';
    if (webhookAttempts > 1) {
      lines.push({
        t: timeLabel(),
        lvl: 'ok',
        m: `Webhook confirmado na tentativa ${webhookAttempts}/${WEBHOOK_MAX_ATTEMPTS}.`,
      });
    }
    lines.push({ t: timeLabel(), lvl: 'ok', m: detail });
  } catch (error) {
    const baseErrorMessage = webhookErrorMessage(error);
    errorMessage = webhookAttempts > 1
      ? `${baseErrorMessage} após ${webhookAttempts} tentativas`
      : baseErrorMessage;
    detail = errorMessage;
    lines.push({ t: timeLabel(), lvl: 'err', m: `Falha: ${errorMessage}` });
    logger.error(`[Automation Scheduler] ${claim.automation_name}:`, error);
  }

  const duration = `${((Date.now() - startedAt) / 1000).toFixed(1)} s`;
  // Nos bots Playwright, HTTP 200 significa apenas "tarefa aceita". O próprio
  // robô grava o ciclo real via /api/automations/activity; registrar sucesso
  // aqui criaria uma confirmação falsa antes de acessar Horizon/MaxTrack.
  if (!success || !isPlaywrightAutomationEndpoint(claim.automation_endpoint)) {
    try {
      await writeExecutionLog(
        supabase,
        claim,
        { success, duration, detail, lines },
        schedulerDbTimeoutMs,
      );
    } catch (error) {
      logger.error('[Automation Scheduler] Falha ao gravar log:', error);
    }
  }

  try {
    await finishClaim(supabase, claim, success, errorMessage, schedulerDbTimeoutMs);
  } catch (error) {
    // A trava expira em 10 minutos. Se a finalização falhar, a execução volta
    // a ser elegível com a mesma data prevista em vez de ficar perdida.
    logger.error('[Automation Scheduler] Falha ao finalizar agendamento:', error);
  }

  return success;
}

export async function runAutomationSchedulerTick(
  supabase,
  {
    fetchImpl = fetch,
    endpointValidator = validateAutomationEndpoint,
    logger = console,
    schedulerDbTimeoutMs = SCHEDULER_DB_TIMEOUT_MS,
    webhookRetryBaseDelayMs = WEBHOOK_RETRY_BASE_DELAY_MS,
    webhookTimeoutMs = WEBHOOK_TIMEOUT_MS,
  } = {},
) {
  const { data: claims, error } = await withSchedulerDbDeadline(
    'Reivindicacao dos agendamentos',
    (signal) => abortablePostgrest(supabase.rpc('claim_due_automations', {
      p_limit: CLAIM_LIMIT,
    }), signal),
    schedulerDbTimeoutMs,
  );
  if (error) throw error;
  if (!claims?.length) return 0;

  await Promise.all(
    claims.map((claim) => executeScheduledAutomation(supabase, claim, {
      fetchImpl,
      endpointValidator,
      logger,
      schedulerDbTimeoutMs,
      webhookRetryBaseDelayMs,
      webhookTimeoutMs,
    })),
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
