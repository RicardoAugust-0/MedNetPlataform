// Loops de tool-use por provedor (Gemini / Anthropic) e utilidades relacionadas.
import { SYSTEM_PROMPT } from './prompt.js';
import { ANTHROPIC_TOOLS, GEMINI_TOOLS } from './tool-schemas.js';
import { executeTool } from './tool-handlers.js';

// O modelo não tem noção da data atual por conta própria — sem isto, "último mês"
// / "hoje" viram chutes do treino (ex.: 2023). Injetamos a data real do servidor a
// cada requisição e orientamos a descobrir o intervalo dos dados em vez de presumir.
function systemWithContext() {
  const iso = new Date().toISOString().slice(0, 10);
  return `${SYSTEM_PROMPT}

CONTEXTO TEMPORAL (IMPORTANTE): A data de hoje é ${iso}. Use SEMPRE esta data como referência para "hoje", "este mês", "último mês", "últimos 30 dias", "este ano" etc. NUNCA invente datas de outros anos. Se não tiver certeza do intervalo de datas existente nos dados, DESCUBRA consultando os registros (ex.: 'query_database_records' em driver_events ordenando por 'ocorrido_em' desc e asc para ver o intervalo real) antes de afirmar que "não há dados" no período.`;
}

// Mensagens usadas quando o modelo insiste em devolver um turno vazio — para o
// usuário nunca ver o "(sem resposta)" cru.
const EMPTY_TURN_NUDGE = 'Sua última resposta veio vazia. Escreva agora, em texto, a resposta final para o usuário com base no que já foi apurado. Não chame mais ferramentas — apenas redija a resposta.';
const EMPTY_TURN_FALLBACK = 'Desculpe, me embolei para concluir essa resposta agora. 🙏 Pode reenviar a pergunta ou reformulá-la um pouco? Já volto a funcionar normalmente.';

// Loop de ferramentas com Gemini
async function runGemini(apiKey, model, userMessage, history, supabase, userId, ctx = {}) {
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
  let emptyRetried = false;
  const maxLoops = 6;

  while (loopCount < maxLoops) {
    loopCount++;
    console.log(`[Gemini Loop ${loopCount}] Sending request to model ${model}`);

    const requestBody = {
      contents,
      systemInstruction: {
        parts: [{ text: systemWithContext() }]
      },
      tools: GEMINI_TOOLS,
      generationConfig: {
        maxOutputTokens: 8192
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
    const finishReason = candidate?.finishReason;
    const usage = resJson.usageMetadata;
    console.log(`[Gemini Loop ${loopCount}] finishReason=${finishReason} | tokens: in=${usage?.promptTokenCount} out=${usage?.candidatesTokenCount} total=${usage?.totalTokenCount}`);
    if (finishReason === 'MAX_TOKENS') console.warn(`[Gemini] ⚠️ Resposta truncada por limite de tokens (MAX_TOKENS).`);

    const functionCalls = modelParts.filter(p => p.functionCall);
    const textPart = modelParts.find(p => p.text && p.text.trim());

    // Turno vazio (sem texto e sem ferramenta): cutuca o modelo uma vez antes de
    // desistir — o usuário nunca deve ver "(sem resposta)".
    if (functionCalls.length === 0 && !textPart) {
      if (!emptyRetried) {
        emptyRetried = true;
        contents.push({ role: 'model', parts: [{ text: 'Um momento.' }] });
        contents.push({ role: 'user', parts: [{ text: EMPTY_TURN_NUDGE }] });
        continue;
      }
      return EMPTY_TURN_FALLBACK;
    }

    // Push the model's turn to history
    contents.push({
      role: 'model',
      parts: modelParts
    });

    // Sem function calls → resposta final em texto
    if (functionCalls.length === 0) {
      return textPart.text;
    }

    // Process all function calls
    const functionResponses = [];
    for (const fc of functionCalls) {
      const { name, args } = fc.functionCall;
      try {
        const result = await executeTool(supabase, userId, name, args, ctx);
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
async function runAnthropic(apiKey, model, userMessage, history, supabase, userId, ctx = {}) {
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
  let emptyRetried = false;
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
        max_tokens: 8192,
        system: systemWithContext(),
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
    const content = resJson.content || [];
    const stopReason = resJson.stop_reason;
    const usage = resJson.usage;
    console.log(`[Anthropic Loop ${loopCount}] stop_reason=${stopReason} | tokens: in=${usage?.input_tokens} out=${usage?.output_tokens}`);
    if (stopReason === 'max_tokens') console.warn(`[Anthropic] ⚠️ Resposta truncada por limite de tokens (max_tokens).`);

    const toolUses = content.filter(c => c.type === 'tool_use');
    const textContent = content.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();

    // Turno vazio (sem texto e sem ferramenta): cutuca o modelo uma vez antes de
    // desistir — o usuário nunca deve ver "(sem resposta)".
    if (toolUses.length === 0 && !textContent) {
      if (!emptyRetried) {
        emptyRetried = true;
        messages.push({ role: 'assistant', content: 'Um momento.' });
        messages.push({ role: 'user', content: EMPTY_TURN_NUDGE });
        continue;
      }
      return EMPTY_TURN_FALLBACK;
    }

    // Add assistant's response to history
    messages.push({
      role: 'assistant',
      content
    });

    // Sem tool use → resposta final em texto
    if (toolUses.length === 0) {
      return textContent;
    }

    // Process all tool uses
    const toolResults = [];
    for (const tu of toolUses) {
      const { id, name, input } = tu;
      try {
        const result = await executeTool(supabase, userId, name, input, ctx);
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

// Resolve o modelo configurado para um provedor (com defaults).
export function modelForProvider(provider, aiCfg) {
  return provider === 'google'
    ? (aiCfg.google_model || 'gemini-2.5-flash')
    : (aiCfg.anthropic_model || 'claude-sonnet-4-6');
}

// Lê a chave de API de um provedor (ou null se não configurada).
export async function getProviderKey(supabase, provider) {
  const { data } = await supabase.from('ai_credentials').select('api_key').eq('provider', provider).maybeSingle();
  return data?.api_key || null;
}

// Roda o loop do agente para um provedor específico.
export async function runProvider(provider, apiKey, model, message, history, supabase, userId, ctx = {}) {
  return provider === 'google'
    ? await runGemini(apiKey, model, message, history, supabase, userId, ctx)
    : await runAnthropic(apiKey, model, message, history, supabase, userId, ctx);
}

// Extrai bloco JSON (gráfico ou ação de navegação) do texto da IA.
// Tenta ```json primeiro, depois ``` simples como fallback.
export function extractChartAndCleanText(text) {
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
