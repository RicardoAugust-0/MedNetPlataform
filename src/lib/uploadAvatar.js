import { supabase } from '../supabase.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT_MAP = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 2 * 1024 * 1024;

// Upload do avatar do usuário. Usa um único caminho determinístico por usuário
// (com upsert) para evitar arquivos órfãos a cada troca.
// Retorna a URL pública (com cache-buster) ou lança erro.
export async function uploadAvatar(file, userId) {
  if (!userId) throw new Error('userId obrigatório para upload de avatar');
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Use JPG, PNG ou WebP');
  if (file.size > MAX_BYTES) throw new Error('Arquivo maior que 2 MB');

  const ext = EXT_MAP[file.type];
  const path = `${userId}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-buster para forçar refresh visual após troca.
  return `${data.publicUrl}?t=${Date.now()}`;
}

// Remove o avatar do usuário (todos os arquivos da pasta dele em avatars/).
export async function removeAvatar(userId) {
  if (!userId) throw new Error('userId obrigatório');
  const { data: files, error: listError } = await supabase.storage
    .from('avatars')
    .list(userId);
  if (listError) throw listError;
  if (!files?.length) return;
  const paths = files.map(f => `${userId}/${f.name}`);
  const { error: removeError } = await supabase.storage.from('avatars').remove(paths);
  if (removeError) throw removeError;
}
