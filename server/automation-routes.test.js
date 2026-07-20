import { describe, expect, it, vi } from 'vitest';
import { BOT_ACTIVITY_AUTOMATIONS, normalizeBotActivity, registerAutomationRoutes } from './automation-routes.js';

describe('normalizeBotActivity', () => {
  it('mapeia a execução real do tratamento Horizon', () => {
    expect(normalizeBotActivity({
      automation_key: 'horizon_treatment',
      phase: 'started',
      message: 'Consultando a fila.',
    })).toEqual(expect.objectContaining({
      automationId: BOT_ACTIVITY_AUTOMATIONS.horizon_treatment,
      status: 'running',
      message: 'Consultando a fila.',
    }));
  });

  it('mapeia o resultado real da extração MaxTrack', () => {
    expect(normalizeBotActivity({
      automation_key: 'maxtrack_scraping',
      phase: 'success',
      message: '12 eventos importados.',
      log_id: 'abc',
    })).toEqual(expect.objectContaining({
      automationId: BOT_ACTIVITY_AUTOMATIONS.maxtrack_scraping,
      status: 'success',
      logId: 'abc',
    }));
  });

  it('recusa automação, fase ou mensagem desconhecida', () => {
    expect(normalizeBotActivity({ automation_key: 'outra', phase: 'success', message: 'ok' })).toBeNull();
    expect(normalizeBotActivity({ automation_key: 'horizon_treatment', phase: 'done', message: 'ok' })).toBeNull();
    expect(normalizeBotActivity({ automation_key: 'horizon_treatment', phase: 'success' })).toBeNull();
  });
});

describe('manual automation endpoint security', () => {
  it('bloqueia SSRF antes de chamar fetch', async () => {
    const routes = new Map();
    const app = {
      post(path, ...handlers) { routes.set(path, handlers); },
    };
    const automation = {
      id: 'a1b94e82-e3e7-4c74-bfd4-3a56df93df28',
      name: 'insegura',
      active: true,
      endpoint: 'http://127.0.0.1/admin',
      token: 'secret',
    };
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: automation, error: null }) }),
        }),
      }),
    };
    registerAutomationRoutes(app, supabase);
    const handler = routes.get('/api/automations/:id/run').at(-1);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = {
      status: vi.fn(),
      json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);

    await handler({ params: { id: automation.id }, authUser: { email: 'lider@example.com' } }, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
