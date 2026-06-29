import { requireRole } from './ai-chat/middleware.js';
import { executeTool } from './ai-chat/tool-handlers.js';

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
        .select('*')
        .eq('user_id', req.authUser.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. Criar um novo tópico (thread) de conversa
  app.post('/api/ai/chat/threads', requireRole(supabase, 'admin'), async (req, res) => {
    const { title = 'Nova conversa' } = req.body;
    try {
      const { data, error } = await supabase
        .from('ai_chat_threads')
        .insert({ user_id: req.authUser.id, title })
        .select();
      if (error) throw error;
      return res.status(200).json(data[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Deletar um tópico (thread) de conversa
  app.delete('/api/ai/chat/threads/:id', requireRole(supabase, 'admin'), async (req, res) => {
    const { id } = req.params;
    try {
      // Deleta mensagens vinculadas implicitamente por Cascade
      const { error } = await supabase
        .from('ai_chat_threads')
        .delete()
        .eq('id', id);
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
    try {
      const { data, error } = await supabase
        .from('ai_chat_messages')
        .select('*')
        .eq('user_id', req.authUser.id)
        .eq('thread_id', thread_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data);
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
    const { message, thread_id, context } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Parâmetro "message" é obrigatório.' });
    }

    try {
      let activeThreadId = thread_id;

      // Cria a thread automaticamente caso não tenha sido fornecida
      if (!activeThreadId) {
        const cleanTitle = message.length > 25 ? message.substring(0, 25) + '...' : message;
        const { data: newThread, error: threadErr } = await supabase
          .from('ai_chat_threads')
          .insert({ user_id: req.authUser.id, title: cleanTitle })
          .select();
        if (threadErr || !newThread) throw new Error(threadErr?.message || 'Falha ao criar tópico.');
        activeThreadId = newThread[0].id;
      }

      // Carrega histórico da thread (máximo 10 mensagens) para alimentar a memória da IA
      const { data: dbHistory } = await supabase
        .from('ai_chat_messages')
        .select('*')
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

      console.log(`[MedBot] Encaminhando mensagem ao n8n (${n8nWebhookUrl}) para usuário ${req.authUser.id}`);
      
      const n8nResponse = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(internalKey ? { 'x-internal-key': internalKey } : {})
        },
        body: JSON.stringify({
          userId: req.authUser.id,
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
        .maybeSingle();
      if (curThread && curThread.title === 'Nova conversa') {
        const cleanTitle = message.length > 25 ? message.substring(0, 25) + '...' : message;
        await supabase
          .from('ai_chat_threads')
          .update({ title: cleanTitle })
          .eq('id', activeThreadId);
      }

      // Atualiza o timestamp da thread para ordenar por mais recente
      await supabase
        .from('ai_chat_threads')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeThreadId);

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

    if (internalKey && incomingKey !== internalKey) {
      return res.status(401).json({ error: 'Não autorizado.' });
    }

    const { userId, title, content, subtitle } = req.body;
    if (!userId || !title || !content) {
      return res.status(400).json({ error: 'userId, title e content são obrigatórios.' });
    }

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
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8. Salvar relatório manualmente
  app.post('/api/ai/reports', requireRole(supabase, 'admin'), async (req, res) => {
    const { title, content, chart_payload } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Título e Conteúdo são obrigatórios.' });
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
        .select();
      if (error) throw error;
      return res.status(200).json(data[0]);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. Deletar um relatório
  app.delete('/api/ai/reports/:id', requireRole(supabase, 'admin'), async (req, res) => {
    const { id } = req.params;
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
