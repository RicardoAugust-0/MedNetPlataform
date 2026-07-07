import { useState, useEffect, useCallback, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './useToast.jsx';

const PAGE_SIZE = 1000;
const ATENDIMENTO_COLUMNS = 'id, motorista, placa, transportadora, operador_nome, tipo, bucket, obs, hora, created_at';

const AtendimentosContext = createContext(null);

export function AtendimentosProvider({ children }) {
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
      .select(ATENDIMENTO_COLUMNS)
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
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'atendimentos' }, ({ old: row }) => {
        setHistory(prev => prev.filter(h => h.id !== row.id));
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const registrar = useCallback(async ({ motorista, placa, transportadora, tipo, bucket, obs, platformId }) => {
    if (!profile) return;
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const optimistic = { id: crypto.randomUUID(), motorista, placa, transportadora, tipo, bucket, obs, hora, operador: profile.nome, created_at: new Date().toISOString(), _pending: true };
    setHistory(prev => [optimistic, ...prev]);

    const { data, error } = await supabase
      .from('atendimentos')
      .insert({ motorista, placa: placa || null, transportadora: transportadora || null, operador_id: profile.id, operador_nome: profile.nome, tipo, bucket: bucket || null, obs, hora })
      .select(ATENDIMENTO_COLUMNS).single();

    if (error) {
      setHistory(prev => prev.filter(h => h.id !== optimistic.id));
      setError(error.message);
      toast('Erro ao registrar atendimento', 'error');
      return { error };
    }
    setHistory(prev => prev.map(h => h.id === optimistic.id ? toLocal(data) : h));

    // Horizon é espelho da MaxTrack (mesma frota/eventos): propaga o
    // tratamento para lá também, sem exigir repetição manual do operador.
    // Best-effort — a VPS pode estar fora do ar sem impedir o atendimento.
    if (platformId === 'maxtrack' && tipo !== 'limpeza') {
      supabase.from('automations').select('endpoint, token').eq('name', 'Bot_HorizonTreatment').maybeSingle()
        .then(({ data: auto }) => {
          if (!auto?.endpoint) return;
          fetch(auto.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(auto.token ? { Authorization: `Bearer ${auto.token}` } : {}) },
            body: JSON.stringify({ motorista, placa, transportadora, tipo, timestamp: new Date().toISOString() }),
            signal: AbortSignal.timeout(10000),
          }).catch(() => {});
        })
        .catch(() => {});
    }

    return { data };
  }, [profile]);

  const loadByRange = useCallback(async (start, end) => {
    if (!isSupabaseConfigured) return { data: [], error: null };
    // Parse dates as local time so range matches what the operator sees on their clock
    const startUTC = new Date(start + 'T00:00:00').toISOString();
    const endUTC   = new Date(end   + 'T23:59:59.999').toISOString();
    const { data, error } = await supabase
      .from('atendimentos')
      .select(ATENDIMENTO_COLUMNS)
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
      .select(ATENDIMENTO_COLUMNS)
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

  // Carrega todos os atendimentos do filtro paginando (Supabase limita a 1000/req).
  // Filtros: { from?, to?, tipos? }. Retorna { data, error }.
  const loadAllByFilter = useCallback(async ({ from, to, tipos } = {}) => {
    if (!isSupabaseConfigured) return { data: [], error: null };
    const pageSize = 1000;
    const all = [];
    let cursor = 0;
    while (true) {
      let q = supabase.from('atendimentos').select(ATENDIMENTO_COLUMNS).order('created_at', { ascending: false }).range(cursor, cursor + pageSize - 1);
      if (from) q = q.gte('created_at', new Date(from + 'T00:00:00').toISOString());
      if (to)   q = q.lte('created_at', new Date(to   + 'T23:59:59.999').toISOString());
      if (tipos && tipos.length > 0) q = q.in('tipo', tipos);
      const { data, error } = await q;
      if (error) return { data: all.map(toLocal), error: error.message };
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      cursor += pageSize;
    }
    return { data: all.map(toLocal), error: null };
  }, []);

  // Apaga atendimentos conforme filtros (uso admin).
  // Filtros: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', tipos?: string[] }
  // Retorna { count, error }. RLS exige role admin no Supabase.
  const deleteByFilter = useCallback(async ({ from, to, tipos } = {}) => {
    if (!isSupabaseConfigured) return { count: 0, error: 'Supabase não configurado' };
    let query = supabase.from('atendimentos').delete({ count: 'exact' });
    if (from) query = query.gte('created_at', new Date(from + 'T00:00:00').toISOString());
    if (to)   query = query.lte('created_at', new Date(to   + 'T23:59:59.999').toISOString());
    if (tipos && tipos.length > 0) query = query.in('tipo', tipos);
    else query = query.not('id', 'is', null); // garante WHERE p/ evitar delete vazio acidental
    const { error, count } = await query;
    if (error) return { count: 0, error: error.message };
    // Atualização otimista local (realtime confirma p/ outros operadores)
    setHistory(prev => prev.filter(h => {
      if (from && new Date(h.created_at) < new Date(from + 'T00:00:00')) return true;
      if (to   && new Date(h.created_at) > new Date(to   + 'T23:59:59.999')) return true;
      if (tipos && tipos.length > 0 && !tipos.includes(h.tipo)) return true;
      return false;
    }));
    return { count: count || 0, error: null };
  }, []);

  return createElement(
    AtendimentosContext.Provider,
    { value: { history, loading, error, historyLoadedAt, registrar, reload: load, loadByRange, loadDriverHistory, loadAtendimentosForFilter, loadAllByFilter, deleteByFilter } },
    children
  );
}

export function useAtendimentos() {
  const context = useContext(AtendimentosContext);
  if (!context) {
    throw new Error('useAtendimentos must be used within an AtendimentosProvider');
  }
  return context;
}

function toLocal(row) {
  return {
    id:             row.id,
    motorista:      row.motorista,
    placa:          row.placa,
    transportadora: row.transportadora,
    operador:       row.operador_nome,
    tipo:           row.tipo,
    bucket:         row.bucket,
    obs:            row.obs,
    hora:           row.hora,
    created_at:     row.created_at,
    _pending:       false,
  };
}
