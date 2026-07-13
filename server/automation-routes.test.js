import { describe, expect, it } from 'vitest';
import { BOT_ACTIVITY_AUTOMATIONS, normalizeBotActivity } from './automation-routes.js';

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
