import { requireRole } from './analytics-routes.js';
import { buildAutomationWebhookBody } from './automation-webhook.js';
import { requireHorizonBotToken } from './horizon-routes.js';

export const BOT_ACTIVITY_AUTOMATIONS = {
  horizon_treatment: 'f0a94e82-e3e7-4c74-bfd4-3a56df93df27',
  maxtrack_scraping: 'a1b94e82-e3e7-4c74-bfd4-3a56df93df28',
};

const ACTIVITY_PHASE_STATUS = {
  started: 'running',
  progress: 'running',
  success: 'success',
  failure: 'failure',
};

function timeLabel(date = new Date()) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

export function normalizeBotActivity(body = {}) {
  const automationId = BOT_ACTIVITY_AUTOMATIONS[body.automation_key];
  const status = ACTIVITY_PHASE_STATUS[body.phase];
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
  const duration = typeof body.duration === 'string' ? body.duration.trim().slice(0, 40) : null;
  const logId = typeof body.log_id === 'string' ? body.log_id.trim() : null;

  if (!automationId || !status || !message) return null;
  return {
    automationId,
    status,
    message,
    duration,
    logId,
    line: {
      t: timeLabel(),
      lvl: status === 'failure' ? 'err' : (status === 'success' ? 'ok' : 'info'),
      m: message,
    },
  };
}

async function writeBotActivity(supabase, activity) {
  if (!activity.logId) {
    const { data, error } = await supabase
      .from('automation_logs')
      .insert({
        automation_id: activity.automationId,
        status: activity.status,
        duration: activity.duration,
        detail: activity.message,
        logs: [activity.line],
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data: current, error: readError } = await supabase
    .from('automation_logs')
    .select('logs')
    .eq('id', activity.logId)
    .eq('automation_id', activity.automationId)
    .maybeSingle();
  if (readError) throw readError;

  // Se o robô reiniciar e perder o log original, ainda registra o resultado
  // como uma nova execução em vez de descartar a confirmação.
  if (!current) return writeBotActivity(supabase, { ...activity, logId: null });

  const previousLines = Array.isArray(current.logs) ? current.logs : [];
  const { error: updateError } = await supabase
    .from('automation_logs')
    .update({
      status: activity.status,
      duration: activity.duration,
      detail: activity.message,
      logs: [...previousLines, activity.line].slice(-20),
    })
    .eq('id', activity.logId)
    .eq('automation_id', activity.automationId);
  if (updateError) throw updateError;
  return activity.logId;
}

// Dispara webhooks pelo backend para que tokens de automação não sejam
// expostos ao navegador e para eliminar a dependência de CORS do n8n/VPS.
export function registerAutomationRoutes(app, supabase) {
  // Callback máquina-a-máquina: o próprio Playwright confirma o começo e o
  // resultado real. O aceite do webhook/n8n, sozinho, não prova que o portal
  // foi acessado nem que um alerta foi tratado.
  app.post('/api/automations/activity', requireHorizonBotToken, async (req, res) => {
    try {
      const activity = normalizeBotActivity(req.body);
      if (!activity) {
        return res.status(400).json({
          error: 'automation_key, phase (started|progress|success|failure) e message são obrigatórios.',
        });
      }

      const logId = await writeBotActivity(supabase, activity);
      return res.status(200).json({ success: true, log_id: logId });
    } catch (err) {
      console.error('[Automation Activity] Erro:', err);
      return res.status(500).json({ error: err.message || String(err) });
    }
  });

  app.post('/api/automations/:id/run', requireRole(supabase, 'lider'), async (req, res) => {
    try {
      const { id } = req.params;
      const { data: automation, error } = await supabase
        .from('automations')
        .select('id, name, active, endpoint, token')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!automation) return res.status(404).json({ error: 'Automação não encontrada.' });
      if (!automation.active) return res.status(409).json({ error: 'Automação está desativada.' });
      if (!automation.endpoint) return res.status(422).json({ error: 'Endpoint da automação não configurado.' });

      const headers = { 'Content-Type': 'application/json' };
      if (automation.token) headers.Authorization = `Bearer ${automation.token}`;

      const response = await fetch(automation.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildAutomationWebhookBody(automation.endpoint, {
          trigger: 'manual',
          operator: req.authUser.email,
          timestamp: new Date().toISOString(),
          automation_id: automation.id,
          automation_name: automation.name,
        })),
        signal: AbortSignal.timeout(15000),
      });

      const rawBody = await response.text();
      let payload = {};
      try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch { payload = { message: rawBody }; }

      if (!response.ok) {
        return res.status(502).json({
          error: `Webhook respondeu com status ${response.status}.`,
          detail: payload.error || payload.message || null,
        });
      }

      return res.status(200).json({
        message: payload.message || 'Webhook executado com sucesso',
        detail: payload.detail,
      });
    } catch (err) {
      console.error('[Automation Run] Erro ao disparar webhook:', err);
      return res.status(502).json({ error: 'Não foi possível acionar o webhook da automação.' });
    }
  });
}
