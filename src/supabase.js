import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(url && key && !url.includes('placeholder'));

if (!isSupabaseConfigured) {
  console.warn('[MedNet] Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

// Fallback evita erro de createClient(undefined, undefined)
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
);
