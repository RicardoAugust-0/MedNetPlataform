import { requireRole } from './ai-chat/middleware.js';
import { safeSecretEqual } from './security.js';
import { processWhatsappWebhook, verifyWhatsappSignature } from './whatsapp-webhook.js';

const WHATSAPP_CREDENTIAL_COLUMNS = 'id, token, phone_number_id, whatsapp_business_account_id, updated_at';
const WHATSAPP_TEMPLATE_COLUMNS = 'id, name, category, language, status, components, updated_at';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const META_ID_RE = /^\d{5,32}$/;
const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function maxWhatsappMessageChars() {
  const configured = Number.parseInt(process.env.WHATSAPP_MESSAGE_MAX_CHARS || '', 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 4096;
}

function validPhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/\D/g, '');
  return phone.length >= 8 && phone.length <= 20 ? phone : null;
}

export function registerWhatsappRoutes(app, supabase) {
  const requireOperador = requireRole(supabase, 'operador');
  const requireAdmin    = requireRole(supabase, 'admin');

  // 1. Get WhatsApp credentials (safely masked/filtered)
  app.get('/api/whatsapp/credentials', requireOperador, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_credentials')
        .select('id, phone_number_id, whatsapp_business_account_id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      res.json(data || { phone_number_id: '', whatsapp_business_account_id: '' });
    } catch (err) {
      console.error('[MedNet Backend] Erro ao buscar credenciais do WhatsApp:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 2. Save/Update WhatsApp credentials
  app.post('/api/whatsapp/credentials', requireAdmin, async (req, res) => {
    const { token, phone_number_id, whatsapp_business_account_id } = req.body || {};
    if (
      !isNonEmptyString(token, 4096)
      || !META_ID_RE.test(String(phone_number_id || ''))
      || !META_ID_RE.test(String(whatsapp_business_account_id || ''))
    ) {
      return res.status(400).json({ error: 'Credenciais do WhatsApp invalidas.' });
    }
    try {
      const { data: existing } = await supabase
        .from('whatsapp_credentials')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let result;
      if (existing) {
        result = await supabase
          .from('whatsapp_credentials')
          .update({
            token,
            phone_number_id,
            whatsapp_business_account_id,
            updated_at: new Date().toISOString(),
            updated_by: req.authUser.id
          })
          .eq('id', existing.id);
      } else {
        result = await supabase
          .from('whatsapp_credentials')
          .insert({
            token,
            phone_number_id,
            whatsapp_business_account_id,
            updated_by: req.authUser.id
          });
      }

      if (result.error) throw result.error;
      res.json({ success: true, message: 'Credenciais do WhatsApp salvas com sucesso.' });
    } catch (err) {
      console.error('[MedNet Backend] Erro ao salvar credenciais do WhatsApp:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 3. Sync and list templates from Meta Graph API
  app.get('/api/whatsapp/templates', requireOperador, async (req, res) => {
    const { forceSync } = req.query;

    try {
      const { data: creds, error: credsErr } = await supabase
        .from('whatsapp_credentials')
        .select(WHATSAPP_CREDENTIAL_COLUMNS)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credsErr) throw credsErr;

      if (!creds || !creds.token || !creds.whatsapp_business_account_id) {
        const { data: cached } = await supabase
          .from('whatsapp_templates')
          .select(WHATSAPP_TEMPLATE_COLUMNS)
          .order('name');
        return res.json({ templates: cached || [], error: 'Credenciais não configuradas. Exibindo cache local.' });
      }

      let shouldSync = forceSync === 'true';
      if (!shouldSync) {
        const { count } = await supabase
          .from('whatsapp_templates')
          .select('id', { count: 'exact', head: true });
        if (count === 0) {
          shouldSync = true;
        }
      }

      if (shouldSync) {
        console.log('[MedNet Backend] Sincronizando templates com a API da Meta...');
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${creds.whatsapp_business_account_id}/message_templates?limit=100`,
          {
            headers: {
              'Authorization': `Bearer ${creds.token}`
            }
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Erro na API da Meta: ${response.status} - ${errText}`);
        }

        const metaResponse = await response.json();
        const templates = metaResponse.data || [];

        // Upsert templates in DB cache
        for (const t of templates) {
          await supabase
            .from('whatsapp_templates')
            .upsert({
              name: t.name,
              category: t.category,
              language: t.language,
              status: t.status,
              components: t.components,
              updated_at: new Date().toISOString()
            }, { onConflict: 'name' });
        }
        console.log(`[MedNet Backend] Sincronizados ${templates.length} templates.`);
      }

      const { data: cached } = await supabase
        .from('whatsapp_templates')
        .select(WHATSAPP_TEMPLATE_COLUMNS)
        .order('name');

      res.json({ templates: cached || [] });
    } catch (err) {
      console.error('[MedNet Backend] Erro ao carregar templates do WhatsApp:', err);
      try {
        const { data: cached } = await supabase
          .from('whatsapp_templates')
          .select(WHATSAPP_TEMPLATE_COLUMNS)
          .order('name');
        res.json({ templates: cached || [], error: err.message || String(err) });
      } catch (dbErr) {
        res.status(500).json({ error: err.message || String(err) });
      }
    }
  });

  // 4. Send Message Template via Meta Graph API
  app.post('/api/whatsapp/send', requireOperador, async (req, res) => {
    const { recipient_phone, recipient_name, template_name, language_code, variables } = req.body || {};
    const cleanPhone = validPhone(recipient_phone);
    const safeVariables = variables === undefined ? [] : variables;

    if (
      !cleanPhone
      || !TEMPLATE_NAME_RE.test(String(template_name || ''))
      || (recipient_name !== undefined && !isNonEmptyString(recipient_name, 200))
      || (language_code !== undefined && !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language_code))
      || !Array.isArray(safeVariables)
      || safeVariables.length > 20
      || safeVariables.some((value) => String(value).length > 1024)
    ) {
      return res.status(400).json({ error: 'Dados do disparo WhatsApp invalidos.' });
    }

    try {
      const { data: creds, error: credsErr } = await supabase
        .from('whatsapp_credentials')
        .select(WHATSAPP_CREDENTIAL_COLUMNS)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credsErr) throw credsErr;
      if (!creds || !creds.token || !creds.phone_number_id) {
        throw new Error('Credenciais do WhatsApp API não configuradas.');
      }

      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('id, name, category')
        .eq('name', template_name)
        .maybeSingle();

      const category = template?.category || 'UTILITY';

      // Estimativa de custo (tabela Brasil DDI +55)
      let estimatedCost = 0.15;
      if (cleanPhone.startsWith('55')) {
        if (category === 'MARKETING') {
          estimatedCost = 0.33;
        } else if (category === 'UTILITY') {
          estimatedCost = 0.18;
        } else if (category === 'AUTHENTICATION') {
          estimatedCost = 0.15;
        }
      } else {
        estimatedCost = 0.15;
      }

      const parameters = safeVariables.map(v => ({
        type: 'text',
        text: String(v)
      }));

      const components = [];
      if (parameters.length > 0) {
        components.push({
          type: 'body',
          parameters: parameters
        });
      }

      const metaPayload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: template_name,
          language: {
            code: language_code || template?.language || 'pt_BR'
          },
          components: components
        }
      };

      console.log(`[MedNet Backend] Disparando template ${template_name}.`);

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${creds.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(metaPayload)
        }
      );

      const resText = await response.text();
      let resData = {};
      try {
        resData = JSON.parse(resText);
      } catch (e) {
        resData = { error: { message: resText } };
      }

      if (!response.ok) {
        const errorMessage = resData.error?.message || `Erro da Meta API com status ${response.status}`;
        await supabase.from('whatsapp_dispatches').insert({
          recipient_name: recipient_name || 'Destinatário',
          recipient_phone: cleanPhone,
          template_name,
          category,
          estimated_cost: 0.0000,
          status: 'failed',
          variables: safeVariables,
          error_message: errorMessage,
          sent_by: req.authUser.id
        });

        return res.status(400).json({ error: errorMessage });
      }

      const messageId = resData.messages?.[0]?.id;

      await supabase.from('whatsapp_dispatches').insert({
        recipient_name: recipient_name || 'Destinatário',
        recipient_phone: cleanPhone,
        template_name,
        category,
        estimated_cost: estimatedCost,
        status: 'sent',
        variables: safeVariables,
        meta_message_id: messageId,
        sent_by: req.authUser.id
      });

      res.json({ success: true, messageId, estimatedCost });
    } catch (err) {
      console.error('[MedNet Backend] Erro no endpoint /api/whatsapp/send:', err);
      try {
        await supabase.from('whatsapp_dispatches').insert({
          recipient_name: recipient_name || 'Destinatário',
          recipient_phone: cleanPhone,
          template_name,
          status: 'failed',
          variables: safeVariables,
          error_message: err.message || String(err),
          sent_by: req.authUser.id
        });
      } catch (dbErr) {
        console.error('[MedNet Backend] Erro ao tentar registrar log de falha crítica:', dbErr);
      }
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 5. GET all active chats
  app.get('/api/whatsapp/chats', requireOperador, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_chats')
        .select('id, phone, name, last_message_at, unread_count, created_at')
        .order('last_message_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('[MedNet Backend] Erro ao buscar chats:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 6. GET messages for a specific chat
  app.get('/api/whatsapp/chats/:chatId/messages', requireOperador, async (req, res) => {
    const { chatId } = req.params;
    if (!UUID_RE.test(chatId)) return res.status(400).json({ error: 'chatId invalido.' });
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, chat_id, direction, body, status, meta_message_id, error_message, sender_id, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      res.json((data || []).reverse());
    } catch (err) {
      console.error('[MedNet Backend] Erro ao buscar mensagens do chat:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 7. POST mark messages as read (reset unread count)
  app.post('/api/whatsapp/chats/:chatId/read', requireOperador, async (req, res) => {
    const { chatId } = req.params;
    if (!UUID_RE.test(chatId)) return res.status(400).json({ error: 'chatId invalido.' });
    try {
      const { error } = await supabase
        .from('whatsapp_chats')
        .update({ unread_count: 0 })
        .eq('id', chatId);

      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('[MedNet Backend] Erro ao marcar chat como lido:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 8. POST send free-text message
  app.post('/api/whatsapp/chats/:chatId/send', requireOperador, async (req, res) => {
    const { chatId } = req.params;
    const { message } = req.body || {};
    const cleanMessage = typeof message === 'string' ? message.trim() : '';

    if (!UUID_RE.test(chatId) || !cleanMessage || cleanMessage.length > maxWhatsappMessageChars()) {
      return res.status(400).json({ error: 'chatId ou mensagem invalido.' });
    }

    try {
      // 1. Fetch credentials
      const { data: creds, error: credsErr } = await supabase
        .from('whatsapp_credentials')
        .select(WHATSAPP_CREDENTIAL_COLUMNS)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credsErr) throw credsErr;
      if (!creds || !creds.token || !creds.phone_number_id) {
        return res.status(400).json({ error: 'Credenciais do WhatsApp API não configuradas.' });
      }

      // 2. Fetch target chat phone
      const { data: chat, error: chatErr } = await supabase
        .from('whatsapp_chats')
        .select('id, phone, name, unread_count')
        .eq('id', chatId)
        .single();

      if (chatErr || !chat) {
        return res.status(404).json({ error: 'Conversa não encontrada.' });
      }

      const cleanPhone = validPhone(chat.phone);
      if (!cleanPhone) return res.status(422).json({ error: 'Telefone da conversa invalido.' });

      // 3. Send text message to Meta Cloud API
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${creds.phone_number_id}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${creds.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "text",
            text: { body: cleanMessage }
          })
        }
      );

      const resText = await response.text();
      let resData = {};
      try {
        resData = JSON.parse(resText);
      } catch (e) {
        resData = { error: { message: resText } };
      }

      if (!response.ok) {
        const errMeta = resData.error;
        let userMessage = errMeta?.message || 'Erro desconhecido ao enviar mensagem.';

        if (errMeta?.code === 131047) {
          userMessage = 'A janela de atendimento de 24 horas expirou. É necessário enviar uma mensagem de template para reabrir o contato.';
        }

        // Insert failed message locally for transparency
        await supabase.from('whatsapp_messages').insert({
          chat_id: chatId,
          direction: 'outbound',
          body: cleanMessage,
          status: 'failed',
          error_message: userMessage,
          sender_id: req.authUser.id
        });

        return res.status(400).json({ error: userMessage, code: errMeta?.code });
      }

      const messageId = resData.messages?.[0]?.id;

      // 4. Save message and update chat timestamp
      const { data: savedMsg, error: saveErr } = await supabase
        .from('whatsapp_messages')
        .insert({
          chat_id: chatId,
          direction: 'outbound',
          body: cleanMessage,
          status: 'sent',
          meta_message_id: messageId,
          sender_id: req.authUser.id
        })
        .select('id, chat_id, direction, body, status, meta_message_id, error_message, sender_id, created_at')
        .single();

      if (saveErr) throw saveErr;

      await supabase
        .from('whatsapp_chats')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: 0 // Reset since operator sent it
        })
        .eq('id', chatId);

      res.json({ success: true, message: savedMsg });
    } catch (err) {
      console.error('[MedNet Backend] Erro no /api/whatsapp/chats/:chatId/send:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 9. POST start/open chat by phone number (new conversation from UI)
  app.post('/api/whatsapp/chats/open', requireOperador, async (req, res) => {
    const { phone, name } = req.body || {};
    const cleanPhone = validPhone(phone);
    if (!cleanPhone || (name !== undefined && !isNonEmptyString(name, 200))) {
      return res.status(400).json({ error: 'Telefone ou nome invalido.' });
    }

    try {
      const displayName = name?.trim() || cleanPhone;

      // Check if chat already exists
      let { data: chat } = await supabase
        .from('whatsapp_chats')
        .select('id, phone, name, last_message_at, unread_count, created_at')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (!chat) {
        // Create new chat
        const { data: newChat, error: createErr } = await supabase
          .from('whatsapp_chats')
          .insert({
            phone: cleanPhone,
            name: displayName,
            unread_count: 0
          })
          .select('id, phone, name, last_message_at, unread_count, created_at')
          .single();

        if (createErr) throw createErr;
        chat = newChat;
      }

      res.json({ success: true, chat });
    } catch (err) {
      console.error('[MedNet Backend] Erro ao abrir/criar chat:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 10. GET Webhook verification (Meta App setup)
  app.get('/api/whatsapp/webhook', (req, res) => {
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (!verifyToken) {
      return res.status(503).json({ error: 'Webhook WhatsApp nao configurado.' });
    }
    if (mode === 'subscribe' && safeSecretEqual(token, verifyToken) && typeof challenge === 'string') {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(mode && token ? 403 : 400);
  });

  // 11. POST Webhook endpoint (Status updates & Incoming text messages from Meta in real-time)
  app.post('/api/whatsapp/webhook', async (req, res) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      return res.status(503).json({ error: 'Webhook WhatsApp nao configurado.' });
    }

    const signature = req.get('x-hub-signature-256');
    if (!verifyWhatsappSignature(req.rawBody, signature, appSecret)) {
      return res.status(401).json({ error: 'Assinatura do webhook invalida.' });
    }

    try {
      const result = await processWhatsappWebhook(supabase, req.body);
      return res.status(200).json({ received: true, ...result });
    } catch (err) {
      // Retorna erro para a Meta repetir. A RPC transacional torna o retry seguro.
      console.error('[MedNet Backend Webhook] Falha ao persistir evento assinado:', err?.message || err);
      return res.status(500).json({ error: 'Falha temporaria ao processar webhook.' });
    }
  });
}
