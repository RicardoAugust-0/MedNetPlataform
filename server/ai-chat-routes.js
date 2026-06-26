// Rotas Express do Chat IA (MedBot).
// A lógica de prompt, ferramentas e provedores vive em ./ai-chat/*.
import { requireRole } from './ai-chat/middleware.js';
import {
  modelForProvider,
  getProviderKey,
  runProvider,
  extractChartAndCleanText,
} from './ai-chat/providers.js';

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

  // 6. Enviar mensagem para a IA vinculando a um tópico
  app.post('/api/ai/chat', requireRole(supabase, 'admin'), async (req, res) => {
    const { message, thread_id } = req.body;
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

      // Salva a mensagem do usuário no banco
      await supabase.from('ai_chat_messages').insert({
        user_id: req.authUser.id,
        role: 'user',
        text: message,
        thread_id: activeThreadId
      });

      // Carrega configurações do provedor
      const { data: cfgRow } = await supabase.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle();
      const aiCfg = cfgRow?.value || {};

      const primaryProvider = aiCfg.provider || 'anthropic';
      const secondaryProvider = primaryProvider === 'google' ? 'anthropic' : 'google';

      // Fallback automático para o outro provedor se o primário falhar.
      // Desative definindo "fallback": false em ai_config.
      const fallbackEnabled = aiCfg.fallback !== false;
      const candidates = fallbackEnabled ? [primaryProvider, secondaryProvider] : [primaryProvider];

      let rawResponse = null;
      const attemptErrors = [];
      const toolCtx = {}; // acumula efeitos colaterais das ferramentas (ex: limpeza de histórico)

      for (const prov of candidates) {
        const apiKey = await getProviderKey(supabase, prov);
        if (!apiKey) {
          attemptErrors.push(`${prov}: chave de API não configurada`);
          continue;
        }
        const model = modelForProvider(prov, aiCfg);
        try {
          rawResponse = await runProvider(prov, apiKey, model, message, history, supabase, req.authUser.id, toolCtx);
          if (prov !== primaryProvider) {
            console.warn(`[AI Chat] Provedor primário (${primaryProvider}) falhou; respondido via fallback (${prov}).`);
          }
          break;
        } catch (err) {
          console.error(`[AI Chat] Provedor ${prov} falhou:`, err.message);
          attemptErrors.push(`${prov}: ${err.message}`);
        }
      }

      if (rawResponse === null) {
        return res.status(400).json({
          error: `Não foi possível obter resposta da IA. ${attemptErrors.join(' | ')}. Verifique as chaves em Admin → IA & Parsing.`
        });
      }

      // Limpa e processa retorno de gráfico
      const { text, chart } = extractChartAndCleanText(rawResponse);

      // Se o histórico foi limpo durante a conversa, NÃO regrava a resposta no banco
      // (manteria o histórico "sujo") e sinaliza ao front para atualizar em tempo real.
      if (toolCtx.historyCleared) {
        if (toolCtx.historyCleared === 'all') {
          // remove também as threads vazias para esvaziar a barra lateral
          await supabase.from('ai_chat_threads').delete().eq('user_id', req.authUser.id);
        }
        return res.status(200).json({
          text,
          chart,
          thread_id: toolCtx.historyCleared === 'all' ? null : activeThreadId,
          history_cleared: toolCtx.historyCleared
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
