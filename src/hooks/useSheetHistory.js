import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';

export function useSheetHistory() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [loaded, setLoaded]   = useState(false);

  const load = useCallback(async (meses) => {
    if (!isSupabaseConfigured) {
      setError('Supabase não configurado.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const params = meses ? `?meses=${encodeURIComponent(meses)}` : '';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/read-sheet${params}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Erro ao ler planilha Google Sheets.');

      setRows(data.rows || []);
      setLoaded(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setRows([]);
    setLoaded(false);
    setError(null);
  }, []);

  return { rows, loading, error, loaded, load, reset };
}
