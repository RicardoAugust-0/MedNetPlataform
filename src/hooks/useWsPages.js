import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

export function useWsPages() {
  const toast = useToast();
  const [wsPages, setWsPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('ws_pages').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) toast('Erro ao carregar workspace', 'error');
    else if (data) setWsPages(data.map(toLocal));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('ws-pages-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ws_pages' }, ({ new: row }) => {
        setWsPages(prev => prev.some(p => p.id === row.id) ? prev : [...prev, toLocal(row)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ws_pages' }, ({ new: row }) => {
        setWsPages(prev => prev.map(p => p.id === row.id ? toLocal(row) : p));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'ws_pages' }, ({ old: row }) => {
        setWsPages(prev => prev.filter(p => p.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const add = useCallback(async ({ title, icon, category, content }) => {
    const pos = wsPages.length > 0 ? Math.max(...wsPages.map(p => p.position ?? 0)) + 1 : 0;
    const opt = { id: crypto.randomUUID(), title, icon: icon ?? 0, category: category || 'protocolos', favorite: false, content: content || '', position: pos, _pending: true };
    setWsPages(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('ws_pages')
      .insert({ title, icon_index: icon ?? 0, category: category || 'protocolos', favorite: false, content: content || '', position: pos })
      .select().single();
    if (error) {
      setWsPages(prev => prev.filter(p => p.id !== opt.id));
      toast('Erro ao criar página', 'error');
      return;
    }
    setWsPages(prev => prev.map(p => p.id === opt.id ? toLocal(data) : p));
  }, []);

  const update = useCallback((id, patch) => {
    setWsPages(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const dbPatch = {};
      if (patch.title    !== undefined) dbPatch.title      = patch.title;
      if (patch.icon     !== undefined) dbPatch.icon_index = patch.icon;
      if (patch.category !== undefined) dbPatch.category   = patch.category;
      if (patch.favorite !== undefined) dbPatch.favorite   = patch.favorite;
      if (patch.content  !== undefined) dbPatch.content    = patch.content;
      if (!Object.keys(dbPatch).length) return;
      dbPatch.updated_at = new Date().toISOString();
      const { error } = await supabase.from('ws_pages').update(dbPatch).eq('id', id);
      if (error) toast('Erro ao salvar página', 'error');
    }, 800);
  }, []);

  const reorder = useCallback(async (newPages) => {
    setWsPages(newPages);
    const promises = newPages.map((p, i) =>
      supabase.from('ws_pages').update({ position: i }).eq('id', p.id)
    );
    const results = await Promise.all(promises);
    if (results.some(r => r.error)) {
      toast('Erro ao reordenar páginas', 'error');
      load();
    }
  }, [load, toast]);

  const remove = useCallback(async (id) => {
    setWsPages(prev => prev.filter(p => p.id !== id));
    const { error } = await supabase.from('ws_pages').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir página', 'error'); }
  }, [load]);

  return { wsPages, loading, add, update, remove, reorder };
}

function toLocal(row) {
  return {
    id: row.id, title: row.title, icon: row.icon_index,
    category: row.category, favorite: row.favorite, content: row.content || '',
    position: row.position ?? 0,
  };
}
