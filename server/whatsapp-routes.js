export function registerWhatsappRoutes(app, supabase) {
  // 1. Get WhatsApp credentials (safely masked/filtered)
  app.get('/api/whatsapp/credentials', async (req, res) => {
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
  app.post('/api/whatsapp/credentials', async (req, res) => {
    const { token, phone_number_id, whatsapp_business_account_id, userId } = req.body;
    if (!token || !phone_number_id || !whatsapp_business_account_id) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
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
            updated_by: userId || null
          })
          .eq('id', existing.id);
      } else {
        result = await supabase
          .from('whatsapp_credentials')
          .insert({
            token,
            phone_number_id,
            whatsapp_business_account_id,
            updated_by: userId || null
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
  app.get('/api/whatsapp/templates', async (req, res) => {
    const { forceSync } = req.query;

    try {
      const { data: creds, error: credsErr } = await supabase
        .from('whatsapp_credentials')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credsErr) throw credsErr;

      if (!creds || !creds.token || !creds.whatsapp_business_account_id) {
        const { data: cached } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .order('name');
        return res.json({ templates: cached || [], error: 'Credenciais não configuradas. Exibindo cache local.' });
      }

      let shouldSync = forceSync === 'true';
      if (!shouldSync) {
        const { count } = await supabase
          .from('whatsapp_templates')
          .select('*', { count: 'exact', head: true });
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
        .select('*')
        .order('name');

      res.json({ templates: cached || [] });
    } catch (err) {
      console.error('[MedNet Backend] Erro ao carregar templates do WhatsApp:', err);
      try {
        const { data: cached } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .order('name');
        res.json({ templates: cached || [], error: err.message || String(err) });
      } catch (dbErr) {
        res.status(500).json({ error: err.message || String(err) });
      }
    }
  });

  // 4. Send Message Template via Meta Graph API
  app.post('/api/whatsapp/send', async (req, res) => {
    const { recipient_phone, recipient_name, template_name, language_code, variables, userId } = req.body;

    if (!recipient_phone || !template_name) {
      return res.status(400).json({ error: 'Telefone do destinatário e nome do template são obrigatórios.' });
    }

    const cleanPhone = recipient_phone.replace(/\D/g, '');

    try {
      const { data: creds, error: credsErr } = await supabase
        .from('whatsapp_credentials')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (credsErr) throw credsErr;
      if (!creds || !creds.token || !creds.phone_number_id) {
        throw new Error('Credenciais do WhatsApp API não configuradas.');
      }

      const { data: template } = await supabase
        .from('whatsapp_templates')
        .select('*')
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

      const parameters = (variables || []).map(v => ({
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

      console.log(`[MedNet Backend] Disparando template ${template_name} para ${cleanPhone}...`);

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
          variables: variables || [],
          error_message: errorMessage,
          sent_by: userId || null
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
        variables: variables || [],
        meta_message_id: messageId,
        sent_by: userId || null
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
          variables: variables || [],
          error_message: err.message || String(err),
          sent_by: userId || null
        });
      } catch (dbErr) {
        console.error('[MedNet Backend] Erro ao tentar registrar log de falha crítica:', dbErr);
      }
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 5. GET all active chats
  app.get('/api/whatsapp/chats', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_chats')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('[MedNet Backend] Erro ao buscar chats:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 6. GET messages for a specific chat
  app.get('/api/whatsapp/chats/:chatId/messages', async (req, res) => {
    const { chatId } = req.params;
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('[MedNet Backend] Erro ao buscar mensagens do chat:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // 7. POST mark messages as read (reset unread count)
  app.post('/api/whatsapp/chats/:chatId/read', async (req, res) => {
    const { chatId } = req.params;
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
  app.post('/api/whatsapp/chats/:chatId/send', async (req, res) => {
    const { chatId } = req.params;
    const { message, userId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'A mensagem não pode ser vazia.' });
    }

    try {
      // 1. Fetch credentials
      const { data: creds, error: credsErr } = await supabase
        .from('whatsapp_credentials')
        .select('*')
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
        .select('*')
        .eq('id', chatId)
        .single();

      if (chatErr || !chat) {
        return res.status(404).json({ error: 'Conversa não encontrada.' });
      }

      const cleanPhone = chat.phone.replace(/\D/g, '');

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
            text: { body: message.trim() }
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
          body: message.trim(),
          status: 'failed',
          error_message: userMessage,
          sender_id: userId || null
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
          body: message.trim(),
          status: 'sent',
          meta_message_id: messageId,
          sender_id: userId || null
        })
        .select()
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
  app.post('/api/whatsapp/chats/open', async (req, res) => {
    const { phone, name } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'O número de telefone é obrigatório.' });
    }

    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const displayName = name || phone;

      // Check if chat already exists
      let { data: chat } = await supabase
        .from('whatsapp_chats')
        .select('*')
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
          .select()
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
    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'mednet_verify_token';

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === verifyToken) {
        console.log('[MedNet Backend] Webhook verificado com sucesso pela Meta.');
        return res.status(200).send(challenge);
      } else {
        console.warn('[MedNet Backend] Falha de verificação do webhook. Token incorreto.');
        return res.sendStatus(403);
      }
    }
    res.sendStatus(400);
  });

  // 11. POST Webhook endpoint (Status updates & Incoming text messages from Meta in real-time)
  app.post('/api/whatsapp/webhook', async (req, res) => {
    try {
      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0];
      const messages = change?.value?.messages;
      const contacts = change?.value?.contacts;
      const statusObj = change?.value?.statuses?.[0];

      // Case A: Incoming user message (Free-text reply)
      if (messages && messages.length > 0) {
        const msgObj = messages[0];
        const fromPhone = msgObj.from;
        const msgId = msgObj.id;
        const msgTime = new Date(parseInt(msgObj.timestamp) * 1000).toISOString();

        let msgBody = '';
        if (msgObj.type === 'text') {
          msgBody = msgObj.text?.body || '';
        } else {
          msgBody = `[Mensagem do tipo: ${msgObj.type}]`;
        }

        const contactObj = contacts?.find(c => c.wa_id === fromPhone);
        const contactName = contactObj?.profile?.name || fromPhone;

        // 1. Get or Create Chat Session
        let { data: chat } = await supabase
          .from('whatsapp_chats')
          .select('id, unread_count')
          .eq('phone', fromPhone)
          .maybeSingle();

        let chatId;
        if (!chat) {
          const { data: newChat, error: createErr } = await supabase
            .from('whatsapp_chats')
            .insert({
              phone: fromPhone,
              name: contactName,
              unread_count: 1,
              last_message_at: msgTime
            })
            .select('id')
            .single();

          if (createErr) throw createErr;
          chatId = newChat.id;
        } else {
          chatId = chat.id;
          await supabase
            .from('whatsapp_chats')
            .update({
              last_message_at: msgTime,
              unread_count: chat.unread_count + 1
            })
            .eq('id', chatId);
        }

        // 2. Insert Message
        await supabase
          .from('whatsapp_messages')
          .insert({
            chat_id: chatId,
            direction: 'inbound',
            body: msgBody,
            status: 'read', // Incoming is marked as read or received on Meta
            meta_message_id: msgId,
            created_at: msgTime
          });

        console.log(`[MedNet Webhook] Nova resposta de ${contactName} (${fromPhone}): ${msgBody}`);
      }

      // Case B: Status update of sent messages (sent, delivered, read, failed)
      if (statusObj) {
        const metaMessageId = statusObj.id;
        const metaStatus = statusObj.status;
        const errorObj = statusObj.errors?.[0];

        let mappedStatus = 'sent';
        if (metaStatus === 'delivered') mappedStatus = 'delivered';
        else if (metaStatus === 'read') mappedStatus = 'read';
        else if (metaStatus === 'failed') mappedStatus = 'failed';

        console.log(`[MedNet Backend Webhook] Atualização de status: ID ${metaMessageId} -> ${mappedStatus}`);

        const updateData = { status: mappedStatus };
        if (errorObj) {
          updateData.error_message = errorObj.message || 'Falha de entrega Meta API';
        }

        // Update bulk templates history
        await supabase
          .from('whatsapp_dispatches')
          .update(updateData)
          .eq('meta_message_id', metaMessageId);

        // Update individual chat message status
        await supabase
          .from('whatsapp_messages')
          .update(updateData)
          .eq('meta_message_id', metaMessageId);
      }

      res.status(200).send('EVENT_RECEIVED');
    } catch (err) {
      console.error('[MedNet Backend Webhook] Erro ao processar webhook:', err);
      res.status(200).send('EVENT_RECEIVED');
    }
  });
}
