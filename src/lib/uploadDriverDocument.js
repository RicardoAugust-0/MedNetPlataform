import { supabase } from '../supabase.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = 'driver-documents';
const DRIVER_DOCUMENT_COLUMNS = 'id, driver_health_id, motorista_nome, placa, tipo_documento, file_name, storage_path, status, extracted_data, error_message, created_at, reviewed_by, reviewed_at';

function slugify(name) {
  return String(name || 'motorista')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'motorista';
}

// Envia um documento do motorista (CNH/ASO/Polissonografia) para o storage privado
// e registra a linha correspondente em driver_documents (status inicial: pendente).
export async function uploadDriverDocument(file, { driverHealthId = null, motorista, placa, tipoDocumento }) {
  if (!motorista) throw new Error('motorista obrigatório para upload de documento');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Use JPG, PNG, WebP ou PDF');
  if (file.size > MAX_BYTES) throw new Error('Arquivo maior que 10 MB');

  const ext = EXT_MAP[file.type];
  const identityPath = driverHealthId || `${slugify(motorista)}-${slugify(placa || 'sem-placa')}`;
  const path = `${identityPath}/${tipoDocumento}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.from('driver_documents').insert({
    driver_health_id: driverHealthId,
    motorista_nome: motorista,
    placa: placa || null,
    tipo_documento: tipoDocumento,
    storage_path: path,
    file_name: file.name,
  }).select(DRIVER_DOCUMENT_COLUMNS).single();

  if (error) throw error;
  return data;
}

export async function listDriverDocuments(identity) {
  const driverHealthId = typeof identity === 'object' ? identity?.driverHealthId : null;
  const motorista = typeof identity === 'string' ? identity : identity?.motorista;
  const placa = typeof identity === 'object' ? identity?.placa : null;
  if (!driverHealthId && !motorista) return [];

  let query = supabase
    .from('driver_documents')
    .select(DRIVER_DOCUMENT_COLUMNS);

  if (driverHealthId) {
    query = query.eq('driver_health_id', driverHealthId);
  } else {
    query = query.eq('motorista_nome', motorista);
    query = placa ? query.eq('placa', placa) : query.is('placa', null);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// URL assinada temporária para visualizar/baixar o documento (bucket é privado).
export async function getDriverDocumentUrl(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 600);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeDriverDocument(doc) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('driver_documents').delete().eq('id', doc.id);
  if (error) throw error;
}
