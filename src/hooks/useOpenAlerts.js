import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { getPlatform } from '../platforms';
import { aggregate } from '../platforms/shared/aggregate.js';

export function useOpenAlerts(platformId) {
  const { profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [history, setHistory] = useState([]);
  const [overrideEmail, setOverrideEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState(null);

  const platform = useMemo(() => getPlatform(platformId), [platformId]);

  // Fallback do email do operador logado
  const operatorEmail = useMemo(() => {
    return overrideEmail || profile?.email || 'hevilyntfzero@gmail.com';
  }, [overrideEmail, profile]);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      // 1. Carregar omnilink_config se plataforma for omnilink
      if (platformId === 'omnilink') {
        const { data: configData } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'omnilink_config')
          .maybeSingle();
        if (configData?.value?.operator_email) {
          setOverrideEmail(configData.value.operator_email);
        }
      }

      // 2. Carregar driver_events das últimas 24 horas
      const startISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: evData, error: evErr } = await supabase
        .from('driver_events')
        .select('*')
        .eq('platform_id', platformId)
        .gte('ocorrido_em', startISO);

      if (evErr) throw evErr;

      // 3. Carregar atendimentos recentes (últimos 3 dias)
      const histStartISO = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data: histData, error: histErr } = await supabase
        .from('atendimentos')
        .select('*')
        .gte('created_at', histStartISO)
        .order('created_at', { ascending: false });

      if (histErr) throw histErr;

      setEvents(evData || []);
      setHistory(histData || []);
      setLoadedAt(new Date().toISOString());
    } catch (err) {
      console.warn('[useOpenAlerts] Erro ao carregar alertas/atendimentos:', err.message);
    } finally {
      setLoading(false);
    }
  }, [platformId]);

  useEffect(() => {
    load();
  }, [load]);

  // Escutar Realtime para driver_events e atendimentos
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channelName = `open-alerts-live-${platformId}-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_events', filter: `platform_id=eq.${platformId}` }, ({ new: row }) => {
        setEvents(prev => {
          if (prev.some(e => e.id === row.id)) return prev;
          return [...prev, row];
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atendimentos' }, ({ new: row }) => {
        setHistory(prev => {
          if (prev.some(h => h.id === row.id)) return prev;
          return [row, ...prev];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'atendimentos' }, ({ new: row }) => {
        setHistory(prev => prev.map(h => h.id === row.id ? row : h));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'atendimentos' }, ({ old: row }) => {
        setHistory(prev => prev.filter(h => h.id !== row.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [platformId]);

  // Agregação dinâmica reativa
  const { drivers, stats } = useMemo(() => {
    return aggregate(events, history, platform, { operatorEmail });
  }, [events, history, platform, operatorEmail]);

  return {
    drivers,
    stats,
    loading,
    loadedAt,
    reload: load,
  };
}
