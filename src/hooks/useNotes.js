import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';
import { useAuth } from '../auth/AuthContext';
import { useToast } from './useToast';

export function useNotes() {
  const { profile } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    if (error) { toast('Erro ao carregar notas', 'error'); }
    else if (data) setNotes(data.map(toLocal));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('notes-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, ({ new: row }) => {
        setNotes(prev => prev.some(n => n.id === row.id) ? prev : [toLocal(row), ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, ({ new: row }) => {
        setNotes(prev => prev.map(n => n.id === row.id ? toLocal(row) : n));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, ({ old: row }) => {
        setNotes(prev => prev.filter(n => n.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const add = useCallback(async ({ title, body, isPersonal = false }) => {
    const opt = { id: crypto.randomUUID(), title: title || 'Nova nota', body: body || '', date: 'Agora', isPersonal, authorId: profile?.id, _pending: true };
    setNotes(prev => [opt, ...prev]);
    const { data, error } = await supabase
      .from('notes')
      .insert({ title: title || 'Nova nota', body: body || '', is_personal: isPersonal, author_id: profile?.id })
      .select().single();
    if (error) {
      setNotes(prev => prev.filter(n => n.id !== opt.id));
      toast('Erro ao criar nota', 'error');
      return null;
    }
    const local = toLocal(data);
    setNotes(prev => prev.map(n => n.id === opt.id ? local : n));
    return local;
  }, [profile]);

  const update = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, date: 'Agora' } : n));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const dbPatch = { updated_at: new Date().toISOString() };
      if (patch.title      !== undefined) dbPatch.title       = patch.title;
      if (patch.body       !== undefined) dbPatch.body        = patch.body;
      if (patch.isPersonal !== undefined) dbPatch.is_personal = patch.isPersonal;
      const { error } = await supabase.from('notes').update(dbPatch).eq('id', id);
      if (error) toast('Erro ao salvar nota', 'error');
    }, 800);
  }, []);

  const remove = useCallback(async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir nota', 'error'); }
  }, [load]);

  return { notes, loading, add, update, remove };
}

function fmtDate(iso) {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return `Hoje · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (diff === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function toLocal(row) {
  return { id: row.id, title: row.title, body: row.body || '', date: fmtDate(row.updated_at), isPersonal: row.is_personal, authorId: row.author_id };
}
