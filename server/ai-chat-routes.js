import { requireRole } from './ai-chat/middleware.js';
import { executeTool } from './ai-chat/tool-handlers.js';
import { safeSecretEqual } from './security.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pdfContentLimitBytes() {
  const configured = Number.parseInt(process.env.AI_PDF_MAX_CONTENT_BYTES || '', 10);
  return Number.isInteger(configured) && configured > 0 ? configured : 512 * 1024;
}

export function validateInternalPdfPayload(body, maxContentBytes = pdfContentLimitBytes()) {
  const { userId, title, content, subtitle } = body || {};
  if (!UUID_RE.test(String(userId || ''))) return { error: 'userId invalido.' };
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) {
    return { error: 'title invalido.' };
  }
  if (typeof content !== 'string' || !content.trim() || Buffer.byteLength(content, 'utf8') > maxContentBytes) {
    return { error: 'content invalido ou acima do limite.' };
  }
  if (subtitle !== undefined && (typeof subtitle !== 'string' || subtitle.length > 500)) {
    return { error: 'subtitle invalido.' };
  }
  return {
    value: {
      userId,
      title: title.trim(),
      content,
      subtitle: subtitle?.trim() || undefined,
    },
  };
}

// Extrai bloco JSON (gráfico ou ação de navegação) do texto da IA.
// Tenta ```json primeiro, depois ``` simples como fallback.
function extractChartAndCleanText(text) {
  const patterns = [
    /```json\s*([\s\S]*?)\s*```/i,
    /```\s*(\{[\s\S]*?\})\s*```/,
  ];
  for (const regex of patterns) {
    const match = text.match(regex);
    if (!match) continue;
    const raw = match[1].trim();
    // Só tenta parsear se parece um objeto JSON
    if (!raw.startsWith('{')) continue;
    try {
      const chartJson = JSON.parse(raw);
      const cleanText = text.replace(match[0], '').trim();
      return { text: cleanText, chart: chartJson };
    } catch (err) {
      console.error('[extractChart] JSON inválido no bloco:', err.message, '| raw:', raw.slice(0, 120));
    }
  }
  return { text, chart: null };
}

// Registro das rotas no Express
export function registerAiChatRoutes(app, supabase) {
  // 1. Obter lista de tópicos (threads) do chat
  app.get('/api/ai/chat/threads', requireRole(supabase, 'admin'), async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ai_chat_threads')
        .select('id, user_id, title, created_at, updated_at')
        .eq('user_id', req.authUser.id)
        .order('updated_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. Criar um novo tópico (thread) de conversa
  app.post('/api/ai/chat/threads', requireRole(supabase, 'admin'), async (req, res) => {
    const { title = 'Nova conversa' } = req.body || {};
    if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
      return res.status(400).json({ error: 'Titulo invalido.' });
    }
    try {
      const { data, error } = await supabase
        .from('ai_chat_threads')
        .insert({ user_id: req.authUser.id, title: title.trim() })
        .select('id, user_id, title, created_at, updated_at');
      if (error) throw error;
      return res.status(200).json(data[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Deletar um tópico (thread) de conversa
  app.delete('/api/ai/chat/threads/:id', requireRole(supabase, 'admin'), async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id invalido.' });
    try {
      // Deleta mensagens vinculadas implicitamente por Cascade
      const { error } = await supabase
        .from('ai_chat_threads')
        .delete()
        .eq('id', id)
        .eq('user_id', req.authUser.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. Obter histórico de mensagens de uma thread específica
  app.get('/api/ai/chat/history', requireRole(supabase, 'admin'), async (req, res) => {
    const { thread_id } = req.query;
    if (!thread_id) {
      return res.status(200).json([]);
    }
    if (!UUID_RE.test(thread_id)) return res.status(400).json({ error: 'thread_id invalido.' });
    try {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('id, user_id, role, text, chart, created_at, thread_id')
        .eq('user_id', req.authUser.id)
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.status(200).json((data || []).reverse());
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. Limpar histórico de mensagens (obsoleta, mas mantida para retrocompatibilidade)
  app.delete('/api/ai/chat/history', requireRole(supabase, 'admin'), async (req, res) => {
    try {
      const { error } = await supabase
        .from('ai_chat_messages')
        .delete()
        .eq('user_id', req.authUser.id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. Enviar mensagem para a IA vinculando a um tópico (Delegando ao n8n)
  app.post('/api/ai/chat', requireRole(supabase, 'admin'), async (req, res) => {
    const { message, thread_id, context } = req.body || {};
    if (
      typeof message !== 'string'
      || !message.trim()
      || message.length > 20_000
      || (thread_id && !UUID_RE.test(thread_id))
      || Buffer.byteLength(JSON.stringify(context ?? null), 'utf8') > 64 * 1024
    ) {
      return res.status(400).json({ error: 'Mensagem, thread_id ou contexto invalido.' });
    }

    try {
      let activeThreadId = thread_id;

      // Cria a thread automaticamente caso não tenha sido fornecida
      if (!activeThreadId) {
        const cleanTitle = message.length > 25 ? message.substring(0, 25) + '...' : message;
        const { data: newThread, error: threadErr } = await supabase
          .from('ai_chat_threads')
          .insert({ user_id: req.authUser.id, title: cleanTitle })
          .select('id');
        if (threadErr || !newThread) throw new Error(threadErr?.message || 'Falha ao criar tópico.');
        activeThreadId = newThread[0].id;
      }

      // Carrega histórico da thread (máximo 10 mensagens) para alimentar a memória da IA
      const { data: dbHistory } = await supabase
        .from('ai_chat_messages')
        .select('role, text, chart, created_at')
        .eq('user_id', req.authUser.id)
        .eq('thread_id', activeThreadId)
        .order('created_at', { ascending: false })
        .limit(10);

      const history = dbHistory ? [...dbHistory].reverse() : [];

      // Salva a mensagem do usuário no banco (mensagem limpa)
      await supabase.from('ai_chat_messages').insert({
        user_id: req.authUser.id,
        role: 'user',
        text: message,
        thread_id: activeThreadId
      });

      // Dispara a requisição para o Webhook do n8n
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/medbot-chat';
      const internalKey = process.env.INTERNAL_API_KEY;

      console.log('[MedBot] Encaminhando mensagem ao n8n.');
      
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalKey ? { 'x-internal-key': internalKey } : {})
        },
        body: JSON.stringify({
          userId: req.authUser.id,
          threadId: activeThreadId,
          message,
          history: history.map(h => ({ role: h.role, text: h.text, chart: h.chart })),
          context
        })
      });

      if (!n8nResponse.ok) {
        const errText = await n8nResponse.text();
        throw new Error(`n8n webhook respondeu com erro ${n8nResponse.status}: ${errText}`);
      }

      const n8nData = await n8nResponse.json();
      const botResponseText = n8nData.output || n8nData.response || n8nData.text || '';
      const historyCleared = n8nData.history_cleared || null;

      // Limpa e processa retorno de gráfico
      const { text, chart } = extractChartAndCleanText(botResponseText);

      // Se o histórico foi limpo durante a conversa no n8n, reflete no banco e responde
      if (historyCleared) {
        if (historyCleared === 'all') {
          await supabase.from('ai_chat_threads').delete().eq('user_id', req.authUser.id);
        }
        return res.status(200).json({
          text,
          chart,
          thread_id: historyCleared === 'all' ? null : activeThreadId,
          history_cleared: historyCleared
        });
      }

      // Salva a resposta da IA no banco
      await supabase.from('ai_chat_messages').insert({
        user_id: req.authUser.id,
        role: 'assistant',
        text,
        chart,
        thread_id: activeThreadId
      });

      // Se a thread ainda tem o título default, renomeia com o primeiro prompt
      const { data: curThread } = await supabase
        .from('ai_chat_threads')
        .select('title')
        .eq('id', activeThreadId)
        .eq('user_id', req.authUser.id)
        .maybeSingle();
      if (curThread && curThread.title === 'Nova conversa') {
        const cleanTitle = message.length > 25 ? message.substring(0, 25) + '...' : message;
        await supabase
          .from('ai_chat_threads')
          .update({ title: cleanTitle })
          .eq('id', activeThreadId)
          .eq('user_id', req.authUser.id);
      }

      // Atualiza o timestamp da thread para ordenar por mais recente
      await supabase
        .from('ai_chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeThreadId)
        .eq('user_id', req.authUser.id);

      return res.status(200).json({ text, chart, thread_id: activeThreadId });
    } catch (err) {
      console.error('[AI Chat API Router Error]:', err);
      return res.status(500).json({ error: `Erro interno no assistente: ${err.message || err}` });
    }
  });

  // 6b. Endpoint interno para geração de relatórios em PDF (chamado pelo n8n)
  app.post('/api/ai/internal/generate-pdf', async (req, res) => {
    const internalKey = process.env.INTERNAL_API_KEY;
    const incomingKey = req.headers['x-internal-key'];

    if (!internalKey) {
      return res.status(503).json({ error: 'Endpoint interno nao configurado.' });
    }
    if (!safeSecretEqual(incomingKey, internalKey)) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const validation = validateInternalPdfPayload(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const { userId, title, content, subtitle } = validation.value;

    try {
      const result = await executeTool(supabase, userId, 'generate_pdf_report', { title, content, subtitle });
      return res.status(200).json(result);
    } catch (err) {
      console.error('[Internal Generate PDF Error]:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 7. Obter todos os relatórios gerados
  app.get('/api/ai/reports', requireRole(supabase, 'admin'), async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ai_generated_reports')
        .select('id, created_by, title, content, chart_payload, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8. Salvar relatório manualmente
  app.post('/api/ai/reports', requireRole(supabase, 'admin'), async (req, res) => {
    const { title, content, chart_payload } = req.body || {};
    if (
      typeof title !== 'string'
      || !title.trim()
      || title.length > 200
      || typeof content !== 'string'
      || !content.trim()
      || Buffer.byteLength(content, 'utf8') > 512 * 1024
      || Buffer.byteLength(JSON.stringify(chart_payload ?? null), 'utf8') > 256 * 1024
    ) {
      return res.status(400).json({ error: 'Relatorio invalido ou acima do limite.' });
    }
    try {
      const { data, error } = await supabase
        .from('ai_generated_reports')
        .insert({
          created_by: req.authUser.id,
          title,
          content,
          chart_payload
        })
        .select('id, created_by, title, content, chart_payload, created_at');
      if (error) throw error;
      return res.status(200).json(data[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. Deletar um relatório
  app.delete('/api/ai/reports/:id', requireRole(supabase, 'admin'), async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id invalido.' });
    try {
      const { error } = await supabase
        .from('ai_generated_reports')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });
}
