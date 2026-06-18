import { useEffect, useState, useCallback, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';

const KEY = 'carrier_aliases';

const CarrierAliasesContext = createContext(null);

export function CarrierAliasesProvider({ children }) {
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
    const nameLower = name.toLowerCase();

    for (const key of Object.keys(aliases)) {
      const val = aliases[key];
      if (!val) continue;

      // Split by comma to support multiple raw names mapped to one clean name
      const parts = val.split(',').map(p => p.trim());
      for (const part of parts) {
        if (!part) continue;
        const partLower = part.toLowerCase();

        // Exact match or partial containment match
        if (nameLower === partLower || nameLower.includes(partLower)) {
          return key;
        }
      }
    }

    return name;
  }, [aliases]);

  return createElement(
    CarrierAliasesContext.Provider,
    { value: { aliases, loading, setAliases, resolveAlias, resolveMonitorName } },
    children
  );
}

export function useCarrierAliases() {
  const context = useContext(CarrierAliasesContext);
  if (!context) {
    throw new Error('useCarrierAliases must be used within a CarrierAliasesProvider');
  }
  return context;
}
