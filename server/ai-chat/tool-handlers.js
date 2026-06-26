// Implementação das ferramentas que a IA pode executar (CRUD, admin, PDF).
import { renderMarkdownToPdf } from '../pdf-generator.js';

// Bucket de Storage onde os PDFs gerados pela IA são guardados (privado; acesso via signed URL).
const PDF_BUCKET = 'ai-reports';

const AI_CONFIG_DEFAULT = { provider: 'anthropic', anthropic_model: 'claude-sonnet-4-6', google_model: 'gemini-2.5-flash' };

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
async function query_database_records(supabase, { table_name, select_fields = '*', filters, order_by, limit = 500 }) {
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

// Configura provedor/modelo de IA ativos (app_settings.ai_config). Mescla com a config atual.
async function configure_ai_provider(supabase, userId, { provider, anthropic_model, google_model }) {
  if (provider && !['anthropic', 'google'].includes(provider)) {
    throw new Error("provider deve ser 'anthropic' ou 'google'.");
  }
  const { data: cfgRow } = await supabase.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle();
  const next = { ...AI_CONFIG_DEFAULT, ...(cfgRow?.value || {}) };
  if (provider) next.provider = provider;
  if (anthropic_model) next.anthropic_model = anthropic_model;
  if (google_model) next.google_model = google_model;

  const { error } = await supabase.from('app_settings').upsert(
    { key: 'ai_config', value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
  return { success: true, message: 'Configuração de IA atualizada.', ai_config: next };
}

// Salva/substitui a chave de API de um provedor (upsert em ai_credentials).
async function set_ai_api_key(supabase, userId, { provider, api_key }) {
  if (!['anthropic', 'google'].includes(provider)) {
    throw new Error("provider deve ser 'anthropic' ou 'google'.");
  }
  if (!api_key || !String(api_key).trim()) {
    throw new Error('api_key é obrigatória.');
  }
  const { error } = await supabase.from('ai_credentials').upsert(
    { provider, api_key: String(api_key).trim(), updated_at: new Date().toISOString(), updated_by: userId },
    { onConflict: 'provider' }
  );
  if (error) throw new Error(error.message);
  // Não retorna a chave; apenas confirma.
  return { success: true, provider, message: `Chave de API do provedor ${provider} salva com sucesso.` };
}

// Limpa o histórico de mensagens do usuário (todas ou de uma thread).
// Sinaliza em ctx para a rota refletir a limpeza na resposta (e o front atualizar em tempo real).
// A remoção das threads, quando "all", é feita na rota (evita conflito com o insert em andamento).
async function clear_chat_history(supabase, userId, { thread_id } = {}, ctx = {}) {
  let query = supabase.from('ai_chat_messages').delete().eq('user_id', userId);
  if (thread_id) query = query.eq('thread_id', thread_id);
  const { error } = await query;
  if (error) throw new Error(error.message);
  ctx.historyCleared = thread_id ? 'thread' : 'all';
  ctx.clearedThreadId = thread_id || null;
  return {
    success: true,
    message: thread_id
      ? 'O histórico desta conversa foi limpo.'
      : 'Todo o histórico de conversas foi limpo com sucesso.'
  };
}

// Garante que o bucket de PDFs existe (idempotente).
async function ensurePdfBucket(supabase) {
  const { error } = await supabase.storage.createBucket(PDF_BUCKET, { public: false });
  if (error && !/already exists|exists/i.test(error.message || '') && String(error.statusCode || '') !== '409') {
    console.warn(`[PDF] Aviso ao criar bucket ${PDF_BUCKET}:`, error.message);
  }
}

// Transforma um título em nome de arquivo seguro.
function slugify(s) {
  return String(s || 'relatorio')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'relatorio';
}

// Renderiza Markdown em PDF, envia ao Storage e devolve um link de download assinado.
async function generate_pdf_report(supabase, userId, { title, content, subtitle }) {
  if (!title || !content) throw new Error('title e content são obrigatórios para gerar o PDF.');

  const bytes = await renderMarkdownToPdf({ title, subtitle, content });
  await ensurePdfBucket(supabase);

  const filename = `${slugify(title)}-${Date.now()}.pdf`;
  const path = `${userId}/${filename}`;

  const { error: upErr } = await supabase.storage.from(PDF_BUCKET).upload(path, Buffer.from(bytes), {
    contentType: 'application/pdf',
    upsert: true
  });
  if (upErr) throw new Error('Falha ao enviar o PDF para o armazenamento: ' + upErr.message);

  const EXPIRES = 60 * 60 * 24 * 7; // 7 dias
  const { data: signed, error: signErr } = await supabase.storage.from(PDF_BUCKET).createSignedUrl(path, EXPIRES);
  if (signErr) throw new Error('Falha ao gerar o link de download: ' + signErr.message);

  // Em algumas versões a signedUrl é relativa; normaliza para URL absoluta.
  let downloadUrl = signed.signedUrl;
  if (downloadUrl && downloadUrl.startsWith('/')) {
    const base = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
    downloadUrl = base + downloadUrl;
  }

  return {
    success: true,
    filename,
    download_url: downloadUrl,
    expires_in: '7 dias',
    message: `PDF "${title}" gerado com sucesso. Entregue ao usuário o link de download em formato Markdown clicável: [Baixar PDF](${downloadUrl})`
  };
}

// Executador de ferramentas unificado. `ctx` acumula efeitos colaterais (ex: limpeza de histórico).
export async function executeTool(supabase, userId, name, args, ctx = {}) {
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
    case 'configure_ai_provider':
      return await configure_ai_provider(supabase, userId, args);
    case 'set_ai_api_key':
      return await set_ai_api_key(supabase, userId, args);
    case 'clear_chat_history':
      return await clear_chat_history(supabase, userId, args, ctx);
    case 'generate_pdf_report':
      return await generate_pdf_report(supabase, userId, args);
    default:
      throw new Error(`Tool ${name} not found.`);
  }
}
