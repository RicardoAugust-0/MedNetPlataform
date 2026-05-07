import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

const PALETTE = [
  { bg:'#E6F1FB', ic:'#0C447C' }, { bg:'#EAF3DE', ic:'#27500A' },
  { bg:'#FAECE7', ic:'#7D2E10' }, { bg:'#EEEDFE', ic:'#3C3489' },
];

export function useLinks() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('links').select('*').order('created_at').then(({ data }) => {
      if (data) setLinks(data.map(toLocal));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async ({ name, desc, url, section }) => {
    const p = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const opt = { id: crypto.randomUUID(), section, name, desc: desc || 'Link rápido', url, icon: 'ti-link', bg: p.bg, ic: p.ic, _pending: true };
    setLinks(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('links')
      .insert({ section, name, description: desc || 'Link rápido', url, icon: 'ti-link', bg: p.bg, ic: p.ic })
      .select().single();
    if (error) { setLinks(prev => prev.filter(l => l.id !== opt.id)); return; }
    setLinks(prev => prev.map(l => l.id === opt.id ? toLocal(data) : l));
  }, []);

  const remove = useCallback(async (id) => {
    setLinks(prev => prev.filter(l => l.id !== id));
    await supabase.from('links').delete().eq('id', id);
  }, []);

  return { links, loading, add, remove };
}

function toLocal(row) {
  return {
    id: row.id, section: row.section, name: row.name,
    desc: row.description, url: row.url,
    icon: row.icon || 'ti-link', bg: row.bg, ic: row.ic,
  };
}
