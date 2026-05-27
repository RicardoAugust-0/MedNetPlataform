import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  motorista: string;
  placa?: string;
  clinicalData: {
    escala_epworth: number;
    polissonografia: string;
    historico_clinico: string;
    ultimo_exame_em: string;
  };
  provider?: string;
  model?: string;
}

interface TelemetryEvent {
  nome_evento: string;
  severidade: string;
  categoria_bucket: string;
  ocorrido_em: string;
}

interface Atendimento {
  tipo: string;
  obs: string;
  created_at: string;
}

function buildPrompt(
  motorista: string,
  placa: string,
  clinical: RequestBody['clinicalData'],
  telemetries: TelemetryEvent[],
  actions: Atendimento[]
): string {
  // Contadores de fadiga
  const total = telemetries.length;
  const critical = telemetries.filter(t => t.severidade === 'Gravíssimo' || t.severidade === 'Grave').length;
  const yawning = telemetries.filter(t => String(t.nome_evento).toLowerCase().includes('bocejo')).length;
  const closedEyes = telemetries.filter(t => String(t.nome_evento).toLowerCase().includes('olho fechado') || String(t.nome_evento).toLowerCase().includes('olhos fechados')).length;
  
  // Categorias
  const eventTypes = [...new Set(telemetries.map(t => t.nome_evento))].join(', ');
  
  // Contadores de atendimento
  const totalActions = actions.length;
  const interventions = actions.filter(a => a.tipo === 'intervencao').length;
  const discards = actions.filter(a => a.tipo === 'descarte').length;

  return `Você é um especialista em medicina do tráfego e fadiga humana da MedNet Fadiga Zero.
Analise os dados consolidados do motorista e gere um Laudo Clínico-Operacional integrado de Perfil de Fadiga.

### 1. Identificação do Condutor
- Motorista: ${motorista}
- Veículo/Placa: ${placa || 'Sem registro'}

### 2. Dados Clínicos e de Exames (Ficha de Saúde)
- Escala de Sonolência de Epworth: ${clinical.escala_epworth} de 24 pontos (0-9: Normal, 10-15: Sonolência Excessiva Diurna, >=16: Sonolência Crítica)
- Polissonografia (Apneia): ${clinical.polissonografia || 'Sem exames adicionais cadastrados.'}
- Histórico Clínico de Saúde: ${clinical.historico_clinico || 'Sem anotações no histórico clínico.'}
- Última Revisão Médica: ${clinical.ultimo_exame_em || 'Sem data de exame cadastrada.'}

### 3. Histórico de Fadiga por Telemetria (Últimos 100 alertas)
- Total de alertas de fadiga: ${total}
- Alertas Críticos (Grave/Gravíssimo): ${critical}
- Eventos de Bocejo: ${yawning}
- Eventos de Olhos Fechados/Falta de Atenção: ${closedEyes}
- Tipos de eventos registrados: ${eventTypes || 'Sem alertas de telemetria no histórico recente.'}

### 4. Histórico de Atendimentos Operacionais (Tratativas)
- Total de contatos operacionais: ${totalActions}
- Intervenções de campo registradas (ligações/ações de pausa): ${interventions}
- Descartes operacionais (alertas cancelados/justificados): ${discards}

### Instruções de Estrutura do Laudo em Markdown:
1. Comece com um título executivo: \`# Laudo Integrado de Perfil de Fadiga\`.
2. Inclua as seções:
   - **## Análise Integrada (Fadiga + Saúde)**: Discorra sobre como os exames médicos (como escala Epworth e polissonografia) se relacionam com o comportamento de direção e os alertas reais de telemetria (ex: escala Epworth alta cruzada com alto número de bocejos e intervenções).
   - **## Diagnóstico de Risco Operacional**: Classifique o risco geral do motorista (Baixo, Médio, Alto, Crítico) baseando-se no conjunto de dados.
   - **## Plano de Ação Recomendado**: Recomendações práticas tanto para o setor médico (ex: encaminhar para polissonografia ou revisão de medicação) quanto para o gestor de logística (ex: ajustar rotas, turnos de condução, pausas preventivas obrigatórias).
3. Seja formal, clínico e focado na segurança de trânsito. Máximo 400 palavras.`;
}

// Provedores
async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text || '*(sem resposta)*';
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '*(sem resposta)*';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    // Autenticação do operador
    const authHeader = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: 'Não autenticado' }, 401);

    // Conexão via service_role para leitura
    const sbSvc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const body: RequestBody = await req.json();
    const { motorista, placa, clinicalData } = body;
    if (!motorista?.trim()) return json({ error: 'motorista é obrigatório' }, 400);

    // Carrega ai_config padrão
    const { data: cfgRow } = await sbSvc.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle();
    const aiCfg = cfgRow?.value || {};

    const provider = body.provider || aiCfg.provider || 'anthropic';
    const model    = body.model    || (provider === 'google' ? aiCfg.google_model : aiCfg.anthropic_model) || (provider === 'google' ? 'gemini-2.5-flash' : 'claude-sonnet-4-6');

    // Chave de API
    const { data: credRow } = await sbSvc.from('ai_credentials').select('api_key').eq('provider', provider).maybeSingle();
    if (!credRow?.api_key) {
      return json({
        error: `Chave de API do ${provider === 'google' ? 'Google' : 'Anthropic'} não configurada. Defina as credenciais no painel de Administração.`,
      }, 400);
    }
    const apiKey = credRow.api_key;

    // 1. Busca histórico de telemetria do motorista nos últimos 6 meses
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);

    let teleQuery = sbSvc.from('driver_events').select('nome_evento, severidade, categoria_bucket, ocorrido_em');
    if (placa) {
      teleQuery = teleQuery.or(`placa.eq.${placa},nome.eq.${motorista}`);
    } else {
      teleQuery = teleQuery.eq('nome', motorista);
    }
    
    const { data: telemetries, error: teleErr } = await teleQuery
      .gte('ocorrido_em', cutoff.toISOString())
      .order('ocorrido_em', { ascending: false });

    if (teleErr) throw new Error('Erro ao consultar telemetria: ' + teleErr.message);

    // 2. Busca histórico de contatos (atendimentos) operacionais
    let atendQuery = sbSvc.from('atendimentos').select('tipo, obs, created_at');
    if (placa) {
      atendQuery = atendQuery.or(`placa.eq.${placa},motorista.eq.${motorista}`);
    } else {
      atendQuery = atendQuery.eq('motorista', motorista);
    }
    
    const { data: actions, error: atendErr } = await atendQuery
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false });

    if (atendErr) throw new Error('Erro ao consultar atendimentos: ' + atendErr.message);

    // Constrói o Prompt
    const prompt = buildPrompt(
      motorista,
      placa || '',
      clinicalData,
      telemetries || [],
      actions || []
    );

    // Invoca IA
    const report = provider === 'google'
      ? await callGemini(apiKey, model, prompt)
      : await callAnthropic(apiKey, model, prompt);

    return json({ report });

  } catch (err) {
    console.error('[generate-dossier-report]', err);
    return json({ error: String(err) }, 500);
  }
});
