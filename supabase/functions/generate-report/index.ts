import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  transportadora: string;
  months?:    number;   // padrão 3
  platform_id?: string; // padrão 'maxtrack'
  provider?:  string;   // 'anthropic' | 'google' — sobrescreve ai_config
  model?:     string;   // sobrescreve ai_config
}

interface DriverMetrics {
  nome: string; placa: string; frota: string;
  total: number; intervencoes: number; reportar: number; tecnicos: number;
  ultimo_evento: string | null;
}

interface MonthBucket { mes: string; total: number; intervencoes: number; }

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

function buildPrompt(transportadora: string, period: string, drivers: DriverMetrics[], trend: MonthBucket[], totalEventos: number, totalIntervencoes: number): string {
  const driverBlock = drivers.slice(0, 15).map((d, i) =>
    `${i + 1}. ${d.nome} (${d.placa}${d.frota ? ' · frota ' + d.frota : ''}) — ${d.intervencoes} intervenção(ões), ${d.reportar} reportável(eis), ${d.tecnicos} técnico(s)`
  ).join('\n');

  const trendBlock = trend.map(t => `${t.mes}: ${t.total} eventos (${t.intervencoes} intervenções)`).join('\n');

  return `Você é o sistema de relatórios de segurança da MedNet Fadiga Zero.
Gere um relatório executivo em PT-BR, em markdown, para ser apresentado em reunião com a transportadora.

## Dados do período
- Transportadora: ${transportadora}
- Período: ${period}
- Total de eventos: ${totalEventos}
- Intervenções imediatas: ${totalIntervencoes}
- Motoristas monitorados: ${drivers.length}

## Ranking de motoristas (por intervenções)
${driverBlock || 'Nenhum motorista com eventos no período.'}

## Tendência mensal
${trendBlock || 'Sem dados de tendência.'}

## Instruções de formatação
1. Use \`## Seção\` para cada bloco do relatório.
2. Use negrito para nomes de motoristas e números relevantes.
3. Inclua as seções: Resumo Executivo, Motoristas em Atenção, Tendência, Recomendações.
4. Seja objetivo — máximo 500 palavras.
5. Não invente dados além do que foi fornecido.`;
}

// ── Provedores ────────────────────────────────────────────────────────────────

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

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    // Autenticação
    const authHeader = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: 'Não autenticado' }, 401);

    // Service role para leitura de dados e credenciais
    const sbSvc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Body da request
    const body: RequestBody = await req.json();
    const { transportadora, months = 3, platform_id } = body;
    if (!transportadora?.trim()) return json({ error: 'transportadora é obrigatório' }, 400);

    // Configuração de IA (provider + model padrão)
    const { data: cfgRow } = await sbSvc.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle();
    const aiCfg = cfgRow?.value || {};

    const provider = body.provider || aiCfg.provider || 'anthropic';
    const model    = body.model    || (provider === 'google' ? aiCfg.google_model : aiCfg.anthropic_model) || (provider === 'google' ? 'gemini-2.5-flash' : 'claude-sonnet-4-6');

    // Credencial do provedor escolhido
    const { data: credRow } = await sbSvc.from('ai_credentials').select('api_key').eq('provider', provider).maybeSingle();
    if (!credRow?.api_key) {
      return json({
        error: `Chave de API ${provider === 'google' ? 'Google' : 'Anthropic'} não configurada. Acesse Admin → Inteligência Artificial para configurar.`,
      }, 400);
    }
    const apiKey = credRow.api_key;

    // Carrega aliases de transportadoras para fazer busca cruzada (Monitor <-> Planilha)
    const { data: aliasesRow } = await sbSvc.from('app_settings').select('value').eq('key', 'carrier_aliases').maybeSingle();
    const aliases = aliasesRow?.value || {};

    const rawNames = [transportadora.trim()];
    // Se for chave (nome no Monitor), adiciona o valor (nome na planilha)
    if (aliases[transportadora.trim()]) {
      rawNames.push(aliases[transportadora.trim()]);
    }
    // Se for valor (nome na planilha), adiciona a chave (nome no Monitor)
    const monitorName = Object.keys(aliases).find(k => aliases[k] === transportadora.trim());
    if (monitorName) {
      rawNames.push(monitorName);
    }

    // Consulta driver_events
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    let evQuery = sbSvc
      .from('driver_events')
      .select('nome, placa, frota, nome_evento, categoria_bucket, severidade, turno, ocorrido_em')
      .in('transportadora', rawNames)
      .gte('ocorrido_em', cutoff.toISOString());

    if (platform_id) {
      evQuery = evQuery.eq('platform_id', platform_id);
    }

    const { data: events, error: evErr } = await evQuery.order('ocorrido_em', { ascending: false });

    if (evErr) throw new Error('Erro ao consultar driver_events: ' + evErr.message);
    if (!events || events.length === 0) {
      return json({
        report: `## Sem dados\n\nNenhum evento encontrado para **${transportadora}** nos últimos ${months} meses.\n\nVerifique se os dados foram importados corretamente.`,
        meta: { totalEventos: 0, drivers: 0, provider, model },
      });
    }

    // Agrega por motorista
    const driverMap = new Map<string, DriverMetrics>();
    for (const e of events) {
      if (!driverMap.has(e.placa)) driverMap.set(e.placa, { nome: e.nome || e.placa, placa: e.placa, frota: e.frota || '', total: 0, intervencoes: 0, reportar: 0, tecnicos: 0, ultimo_evento: null });
      const d = driverMap.get(e.placa)!;
      d.total++;
      if (e.categoria_bucket === 'intervencao') d.intervencoes++;
      else if (e.categoria_bucket === 'reportar') d.reportar++;
      else d.tecnicos++;
      if (!d.ultimo_evento || e.ocorrido_em > d.ultimo_evento) d.ultimo_evento = e.ocorrido_em;
    }
    const drivers = [...driverMap.values()].sort((a, b) => b.intervencoes - a.intervencoes || b.total - a.total);

    // Tendência mensal
    const trendMap = new Map<string, MonthBucket>();
    for (const e of events) {
      const mes = e.ocorrido_em.slice(0, 7);
      if (!trendMap.has(mes)) trendMap.set(mes, { mes: monthLabel(e.ocorrido_em), total: 0, intervencoes: 0 });
      const t = trendMap.get(mes)!;
      t.total++;
      if (e.categoria_bucket === 'intervencao') t.intervencoes++;
    }
    const trend = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

    const totalIntervencoes = drivers.reduce((s, d) => s + d.intervencoes, 0);
    const period = `${monthLabel(cutoff.toISOString())} a ${monthLabel(new Date().toISOString())} (${months} meses)`;
    const prompt = buildPrompt(transportadora, period, drivers, trend, events.length, totalIntervencoes);

    // Chama o provedor escolhido
    const report = provider === 'google'
      ? await callGemini(apiKey, model, prompt)
      : await callAnthropic(apiKey, model, prompt);

    return json({
      report,
      meta: { totalEventos: events.length, totalIntervencoes, drivers: drivers.length, period, provider, model },
    });

  } catch (err) {
    console.error('[generate-report]', err);
    return json({ error: String(err) }, 500);
  }
});
