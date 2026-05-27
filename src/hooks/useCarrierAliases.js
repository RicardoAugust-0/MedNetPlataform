import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';

const KEY = 'carrier_aliases';

export function useCarrierAliases() {
  const [aliases, setAliasesState] = useState({});
  const [loading, setLoading]       = useState(isSupabaseConfigured);

  // Load inicial
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

  // Realtime — propaga mudança feita no Admin sem precisar de reload
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channelName = `carrier-aliases-live-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${KEY}` },
        ({ new: row, eventType }) => {
          if (eventType === 'DELETE') setAliasesState({});
          else if (row?.value) setAliasesState(row.value);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  // Resolve o nome da planilha/raw de volta para o nome do Monitor (clean).
  const resolveMonitorName = useCallback((name) => {
    if (!name) return '';
    const clean = Object.keys(aliases).find(key => aliases[key] === name);
    return clean || name;
  }, [aliases]);

  return { aliases, loading, setAliases, resolveAlias, resolveMonitorName };
}
