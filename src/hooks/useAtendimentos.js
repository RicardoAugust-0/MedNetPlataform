import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import { useToast } from './useToast';

const PAGE_SIZE = 300;

export function useAtendimentos() {
  const { profile } = useAuth();
  const toast = useToast();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) { setError(error.message); toast('Erro ao carregar histórico', 'error'); }
    else setHistory(data.map(toLocal));
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

  return { history, loading, error, registrar, reload: load };
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
