// Loops de tool-use por provedor (Gemini / Anthropic) e utilidades relacionadas.
import { SYSTEM_PROMPT } from './prompt.js';
import { ANTHROPIC_TOOLS, GEMINI_TOOLS } from './tool-schemas.js';
import { executeTool } from './tool-handlers.js';

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

// Extrai bloco JSON do gráfico do texto
export function extractChartAndCleanText(text) {
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
