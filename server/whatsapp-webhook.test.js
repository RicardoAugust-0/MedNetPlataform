import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  processWhatsappWebhook,
  recordInboundWhatsappMessage,
  verifyWhatsappSignature,
} from './whatsapp-webhook.js';

function createSupabase() {
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  const updates = [];
  const from = vi.fn((table) => ({
    update(payload) {
      updates.push({ table, payload });
      return { eq: vi.fn(async () => ({ error: null })) };
    },
  }));
  return { rpc, from, updates };
}

describe('WhatsApp webhook signature', () => {
  it('valida o HMAC SHA-256 sobre os bytes originais', () => {
    const rawBody = Buffer.from('{"entry":[]}');
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(rawBody).digest('hex')}`;
    expect(verifyWhatsappSignature(rawBody, signature, 'app-secret')).toBe(true);
    expect(verifyWhatsappSignature(rawBody, `${signature}0`, 'app-secret')).toBe(false);
    expect(verifyWhatsappSignature(Buffer.from('{"entry":[1]}'), signature, 'app-secret')).toBe(false);
    expect(verifyWhatsappSignature(rawBody, signature, '')).toBe(false);
  });
});

describe('WhatsApp webhook processing', () => {
  it('processa todas as mensagens e statuses e deduplica IDs no mesmo payload', async () => {
    const supabase = createSupabase();
    const payload = {
      entry: [
        {
          changes: [{
            value: {
              contacts: [{ wa_id: '5511999999999', profile: { name: 'Pessoa A' } }],
              messages: [
                { id: 'wamid.1', from: '5511999999999', timestamp: '1784214000', type: 'text', text: { body: 'Oi' } },
                { id: 'wamid.2', from: '5511999999999', timestamp: '1784214001', type: 'image' },
                { id: 'wamid.1', from: '5511999999999', timestamp: '1784214000', type: 'text', text: { body: 'duplicada' } },
              ],
              statuses: [
                { id: 'wamid.out.1', status: 'delivered' },
                { id: 'wamid.out.2', status: 'failed', errors: [{ message: 'Falha' }] },
              ],
            },
          }],
        },
        {
          changes: [{
            value: {
              statuses: [{ id: 'wamid.out.1', status: 'delivered' }],
            },
          }],
        },
      ],
    };

    await expect(processWhatsappWebhook(supabase, payload)).resolves.toEqual({
      messagesProcessed: 2,
      statusesProcessed: 2,
      ignored: 2,
    });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledWith('record_whatsapp_inbound_message', expect.objectContaining({
      p_phone: '5511999999999',
      p_message_id: 'wamid.1',
      p_body: 'Oi',
    }));
    expect(supabase.updates).toEqual([
      { table: 'whatsapp_dispatches', payload: { status: 'delivered' } },
      { table: 'whatsapp_messages', payload: { status: 'delivered' } },
      { table: 'whatsapp_dispatches', payload: { status: 'failed', error_message: 'Falha' } },
      { table: 'whatsapp_messages', payload: { status: 'failed', error_message: 'Falha' } },
    ]);
  });

  it('delega idempotencia e incremento atomico a RPC transacional', async () => {
    const supabase = createSupabase();
    await recordInboundWhatsappMessage(supabase, {
      id: 'wamid.3',
      from: '5511888888888',
      timestamp: '1784214000',
      type: 'text',
      text: { body: 'mensagem' },
    });
    expect(supabase.rpc).toHaveBeenCalledWith('record_whatsapp_inbound_message', {
      p_phone: '5511888888888',
      p_name: 'Contato WhatsApp',
      p_message_id: 'wamid.3',
      p_body: 'mensagem',
      p_created_at: '2026-07-16T15:00:00.000Z',
    });
  });

  it('propaga falha da RPC para permitir retry da Meta', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ error: new Error('database offline') })),
    };
    await expect(recordInboundWhatsappMessage(supabase, {
      id: 'wamid.4',
      from: '5511888888888',
      timestamp: '1784214000',
      type: 'text',
      text: { body: 'mensagem' },
    })).rejects.toThrow('database offline');
  });
});
