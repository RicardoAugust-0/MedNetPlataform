import { useState, useEffect, useCallback, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';
import { createDebouncedPatchQueue } from './debouncedPatchQueue.js';

const TemplatesContext = createContext(null);
const TEMPLATE_COLUMNS = 'id, tag, tag_label, title, body, position, created_at';

export function TemplatesProvider({ children }) {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [patchQueue] = useState(() => createDebouncedPatchQueue({
    delay: 600,
    persist: async (id, patch) => {
      const dbPatch = {};
      if (patch.tag      !== undefined) dbPatch.tag       = patch.tag;
      if (patch.tagLabel !== undefined) dbPatch.tag_label = patch.tagLabel;
      if (patch.title    !== undefined) dbPatch.title     = patch.title;
      if (patch.text     !== undefined) dbPatch.body      = patch.text;
      const { error } = await supabase.from('templates').update(dbPatch).eq('id', id);
      if (error) throw error;
    },
    onError: () => toast('Erro ao salvar template', 'error'),
  }));

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('templates').select(TEMPLATE_COLUMNS).order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) toast('Erro ao carregar templates', 'error');
    else if (data) setTemplates(data.map(toLocal));
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('templates-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'templates' }, ({ new: row }) => {
        setTemplates(prev => prev.some(t => t.id === row.id) ? prev : [...prev, toLocal(row)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'templates' }, ({ new: row }) => {
        setTemplates(prev => prev.map(t => t.id === row.id ? patchQueue.overlay(row.id, toLocal(row)) : t));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'templates' }, ({ old: row }) => {
        setTemplates(prev => prev.filter(t => t.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [patchQueue]);

  useEffect(() => () => { void patchQueue.flushAll(); }, [patchQueue]);

  const add = useCallback(async ({ tag, tagLabel, title, text }) => {
    const pos = templates.length > 0 ? Math.max(...templates.map(t => t.position ?? 0)) + 1 : 0;
    const opt = { id: crypto.randomUUID(), tag, tagLabel, title, text, position: pos, _pending: true };
    setTemplates(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('templates')
      .insert({ tag, tag_label: tagLabel, title, body: text, position: pos })
      .select(TEMPLATE_COLUMNS).single();
    if (error) {
      setTemplates(prev => prev.filter(t => t.id !== opt.id));
      toast('Erro ao criar template', 'error');
      return;
    }
    setTemplates(prev => prev.map(t => t.id === opt.id ? toLocal(data) : t));
  }, [templates, toast]);

  const update = useCallback((id, patch) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    patchQueue.enqueue(id, patch);
  }, [patchQueue]);

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
    patchQueue.discard(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    const { error } = await supabase.from('templates').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir template', 'error'); }
  }, [load, patchQueue, toast]);

  return createElement(
    TemplatesContext.Provider,
    { value: { templates, loading, add, update, remove, reorder } },
    children
  );
}

export function useTemplates() {
  const context = useContext(TemplatesContext);
  if (!context) {
    throw new Error('useTemplates must be used within a TemplatesProvider');
  }
  return context;
}

function toLocal(row) {
  return { id: row.id, tag: row.tag, tagLabel: row.tag_label, title: row.title, text: row.body, position: row.position ?? 0 };
}
