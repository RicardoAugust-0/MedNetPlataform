import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

export function useTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('templates').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) toast('Erro ao carregar templates', 'error');
    else if (data) setTemplates(data.map(toLocal));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('templates-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'templates' }, ({ new: row }) => {
        setTemplates(prev => prev.some(t => t.id === row.id) ? prev : [...prev, toLocal(row)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'templates' }, ({ new: row }) => {
        setTemplates(prev => prev.map(t => t.id === row.id ? toLocal(row) : t));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'templates' }, ({ old: row }) => {
        setTemplates(prev => prev.filter(t => t.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const add = useCallback(async ({ tag, tagLabel, title, text }) => {
    const pos = templates.length > 0 ? Math.max(...templates.map(t => t.position ?? 0)) + 1 : 0;
    const opt = { id: crypto.randomUUID(), tag, tagLabel, title, text, position: pos, _pending: true };
    setTemplates(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('templates')
      .insert({ tag, tag_label: tagLabel, title, body: text, position: pos })
      .select().single();
    if (error) {
      setTemplates(prev => prev.filter(t => t.id !== opt.id));
      toast('Erro ao criar template', 'error');
      return;
    }
    setTemplates(prev => prev.map(t => t.id === opt.id ? toLocal(data) : t));
  }, []);

  const update = useCallback((id, patch) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const dbPatch = {};
      if (patch.tag      !== undefined) dbPatch.tag       = patch.tag;
      if (patch.tagLabel !== undefined) dbPatch.tag_label = patch.tagLabel;
      if (patch.title    !== undefined) dbPatch.title     = patch.title;
      if (patch.text     !== undefined) dbPatch.body      = patch.text;
      const { error } = await supabase.from('templates').update(dbPatch).eq('id', id);
      if (error) toast('Erro ao salvar template', 'error');
    }, 600);
  }, []);

  const reorder = useCallback(async (newTemplates) => {
    setTemplates(newTemplates);
    const promises = newTemplates.map((t, i) =>
      supabase.from('templates').update({ position: i }).eq('id', t.id)
    );
    const results = await Promise.all(promises);
    if (results.some(r => r.error)) {
      toast('Erro ao reordenar templates', 'error');
      load();
    }
  }, [load, toast]);

  const remove = useCallback(async (id) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir template', 'error'); }
  }, [load]);

  return { templates, loading, add, update, remove, reorder };
}

function toLocal(row) {
  return { id: row.id, tag: row.tag, tagLabel: row.tag_label, title: row.title, text: row.body, position: row.position ?? 0 };
}
