import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const timers = useRef({});

  useEffect(() => {
    supabase.from('templates').select('*').order('created_at').then(({ data }) => {
      if (data) setTemplates(data.map(toLocal));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async ({ tag, tagLabel, title, text }) => {
    const opt = { id: crypto.randomUUID(), tag, tagLabel, title, text, _pending: true };
    setTemplates(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('templates')
      .insert({ tag, tag_label: tagLabel, title, body: text })
      .select().single();
    if (error) { setTemplates(prev => prev.filter(t => t.id !== opt.id)); return; }
    setTemplates(prev => prev.map(t => t.id === opt.id ? toLocal(data) : t));
  }, []);

  const update = useCallback((id, patch) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      const dbPatch = {};
      if (patch.tag      !== undefined) dbPatch.tag       = patch.tag;
      if (patch.tagLabel !== undefined) dbPatch.tag_label = patch.tagLabel;
      if (patch.title    !== undefined) dbPatch.title     = patch.title;
      if (patch.text     !== undefined) dbPatch.body      = patch.text;
      supabase.from('templates').update(dbPatch).eq('id', id);
    }, 600);
  }, []);

  const remove = useCallback(async (id) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    await supabase.from('templates').delete().eq('id', id);
  }, []);

  return { templates, loading, add, update, remove };
}

function toLocal(row) {
  return { id: row.id, tag: row.tag, tagLabel: row.tag_label, title: row.title, text: row.body };
}
