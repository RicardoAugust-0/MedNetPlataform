import { supabase } from '../supabase.js';

export async function uploadImage(file, userId) {
  const ext = file.name.split('.').pop().toLowerCase();
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
