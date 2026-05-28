import { useState, useCallback, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured, getFunctionErrorMessage } from '../supabase.js';

const SheetHistoryContext = createContext(null);

export function SheetHistoryProvider({ children }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [loaded, setLoaded]   = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

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

      const { data, error: fnErr } = await supabase.functions.invoke('read-sheet', {
        method: 'GET',
        queryParams: meses ? { meses } : undefined,
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (fnErr) {
        const errMsg = await getFunctionErrorMessage(fnErr);
        throw new Error(errMsg);
      }
      if (!data?.ok) throw new Error(data?.error || 'Erro ao ler planilha Google Sheets.');

      setRows(data.rows || []);
      setLoaded(true);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setRows([]);
    setLoaded(false);
    setLoadedAt(null);
    setError(null);
  }, []);

  return createElement(
    SheetHistoryContext.Provider,
    { value: { rows, loading, error, loaded, loadedAt, load, reset } },
    children
  );
}

export function useSheetHistory() {
  const context = useContext(SheetHistoryContext);
  if (!context) {
    throw new Error('useSheetHistory must be used within a SheetHistoryProvider');
  }
  return context;
}
