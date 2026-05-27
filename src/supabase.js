import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = !!(url && key && !url.includes('placeholder'));

if (!isSupabaseConfigured) {
  console.warn('[MedNet] Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY).');
}

// Fallback evita erro de createClient(undefined, undefined)
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-key',
);

/**
 * Extrai a mensagem de erro real retornada por uma Supabase Edge Function.
 * Se a função retornou uma resposta HTTP de erro (não-2xx), o corpo da
 * resposta (JSON ou texto) é extraído de error.context.
 */
export async function getFunctionErrorMessage(error) {
  if (!error) return 'Erro desconhecido';

  if (error.context && typeof error.context.json === 'function') {
    try {
      // Clona o context para evitar consumir o stream se precisarmos ler de outra forma
      const contextClone = error.context.clone();
      const body = await contextClone.json();
      return body?.error || body?.message || error.message;
    } catch {
      try {
        const text = await error.context.text();
        if (text) return text;
      } catch {
        // Ignora erro ao ler como texto
      }
    }
  }

  return error.message || String(error);
}

