import { requireRole } from './analytics-routes.js';
import { buildAutomationWebhookBody } from './automation-webhook.js';

// Dispara webhooks pelo backend para que tokens de automação não sejam
// expostos ao navegador e para eliminar a dependência de CORS do n8n/VPS.
export function registerAutomationRoutes(app, supabase) {
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
