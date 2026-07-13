import { describe, expect, it } from 'vitest';
import { buildAutomationWebhookBody, isPlaywrightAutomationEndpoint } from './automation-webhook.js';

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

  it('identifica apenas endpoints do orquestrador Playwright', () => {
    expect(isPlaywrightAutomationEndpoint('https://botsplaywright.duckdns.org/automacoes/BOT_MaxtrackRelatorios?background=true')).toBe(true);
    expect(isPlaywrightAutomationEndpoint('https://example.com/automacoes/bot')).toBe(false);
  });
});
