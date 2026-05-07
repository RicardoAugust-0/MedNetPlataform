import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export function useNotes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  useEffect(() => {
    supabase.from('notes').select('*').order('updated_at', { ascending: false }).then(({ data }) => {
      if (data) setNotes(data.map(toLocal));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async ({ title, body }) => {
    const opt = { id: crypto.randomUUID(), title: title || 'Nova nota', body: body || '', date: 'Agora', _pending: true };
    setNotes(prev => [opt, ...prev]);
    const { data, error } = await supabase
      .from('notes').insert({ title: title || 'Nova nota', body: body || '' }).select().single();
    if (error) { setNotes(prev => prev.filter(n => n.id !== opt.id)); return null; }
    setNotes(prev => prev.map(n => n.id === opt.id ? toLocal(data) : n));
    return toLocal(data);
  }, []);

  const update = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, date: 'Agora' } : n));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      const dbPatch = { updated_at: new Date().toISOString() };
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.body  !== undefined) dbPatch.body  = patch.body;
      supabase.from('notes').update(dbPatch).eq('id', id);
    }, 800);
  }, []);

  const remove = useCallback(async (id) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    await supabase.from('notes').delete().eq('id', id);
  }, []);

  return { notes, loading, add, update, remove };
}

function fmtNoteDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return `Hoje · ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays === 1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function toLocal(row) {
  return { id: row.id, title: row.title, body: row.body || '', date: fmtNoteDate(row.updated_at) };
}
