// Implementação das ferramentas que a IA pode executar (Geração de PDFs).
import { renderMarkdownToPdf } from '../pdf-generator.js';

// Bucket de Storage onde os PDFs gerados pela IA são guardados (privado; acesso via signed URL).
const PDF_BUCKET = 'ai-reports';

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

// Executador de ferramentas unificado. `ctx` acumula efeitos colaterais.
export async function executeTool(supabase, userId, name, args, ctx = {}) {
  console.log(`[AI Agent Tool] Executando ${name}.`);
  switch (name) {
    case 'generate_pdf_report':
      return await generate_pdf_report(supabase, userId, args);
    default:
      throw new Error(`Tool ${name} not found.`);
  }
}
