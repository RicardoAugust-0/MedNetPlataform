import { useEffect, useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';

const DEFAULT = { enabled: false, message: '' };

export function useMaintenance() {
  const [state, setState] = useState(DEFAULT);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'maintenance')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.value) setState({ ...DEFAULT, ...data.value });
        setLoading(false);
      });

    const channel = supabase
      .channel('app_settings_maintenance')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.maintenance' },
        (payload) => {
          const value = payload.new?.value;
          if (value) setState({ ...DEFAULT, ...value });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const setMaintenance = useCallback(async (next) => {
    const value = { ...DEFAULT, ...state, ...next };
    setState(value);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('app_settings')
      .update({ value, updated_at: new Date().toISOString(), updated_by: user?.id })
      .eq('key', 'maintenance');
  }, [state]);

  return { maintenance: state, loading, setMaintenance };
}
