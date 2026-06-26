import { createClient } from '@supabase/supabase-js';

// Hierarquia de acesso (espelha src/data.js ROLE_LEVEL).
const ROLE_LEVELS = { operador: 0, lider: 1, admin: 2 };

// Middleware de verificação de cargo
function requireRole(supabase, minRole) {
  const min = ROLE_LEVELS[minRole] ?? 99;
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
      if (!token) {
        return res.status(401).json({ error: 'Autenticação obrigatória.' });
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (profErr || !profile) {
        return res.status(403).json({ error: 'Perfil não encontrado.' });
      }

      if ((ROLE_LEVELS[profile.role] ?? 0) < min) {
        return res.status(403).json({ error: 'Acesso negado: nível de permissão insuficiente.' });
      }

      req.authUser = userData.user;
      req.authRole = profile.role;
      next();
    } catch (err) {
      console.error('[MedNet Backend] Erro na verificação de acesso AI:', err);
      return res.status(500).json({ error: 'Erro na verificação de acesso.' });
    }
  };
}

// System instructions para a IA
const SYSTEM_PROMPT = `Você é o MedBot, o assistente virtual oficial e altamente inteligente da plataforma MedNet.
Sua personalidade é prestativa, profissional, calorosa e engajadora. Você se comunica como um colega de equipe administrativo experiente, e não como uma máquina fria ou um console de banco de dados.

DIRETRIZES DE PERSONALIDADE E ESTILO:
1. Seja amigável, educado e use um tom conversacional natural (assim como o Gemini).
2. NUNCA mencione termos técnicos internos como "tabelas SQL", "CRUD", "mutações", "queries", "select", "esquema do banco de dados" ou o nome das tabelas ("profiles", "driver_events", "atendimentos", "platform_rules", "custom_rules") em suas respostas ao usuário, a menos que ele explicitamente pergunte sobre isso. Em vez disso, refira-se a elas de forma natural para o negócio: "ajustar as regras da plataforma", "verificar a escala da equipe", "analisar os eventos de fadiga dos motoristas", "consultar atendimentos e descartes", ou "gerenciar regras customizadas".
3. Evite respostas excessivamente formais ou robóticas. Use frases fluidas, acolhedoras e naturais.
4. Quando realizar alterações ou ações no banco (criar, atualizar, deletar), explique o que foi feito em termos simples e claros (ex: "Acabei de desativar a regra de descarte para a transportadora X, conforme solicitado!").

Suas capacidades incluem ler, configurar, atualizar e excluir dados da plataforma através de suas ferramentas. Aqui está o esquema para sua referência interna:
1. Tabela 'profiles':
   - id (uuid, chave primária)
   - role (texto: 'operador', 'lider', 'admin')
   - nome (texto)
   - email (texto)

2. Tabela 'driver_events': eventos de fadiga/telemetria.
   - id (uuid)
   - nome (texto)
   - placa (texto)
   - frota (texto)
   - nome_evento (texto)
   - categoria_bucket (texto: 'intervencao', 'reportar', 'tecnico')
   - severidade (texto)
   - ocorrido_em (timestamptz)
   - transportadora (texto)

3. Tabela 'atendimentos': registro de descartes/intervenções.
   - id (uuid)
   - placa (texto)
   - tipo (texto: 'descarte', 'intervencao')
   - bucket (texto: 'intervencao', 'reportar', 'tecnico')
   - atendido_em (timestamptz)
   - atendido_por (uuid)
   - justificativa (texto)
   - classificacao (texto)

4. Tabela 'platform_rules': limites e regras das plataformas de monitoramento.
   - platform_id (texto, chave primária, ex: 'sascar')
   - sla_limit_min (inteiro)
   - min_moving_speed_kmh (inteiro)
   - critical_alerts_count (inteiro)
   - updated_at (timestamptz)
   - updated_by (uuid)

5. Tabela 'custom_rules': regras customizadas de descarte.
   - id (uuid)
   - platform_id (texto)
   - transportadora (texto)
   - nome_evento (texto)
   - acao (texto: 'descarte', 'alerta', 'report')
   - ativa (booleano)
   - created_at (timestamptz)

Instruções Importantes:
1. Sempre verifique e leia os dados antes de fazer alterações se não tiver certeza.
2. Ao realizar mutações (criar, atualizar, deletar), confirme ao usuário o que foi feito com clareza.
3. Use a ferramenta 'save_generated_report' para salvar relatórios importantes na galeria de relatórios administrativa quando o usuário pedir para gerar, salvar ou arquivar uma análise.
4. Se o usuário pedir um gráfico, relatório estatístico ou análise visual dos dados, inclua no final de sua resposta um bloco JSON de visualização exatamente no seguinte formato formatado como markdown \`\`\`json ... \`\`\`:
{
  "type": "visualization",
  "chartType": "bar", // 'bar' | 'line' | 'pie'
  "title": "Título descritivo do gráfico",
  "subtitle": "Subtítulo opcional",
  "xAxisKey": "name",
  "yAxisKey": "value",
  "data": [
    { "name": "Item 1", "value": 10, "color": "var(--accent-500)" },
    { "name": "Item 2", "value": 20, "color": "var(--warning-500)" }
  ]
}
Use cores baseadas nas variáveis CSS: "var(--accent-500)", "var(--warning-500)", "var(--danger-500)", "var(--success-500)", "var(--text-muted)".

Responda sempre em português brasileiro no estilo amigável do MedBot.`;

// Anthropic Tool Declarations
const ANTHROPIC_TOOLS = [
  {
    name: 'query_database_records',
    description: 'Query database records. Used to fetch data from profiles, driver_events, atendimentos, platform_rules, custom_rules, etc.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string', description: 'Table name: driver_events, atendimentos, platform_rules, custom_rules, profiles' },
        select_fields: { type: 'string', description: 'Comma separated fields to select, e.g., "*"' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string', description: 'eq, neq, gt, gte, lt, lte, like, ilike, in' },
              value: { type: 'string' }
            },
            required: ['field', 'operator', 'value']
          }
        },
        order_by: { type: 'string', description: 'Order by column name, e.g. "created_at.desc"' },
        limit: { type: 'integer', description: 'Limit records' }
      },
      required: ['table_name']
    }
  },
  {
    name: 'create_database_record',
    description: 'Insert a new record into a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        data: { type: 'object', description: 'JSON fields' }
      },
      required: ['table_name', 'data']
    }
  },
  {
    name: 'update_database_record',
    description: 'Update existing records in a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string' },
              value: { type: 'string' }
            },
            required: ['field', 'operator', 'value']
          }
        },
        data: { type: 'object', description: 'JSON fields to update' }
      },
      required: ['table_name', 'filters', 'data']
    }
  },
  {
    name: 'delete_database_record',
    description: 'Delete records in a table.',
    input_schema: {
      type: 'object',
      properties: {
        table_name: { type: 'string' },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              operator: { type: 'string' },
              value: { type: 'string' }
            },
            required: ['field', 'operator', 'value']
          }
        }
      },
      required: ['table_name', 'filters']
    }
  },
  {
    name: 'save_generated_report',
    description: 'Saves a structured report or document (markdown text and optional chart) to the administrative reports gallery so the user can access and download it later.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título claro do relatório, ex: "Relatório de Reincidência de Fadiga - Junho 2026"' },
        content: { type: 'string', description: 'Conteúdo do relatório formatado em Markdown.' },
        chart_payload: {
          type: 'object',
          description: 'Estrutura JSON do gráfico Recharts associado (opcional), contendo chartType, title, subtitle, xAxisKey, yAxisKey e data.'
        }
      },
      required: ['title', 'content']
    }
  }
];

// Gemini Tool Declarations
const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'query_database_records',
        description: 'Query database records. Used to fetch data from profiles, driver_events, atendimentos, platform_rules, custom_rules, etc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING', description: 'Table name: driver_events, atendimentos, platform_rules, custom_rules, profiles' },
            select_fields: { type: 'STRING', description: 'Comma separated fields to select, e.g., "*"' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  operator: { type: 'STRING', description: 'eq, neq, gt, gte, lt, lte, like, ilike, in' },
                  value: { type: 'STRING' }
                },
                required: ['field', 'operator', 'value']
              }
            },
            order_by: { type: 'STRING', description: 'Order by column name, e.g. "created_at desc"' },
            limit: { type: 'INTEGER', description: 'Limit records' }
          },
          required: ['table_name']
        }
      },
      {
        name: 'create_database_record',
        description: 'Insert a new record into a table.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING' },
            data: { type: 'OBJECT', description: 'JSON fields' }
          },
          required: ['table_name', 'data']
        }
      },
      {
        name: 'update_database_record',
        description: 'Update existing records in a table.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  operator: { type: 'STRING' },
                  value: { type: 'STRING' }
                },
                required: ['field', 'operator', 'value']
              }
            },
            data: { type: 'OBJECT', description: 'JSON fields to update' }
          },
          required: ['table_name', 'filters', 'data']
        }
      },
      {
        name: 'delete_database_record',
        description: 'Delete records in a table.',
        parameters: {
          type: 'OBJECT',
          properties: {
            table_name: { type: 'STRING' },
            filters: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  field: { type: 'STRING' },
                  operator: { type: 'STRING' },
                  value: { type: 'STRING' }
                },
                required: ['field', 'operator', 'value']
              }
            }
          },
          required: ['table_name', 'filters']
        }
      },
      {
        name: 'save_generated_report',
        description: 'Saves a structured report or document (markdown text and optional chart) to the administrative reports gallery so the user can access and download it later.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Título claro do relatório, ex: "Relatório de Reincidência de Fadiga - Junho 2026"' },
            content: { type: 'STRING', description: 'Conteúdo do relatório formatado em Markdown.' },
            chart_payload: {
              type: 'OBJECT',
              description: 'Estrutura JSON do gráfico Recharts associado (opcional), contendo chartType, title, subtitle, xAxisKey, yAxisKey e data.'
            }
          },
          required: ['title', 'content']
        }
      }
    ]
  }
];

// Helper para aplicar filtros do cliente ao query do Supabase
function applyFilters(query, filters) {
  if (!filters || !Array.isArray(filters)) return query;

  for (const filter of filters) {
    const { field, operator, value } = filter;
    if (!field || !operator) continue;

    switch (operator.toLowerCase()) {
      case 'eq':
        query = query.eq(field, value);
        break;
      case 'neq':
        query = query.neq(field, value);
        break;
      case 'gt':
        query = query.gt(field, value);
        break;
      case 'gte':
        query = query.gte(field, value);
        break;
      case 'lt':
        query = query.lt(field, value);
        break;
      case 'lte':
        query = query.lte(field, value);
        break;
      case 'like':
        query = query.like(field, value);
        break;
      case 'ilike':
        query = query.ilike(field, value);
        break;
      case 'in':
        const list = Array.isArray(value) ? value : String(value).split(',').map(s => s.trim());
        query = query.in(field, list);
        break;
      default:
        query = query.eq(field, value);
    }
  }
  return query;
}

// Operações CRUD do Supabase chamadas pela IA
async function query_database_records(supabase, { table_name, select_fields = '*', filters, order_by, limit = 100 }) {
  let query = supabase.from(table_name).select(select_fields);
  query = applyFilters(query, filters);
  if (order_by) {
    const parts = order_by.split('.');
    const column = parts[0];
    const ascending = parts[1] ? parts[1].toLowerCase() !== 'desc' : true;
    query = query.order(column, { ascending });
  }
  if (limit) {
    query = query.limit(limit);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

async function create_database_record(supabase, { table_name, data }) {
  const { data: inserted, error } = await supabase.from(table_name).insert(data).select();
  if (error) throw new Error(error.message);
  return inserted;
}

async function update_database_record(supabase, { table_name, filters, data }) {
  let query = supabase.from(table_name).update(data);
  query = applyFilters(query, filters);
  const { data: updated, error } = await query.select();
  if (error) throw new Error(error.message);
  return updated;
}

async function delete_database_record(supabase, { table_name, filters }) {
  let query = supabase.from(table_name).delete();
  query = applyFilters(query, filters);
  const { data: deleted, error } = await query.select();
  if (error) throw new Error(error.message);
  return deleted;
}

async function save_generated_report(supabase, userId, { title, content, chart_payload }) {
  const { data, error } = await supabase.from('ai_generated_reports').insert({
    created_by: userId,
    title,
    content,
    chart_payload
  }).select();
  if (error) throw new Error(error.message);
  return { success: true, message: `Relatório "${title}" foi salvo com sucesso na galeria.`, report: data[0] };
}

// Executador de ferramentas unificado
async function executeTool(supabase, userId, name, args) {
  console.log(`[AI Agent Tool] Calling ${name} with args:`, JSON.stringify(args));
  switch (name) {
    case 'query_database_records':
      return await query_database_records(supabase, args);
    case 'create_database_record':
      return await create_database_record(supabase, args);
    case 'update_database_record':
      return await update_database_record(supabase, args);
    case 'delete_database_record':
      return await delete_database_record(supabase, args);
    case 'save_generated_report':
      return await save_generated_report(supabase, userId, args);
    default:
      throw new Error(`Tool ${name} not found.`);
  }
}

// Loop de ferramentas com Gemini
async function runGemini(apiKey, model, userMessage, history, supabase, userId) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Mapeia histórico para o formato do Gemini
  const contents = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    }
  }
  // Adiciona a mensagem atual
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  let loopCount = 0;
  const maxLoops = 6;

  while (loopCount < maxLoops) {
    loopCount++;
    console.log(`[Gemini Loop ${loopCount}] Sending request to model ${model}`);

    const requestBody = {
      contents,
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      tools: GEMINI_TOOLS,
      generationConfig: {
        maxOutputTokens: 2048
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Gemini Error response:`, errText);
      throw new Error(`Gemini API ${res.status}: ${errText}`);
    }

    const resJson = await res.json();
    const candidate = resJson.candidates?.[0];
    const modelContent = candidate?.content;
    const modelParts = modelContent?.parts || [];

    // Push the model's turn to history
    contents.push({
      role: 'model',
      parts: modelParts
    });

    // Check for function calls
    const functionCalls = modelParts.filter(p => p.functionCall);
    if (functionCalls.length === 0) {
      const textPart = modelParts.find(p => p.text);
      return textPart ? textPart.text : '*(sem resposta)*';
    }

    // Process all function calls
    const functionResponses = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall;
      try {
        const result = await executeTool(supabase, userId, name, args);
        functionResponses.push({
          functionResponse: {
            name,
            response: { result }
          }
        });
      } catch (err) {
        console.error(`Error executing tool ${name}:`, err);
        functionResponses.push({
          functionResponse: {
            name,
            response: { error: err.message }
          }
        });
      }
    }

    // Add function response turn
    contents.push({
      role: 'function',
      parts: functionResponses
    });
  }

  throw new Error('Excedeu o número máximo de iterações de ferramentas.');
}

// Loop de ferramentas com Anthropic
async function runAnthropic(apiKey, model, userMessage, history, supabase, userId) {
  const url = 'https://api.anthropic.com/v1/messages';

  // Mapeia histórico para o formato do Anthropic
  const messages = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    }
  }
  // Adiciona a mensagem atual
  messages.push({
    role: 'user',
    content: userMessage
  });

  let loopCount = 0;
  const maxLoops = 6;

  while (loopCount < maxLoops) {
    loopCount++;
    console.log(`[Anthropic Loop ${loopCount}] Sending request to model ${model}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: ANTHROPIC_TOOLS,
        messages
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Anthropic Error response:`, errText);
      throw new Error(`Anthropic API ${res.status}: ${errText}`);
    }

    const resJson = await res.json();

    // Add assistant's response to history
    messages.push({
      role: 'assistant',
      content: resJson.content
    });

    // Check if the response requested any tool use
    const toolUses = resJson.content.filter(c => c.type === 'tool_use');
    if (toolUses.length === 0) {
      const textContent = resJson.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      return textContent || '*(sem resposta)*';
    }

    // Process all tool uses
    const toolResults = [];
    for (const tu of toolUses) {
      const { id, name, input } = tu;
      try {
        const result = await executeTool(supabase, userId, name, input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify(result)
        });
      } catch (err) {
        console.error(`Error executing tool ${name}:`, err);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: id,
          content: JSON.stringify({ error: err.message })
        });
      }
    }

    // Add tool results as user content
    messages.push({
      role: 'user',
      content: toolResults
    });
  }

  throw new Error('Excedeu o número máximo de iterações de ferramentas.');
}

// Extrai bloco JSON do gráfico do texto
function extractChartAndCleanText(text) {
  const regex = /```json\s*(\{[\s\S]*?\})\s*```/;
  const match = text.match(regex);
  if (match) {
    try {
      const chartJson = JSON.parse(match[1]);
      const cleanText = text.replace(regex, '').trim();
      return {
        text: cleanText,
        chart: chartJson
      };
    } catch (err) {
      console.error('Failed to parse chart JSON:', err);
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

      const provider = aiCfg.provider || 'anthropic';
      const model = provider === 'google' 
        ? (aiCfg.google_model || 'gemini-2.5-flash') 
        : (aiCfg.anthropic_model || 'claude-sonnet-4-6');

      // Carrega credencial
      const { data: credRow } = await supabase.from('ai_credentials').select('api_key').eq('provider', provider).maybeSingle();
      if (!credRow?.api_key) {
        return res.status(400).json({
          error: `Provedor de IA (${provider}) selecionado, mas nenhuma chave de API foi configurada. Acesse Admin → IA & Parsing para configurar.`
        });
      }

      const apiKey = credRow.api_key;
      let rawResponse = '';

      // Roda o loop do agente baseado no provedor configurado
      if (provider === 'google') {
        rawResponse = await runGemini(apiKey, model, message, history, supabase, req.authUser.id);
      } else {
        rawResponse = await runAnthropic(apiKey, model, message, history, supabase, req.authUser.id);
      }

      // Limpa e processa retorno de gráfico
      const { text, chart } = extractChartAndCleanText(rawResponse);

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
