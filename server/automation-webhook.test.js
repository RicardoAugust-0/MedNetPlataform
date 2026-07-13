import { describe, expect, it } from 'vitest';
import { buildAutomationWebhookBody } from './automation-webhook.js';

describe('buildAutomationWebhookBody', () => {
  const metadata = { trigger: 'agendado', automation_id: '123' };

  it('não repassa metadados como kwargs aos robôs Playwright', () => {
    expect(buildAutomationWebhookBody(
      'https://botsplaywright.duckdns.org/automacoes/BOT_HorizonTratamento?background=true',
      metadata,
    )).toEqual({});
  });

  it('preserva metadados para webhooks genéricos', () => {
    expect(buildAutomationWebhookBody('https://example.com/webhook', metadata)).toEqual(metadata);
  });
});
