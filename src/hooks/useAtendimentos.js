import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';

const PAGE_SIZE = 100;

export function useAtendimentos() {
  const { profile } = useAuth();
  const [history, setHistory]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  // Carrega os últimos atendimentos ao montar
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('atendimentos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (error) { setError(error.message); }
    else { setHistory(data.map(toLocal)); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Insere um atendimento e atualiza o estado local imediatamente
  const registrar = useCallback(async ({ motorista, placa, transportadora, tipo, obs }) => {
    if (!profile) return;

    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Optimistic update — aparece na lista antes da resposta
    const optimistic = { id: crypto.randomUUID(), motorista, placa, transportadora, tipo, obs, hora, operador_nome: profile.nome, created_at: new Date().toISOString(), _pending: true };
    setHistory(prev => [optimistic, ...prev]);

    const { data, error } = await supabase
      .from('atendimentos')
      .insert({
        motorista,
        placa:           placa || null,
        transportadora:  transportadora || null,
        operador_id:     profile.id,
        operador_nome:   profile.nome,
        tipo,
        obs,
        hora,
      })
      .select()
      .single();

    if (error) {
      // Reverte o optimistic update em caso de erro
      setHistory(prev => prev.filter(h => h.id !== optimistic.id));
      setError(error.message);
      return { error };
    }

    // Substitui o registro temporário pelo definitivo
    setHistory(prev => prev.map(h => h.id === optimistic.id ? toLocal(data) : h));
    return { data };
  }, [profile]);

  return { history, loading, error, registrar, reload: load };
}

// Converte registro do Supabase para o formato de exibição
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
