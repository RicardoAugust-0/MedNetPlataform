import { supabase } from '../supabase.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

export async function uploadImage(file, userId) {
  if (!userId) throw new Error('userId obrigatório para upload de imagem');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error(`Tipo de arquivo não suportado: ${file.type}`);

  const ext = EXT_MAP[file.type] ?? file.name.split('.').pop().toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('workspace-images')
    .upload(path, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('workspace-images')
    .getPublicUrl(path);

  return data.publicUrl;
}
