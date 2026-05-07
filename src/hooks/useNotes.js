import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth/AuthContext';

export function useNotes() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('notes').select('*').order('updated_at', { ascending: false });
    if (data) setNotes(data.map(toLocal));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = useCallback(async ({ title, body, isPersonal = false }) => {
    const opt = { id: crypto.randomUUID(), title: title || 'Nova nota', body: body || '', date: 'Agora', isPersonal, authorId: profile?.id, _pending: true };
    setNotes(prev => [opt, ...prev]);
    const { data, error } = await supabase
      .from('notes')
      .insert({ title: title || 'Nova nota', body: body || '', is_personal: isPersonal, author_id: profile?.id })
      .select().single();
    if (error) { setNotes(prev => prev.filter(n => n.id !== opt.id)); return null; }
    const local = toLocal(data);
    setNotes(prev => prev.map(n => n.id === opt.id ? local : n));
    return local;
  }, [profile]);

  const update = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, date: 'Agora' } : n));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      const dbPatch = { updated_at: new Date().toISOString() };
      if (patch.title      !== undefined) dbPatch.title       = patch.title;
      if (patch.body       !== undefined) dbPatch.body        = patch.body;
      if (patch.isPersonal !== undefined) dbPatch.is_personal = patch.isPersonal;
      supabase.from('notes').update(dbPatch).eq('id', id);
    }, 800);
  }, []);

  const remove = useCallback(async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  }, []);

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
