import { useState, useEffect, useCallback, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from './useToast.jsx';
import { createDebouncedPatchQueue } from './debouncedPatchQueue.js';

const NotesContext = createContext(null);
const NOTE_COLUMNS = 'id, title, body, is_personal, author_id, updated_at';

export function NotesProvider({ children, enabled = true }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [patchQueue] = useState(() => createDebouncedPatchQueue({
    delay: 800,
    persist: async (id, patch) => {
      const dbPatch = { updated_at: new Date().toISOString() };
      if (patch.title      !== undefined) dbPatch.title       = patch.title;
      if (patch.body       !== undefined) dbPatch.body        = patch.body;
      if (patch.isPersonal !== undefined) dbPatch.is_personal = patch.isPersonal;
      const { error } = await supabase.from('notes').update(dbPatch).eq('id', id);
      if (error) throw error;
    },
    onError: () => toast('Erro ao salvar nota', 'error'),
  }));

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('notes').select(NOTE_COLUMNS).order('updated_at', { ascending: false });
    if (error) { toast('Erro ao carregar notas', 'error'); }
    else if (data) setNotes(data.map(toLocal));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (!enabled) return;
    const timeoutId = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [enabled, load]);

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;
    const channel = supabase
      .channel('notes-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notes' }, ({ new: row }) => {
        setNotes(prev => prev.some(n => n.id === row.id) ? prev : [toLocal(row), ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notes' }, ({ new: row }) => {
        setNotes(prev => prev.map(n => n.id === row.id ? patchQueue.overlay(row.id, toLocal(row)) : n));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notes' }, ({ old: row }) => {
        setNotes(prev => prev.filter(n => n.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled, patchQueue]);

  useEffect(() => () => { void patchQueue.flushAll(); }, [patchQueue]);

  const add = useCallback(async ({ title, body, isPersonal = false }) => {
    const opt = { id: crypto.randomUUID(), title: title || 'Nova nota', body: body || '', date: 'Agora', isPersonal, authorId: profile?.id, _pending: true };
    setNotes(prev => [opt, ...prev]);
    const { data, error } = await supabase
      .from('notes')
      .insert({ title: title || 'Nova nota', body: body || '', is_personal: isPersonal, author_id: profile?.id })
      .select(NOTE_COLUMNS).single();
    if (error) {
      setNotes(prev => prev.filter(n => n.id !== opt.id));
      toast('Erro ao criar nota', 'error');
      return null;
    }
    const local = toLocal(data);
    setNotes(prev => prev.map(n => n.id === opt.id ? local : n));
    return local;
  }, [profile, toast]);

  const update = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, date: 'Agora' } : n));
    patchQueue.enqueue(id, patch);
  }, [patchQueue]);

  const remove = useCallback(async (id) => {
    patchQueue.discard(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase.from('notes').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir nota', 'error'); }
  }, [load, patchQueue, toast]);

  return createElement(
    NotesContext.Provider,
    { value: { notes, loading: enabled && loading, add, update, remove } },
    children
  );
}

export function useNotes() {
  const context = useContext(NotesContext);
  if (!context) {
    throw new Error('useNotes must be used within a NotesProvider');
  }
  return context;
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
