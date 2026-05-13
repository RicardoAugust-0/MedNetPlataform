import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './useToast.jsx';

const PAGE_SIZE = 300;

export function useAtendimentos() {
  const { profile } = useAuth();
  const toast = useToast();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [historyLoadedAt, setHistoryLoadedAt] = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) { setError(error.message); toast('Erro ao carregar histórico', 'error'); }
    else { setHistory(data.map(toLocal)); setHistoryLoadedAt(new Date().toISOString()); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime — atendimentos de outros operadores aparecem automaticamente
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    
    // Gerando um nome de canal único para evitar conflitos de inscrição múltipla
    // quando o hook é usado em múltiplos componentes simultaneamente.
    const channelName = `atendimentos-live-${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'atendimentos' }, ({ new: row }) => {
        setHistory(prev => {
          if (prev.some(h => h.id === row.id)) return prev; // já existe via optimistic
          return [toLocal(row), ...prev];
        });
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const registrar = useCallback(async ({ motorista, placa, transportadora, tipo, obs }) => {
    if (!profile) return;
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const optimistic = { id: crypto.randomUUID(), motorista, placa, transportadora, tipo, obs, hora, operador: profile.nome, created_at: new Date().toISOString(), _pending: true };
    setHistory(prev => [optimistic, ...prev]);

    const { data, error } = await supabase
      .from('atendimentos')
      .insert({ motorista, placa: placa || null, transportadora: transportadora || null, operador_id: profile.id, operador_nome: profile.nome, tipo, obs, hora })
      .select().single();

    if (error) {
      setHistory(prev => prev.filter(h => h.id !== optimistic.id));
      setError(error.message);
      toast('Erro ao registrar atendimento', 'error');
      return { error };
    }
    setHistory(prev => prev.map(h => h.id === optimistic.id ? toLocal(data) : h));
    return { data };
  }, [profile]);

  const loadByRange = useCallback(async (start, end) => {
    if (!isSupabaseConfigured) return { data: [], error: null };
    // Parse dates as local time so range matches what the operator sees on their clock
    const startUTC = new Date(start + 'T00:00:00').toISOString();
    const endUTC   = new Date(end   + 'T23:59:59.999').toISOString();
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*')
      .gte('created_at', startUTC)
      .lte('created_at', endUTC)
      .order('created_at', { ascending: false });
    if (error) return { data: [], error: error.message };
    return { data: data.map(toLocal), error: null };
  }, []);

  const loadDriverHistory = useCallback(async (motorista) => {
    if (!isSupabaseConfigured) return { data: [], error: null };
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*')
      .eq('motorista', motorista)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return { data: [], error: error.message };
    return { data: data.map(toLocal), error: null };
  }, []);

  // Carrega atendimentos recentes (placa, tipo, created_at) para deduplicar a planilha.
  // Pagina para superar o limite default do Supabase (1000 linhas/requisição).
  const loadAtendimentosForFilter = useCallback(async (daysAgo = 90) => {
    if (!isSupabaseConfigured) return [];
    const since = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const pageSize = 1000;
    const all = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('atendimentos')
        .select('placa, tipo, created_at')
        .gte('created_at', since)
        .in('tipo', ['intervencao', 'descarte', 'reportar'])
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('[useAtendimentos] erro carregando histórico para filtro:', error.message);
        break;
      }
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }, []);

  return { history, loading, error, historyLoadedAt, registrar, reload: load, loadByRange, loadDriverHistory, loadAtendimentosForFilter };
}

function toLocal(row) {
  return {
    id:             row.id,
    motorista:      row.motorista,
    placa:          row.placa,
    transportadora: row.transportadora,
    operador:       row.operador_nome,
    tipo:           row.tipo,
    obs:            row.obs,
    hora:           row.hora,
    created_at:     row.created_at,
    _pending:       false,
  };
}
