import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const DRIVER_DOCUMENT_PROCESS_COLUMNS = 'id, storage_path, tipo_documento';
const DRIVER_DOCUMENT_RESPONSE_COLUMNS = 'id, motorista_nome, placa, tipo_documento, file_name, storage_path, status, extracted_data, error_message, created_at, reviewed_by, reviewed_at';

interface RequestBody {
  document_id: string;
}

const EXTRACTION_SCHEMAS: Record<string, string> = {
  cnh: `{
  "nome": "string ou null",
  "cpf": "string formatado 000.000.000-00 ou null",
  "rg": "string ou null",
  "data_nascimento": "string YYYY-MM-DD ou null",
  "cnh_numero": "string ou null",
  "cnh_categoria": "string ou null (ex: AE, B, D)",
  "cnh_validade": "string YYYY-MM-DD ou null"
}`,
  aso: `{
  "data_exame": "string YYYY-MM-DD ou null",
  "aptidao": "string: Apto | Apto com Restrições | Inapto | null",
  "observacoes": "string ou null (restrições, medicações, achados relevantes)"
}`,
  polissonografia: `{
  "diagnostico": "string ou null (ex: Apneia Obstrutiva do Sono Moderada)",
  "indice_apneia_hipopneia": "string ou null (IAH, ex: 22 eventos/hora)",
  "gravidade": "string: Leve | Moderada | Grave | null"
}`,
};

const DOC_LABELS: Record<string, string> = {
  cnh: 'CNH (Carteira Nacional de Habilitação)',
  aso: 'ASO (Atestado de Saúde Ocupacional)',
  polissonografia: 'Laudo de Polissonografia',
};

// Documentos .pdf vão como "document_url" pro OCR da Mistral; imagens (jpg/png/webp) como "image_url".
function mistralDocType(path: string): 'document_url' | 'image_url' {
  return path.toLowerCase().endsWith('.pdf') ? 'document_url' : 'image_url';
}

async function runMistralOcr(apiKey: string, documentUrl: string, docType: 'document_url' | 'image_url'): Promise<string> {
  const document = docType === 'document_url'
    ? { type: 'document_url', document_url: documentUrl }
    : { type: 'image_url', image_url: documentUrl };

  const res = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-ocr-latest', document }),
  });
  if (!res.ok) throw new Error(`Mistral OCR ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const pages = json.pages || [];
  return pages.map((p: { markdown?: string }) => p.markdown || '').join('\n\n');
}

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.content?.[0]?.text || '';
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1024 } }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJsonFromAiResponse(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, '```').split('```').join('').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('IA não retornou um JSON válido');
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const sbSvc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let documentId: string | undefined;

  try {
    // Autenticação do operador
    const authHeader = req.headers.get('Authorization') || '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: 'Não autenticado' }, 401);

    const body: RequestBody = await req.json();
    documentId = body.document_id;
    if (!documentId) return json({ error: 'document_id é obrigatório' }, 400);

    const { data: doc, error: docErr } = await sbSvc.from('driver_documents').select(DRIVER_DOCUMENT_PROCESS_COLUMNS).eq('id', documentId).single();
    if (docErr || !doc) throw new Error('Documento não encontrado');

    // 1. URL assinada temporária do arquivo (o bucket é privado)
    const { data: signedData, error: signedErr } = await sbSvc.storage
      .from('driver-documents')
      .createSignedUrl(doc.storage_path, 300);
    if (signedErr || !signedData) throw new Error('Falha ao gerar URL do documento: ' + signedErr?.message);

    // 2. Chave da Mistral (OCR)
    const { data: mistralCred } = await sbSvc.from('ai_credentials').select('api_key').eq('provider', 'mistral').maybeSingle();
    if (!mistralCred?.api_key) throw new Error('Chave de API da Mistral não configurada. Defina em Administração > IA.');

    // 3. OCR do documento
    const ocrText = await runMistralOcr(mistralCred.api_key, signedData.signedUrl, mistralDocType(doc.storage_path));
    if (!ocrText.trim()) throw new Error('OCR não retornou nenhum texto do documento');

    // 4. Configuração de IA da plataforma (mesmo provedor usado nos laudos)
    const { data: cfgRow } = await sbSvc.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle();
    const aiCfg = cfgRow?.value || {};
    const provider = aiCfg.provider || 'anthropic';
    const model = provider === 'google' ? (aiCfg.google_model || 'gemini-2.5-flash') : (aiCfg.anthropic_model || 'claude-sonnet-4-6');

    const { data: credRow } = await sbSvc.from('ai_credentials').select('api_key').eq('provider', provider).maybeSingle();
    if (!credRow?.api_key) throw new Error(`Chave de API do ${provider === 'google' ? 'Google' : 'Anthropic'} não configurada.`);

    // 5. Extração estruturada dos campos relevantes ao tipo de documento
    const schema = EXTRACTION_SCHEMAS[doc.tipo_documento];
    const prompt = `Você é um assistente de extração de dados de documentos de motoristas de transporte.
Abaixo está o texto (via OCR) de um documento do tipo "${DOC_LABELS[doc.tipo_documento] || doc.tipo_documento}".
Extraia os dados e responda APENAS com um JSON válido no formato exato abaixo, sem markdown, sem comentários, sem texto adicional:
${schema}

Texto OCR do documento:
"""
${ocrText.slice(0, 12000)}
"""`;

    const aiResponse = provider === 'google'
      ? await callGemini(credRow.api_key, model, prompt)
      : await callAnthropic(credRow.api_key, model, prompt);

    const extractedData = parseJsonFromAiResponse(aiResponse);

    const { data: updated, error: updateErr } = await sbSvc.from('driver_documents').update({
      ocr_text: ocrText,
      extracted_data: extractedData,
      status: 'processado',
      error_message: null,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId).select(DRIVER_DOCUMENT_RESPONSE_COLUMNS).single();
    if (updateErr) throw updateErr;

    return json({ document: updated });

  } catch (err) {
    console.error('[process-driver-document]', err);
    if (documentId) {
      await sbSvc.from('driver_documents').update({
        status: 'erro',
        error_message: String(err instanceof Error ? err.message : err),
        updated_at: new Date().toISOString(),
      }).eq('id', documentId);
    }
    return json({ error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
