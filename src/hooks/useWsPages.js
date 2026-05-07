import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export function useWsPages() {
  const [wsPages, setWsPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  useEffect(() => {
    supabase.from('ws_pages').select('*').order('created_at').then(({ data }) => {
      if (data) setWsPages(data.map(toLocal));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async ({ title, icon, category, content }) => {
    const opt = { id: crypto.randomUUID(), title, icon: icon ?? 0, category: category || 'protocolos', favorite: false, content: content || '', _pending: true };
    setWsPages(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('ws_pages')
      .insert({ title, icon_index: icon ?? 0, category: category || 'protocolos', favorite: false, content: content || '' })
      .select().single();
    if (error) { setWsPages(prev => prev.filter(p => p.id !== opt.id)); return; }
    setWsPages(prev => prev.map(p => p.id === opt.id ? toLocal(data) : p));
  }, []);

  const update = useCallback((id, patch) => {
    setWsPages(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      const dbPatch = {};
      if (patch.title    !== undefined) dbPatch.title      = patch.title;
      if (patch.icon     !== undefined) dbPatch.icon_index = patch.icon;
      if (patch.category !== undefined) dbPatch.category   = patch.category;
      if (patch.favorite !== undefined) dbPatch.favorite   = patch.favorite;
      if (patch.content  !== undefined) dbPatch.content    = patch.content;
      if (Object.keys(dbPatch).length) {
        dbPatch.updated_at = new Date().toISOString();
        supabase.from('ws_pages').update(dbPatch).eq('id', id);
      }
    }, 800);
  }, []);

  const remove = useCallback(async (id) => {
    setWsPages(prev => prev.filter(p => p.id !== id));
    await supabase.from('ws_pages').delete().eq('id', id);
  }, []);

  return { wsPages, loading, add, update, remove };
}

function toLocal(row) {
  return {
    id: row.id, title: row.title, icon: row.icon_index,
    category: row.category, favorite: row.favorite, content: row.content || '',
  };
}
