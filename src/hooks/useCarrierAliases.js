import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';

const KEY = 'carrier_aliases';

export function useCarrierAliases() {
  const [aliases, setAliasesState] = useState({});
  const [loading, setLoading]       = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    supabase
      .from('app_settings')
      .select('value')
      .eq('key', KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.value) setAliasesState(data.value);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const setAliases = useCallback(async (next) => {
    setAliasesState(next);
    await supabase
      .from('app_settings')
      .upsert(
        { key: KEY, value: next, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
  }, []);

  // Resolve o nome da transportadora para o nome usado na planilha de intervenções.
  const resolveAlias = useCallback((name) => aliases[name] || name, [aliases]);

  return { aliases, loading, setAliases, resolveAlias };
}
