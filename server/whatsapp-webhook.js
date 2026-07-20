import { createHmac } from 'node:crypto';
import { safeSecretEqual } from './security.js';

const MAX_PHONE_LENGTH = 20;
const MAX_NAME_LENGTH = 200;
const MAX_MESSAGE_ID_LENGTH = 255;
const MAX_MESSAGE_BODY_LENGTH = 4096;

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function messageBody(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '[Mensagem interativa]';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title
      || message.interactive?.list_reply?.title
      || '[Mensagem interativa]';
  }
  const type = cleanString(message.type, 50) || 'desconhecido';
  return `[Mensagem do tipo: ${type}]`;
}

function whatsappTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function verifyWhatsappSignature(rawBody, signatureHeader, appSecret) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  if (typeof appSecret !== 'string' || appSecret.length === 0) return false;
  if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) return false;

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return safeSecretEqual(signatureHeader, expected);
}

export async function recordInboundWhatsappMessage(supabase, message, contacts = []) {
  const phone = cleanString(message?.from, MAX_PHONE_LENGTH).replace(/\D/g, '');
  const messageId = cleanString(message?.id, MAX_MESSAGE_ID_LENGTH);
  const createdAt = whatsappTimestamp(message?.timestamp);
  if (phone.length < 8 || !messageId || !createdAt) return false;

  const contact = contacts.find((item) => String(item?.wa_id || '').replace(/\D/g, '') === phone);
  const name = cleanString(contact?.profile?.name, MAX_NAME_LENGTH) || 'Contato WhatsApp';
  const body = cleanString(messageBody(message), MAX_MESSAGE_BODY_LENGTH) || '[Mensagem sem texto]';

  // Esta RPC deve inserir a mensagem com ON CONFLICT(meta_message_id) DO NOTHING
  // e incrementar unread_count no mesmo bloco transacional somente quando a
  // mensagem for nova. Assim, retries e entregas concorrentes da Meta sao seguros.
  const { data, error } = await supabase.rpc('record_whatsapp_inbound_message', {
    p_phone: phone,
    p_name: name,
    p_message_id: messageId,
    p_body: body,
    p_created_at: createdAt,
  });
  if (error) throw error;
  return data !== false;
}

export async function updateWhatsappMessageStatus(supabase, statusObject) {
  const messageId = cleanString(statusObject?.id, MAX_MESSAGE_ID_LENGTH);
  if (!messageId) return false;

  const allowedStatuses = new Set(['sent', 'delivered', 'read', 'failed']);
  const status = allowedStatuses.has(statusObject.status) ? statusObject.status : 'sent';
  const update = { status };
  if (statusObject.errors?.[0]) {
    update.error_message = cleanString(
      statusObject.errors[0].message || 'Falha de entrega Meta API',
      1000,
    );
  }

  const dispatchResult = await supabase
    .from('whatsapp_dispatches')
    .update(update)
    .eq('meta_message_id', messageId);
  if (dispatchResult.error) throw dispatchResult.error;

  const messageResult = await supabase
    .from('whatsapp_messages')
    .update(update)
    .eq('meta_message_id', messageId);
  if (messageResult.error) throw messageResult.error;
  return true;
}

export async function processWhatsappWebhook(supabase, payload) {
  let messagesProcessed = 0;
  let statusesProcessed = 0;
  let ignored = 0;
  const seenMessages = new Set();
  const seenStatuses = new Set();

  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];

      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const messageId = cleanString(message?.id, MAX_MESSAGE_ID_LENGTH);
        if (!messageId || seenMessages.has(messageId)) {
          ignored += 1;
          continue;
        }
        seenMessages.add(messageId);
        if (await recordInboundWhatsappMessage(supabase, message, contacts)) messagesProcessed += 1;
        else ignored += 1;
      }

      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const key = `${cleanString(status?.id, MAX_MESSAGE_ID_LENGTH)}:${status?.status || ''}`;
        if (key.startsWith(':') || seenStatuses.has(key)) {
          ignored += 1;
          continue;
        }
        seenStatuses.add(key);
        if (await updateWhatsappMessageStatus(supabase, status)) statusesProcessed += 1;
        else ignored += 1;
      }
    }
  }

  return { messagesProcessed, statusesProcessed, ignored };
}
