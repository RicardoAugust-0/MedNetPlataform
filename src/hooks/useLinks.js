import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';
import { useToast } from './useToast';

const PALETTE = [
  { bg:'#E6F1FB', ic:'#0C447C' }, { bg:'#EAF3DE', ic:'#27500A' },
  { bg:'#FAECE7', ic:'#7D2E10' }, { bg:'#EEEDFE', ic:'#3C3489' },
];

export function useLinks() {
  const toast = useToast();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('links').select('*').order('created_at');
    if (error) toast('Erro ao carregar links', 'error');
    else if (data) setLinks(data.map(toLocal));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('links-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'links' }, ({ new: row }) => {
        setLinks(prev => prev.some(l => l.id === row.id) ? prev : [...prev, toLocal(row)]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'links' }, ({ old: row }) => {
        setLinks(prev => prev.filter(l => l.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const add = useCallback(async ({ name, desc, url, section }) => {
    const p = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const opt = { id: crypto.randomUUID(), section, name, desc: desc || 'Link rápido', url, icon: 'ti-link', bg: p.bg, ic: p.ic, _pending: true };
    setLinks(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('links')
      .insert({ section, name, description: desc || 'Link rápido', url, icon: 'ti-link', bg: p.bg, ic: p.ic })
      .select().single();
    if (error) {
      setLinks(prev => prev.filter(l => l.id !== opt.id));
      toast('Erro ao criar link', 'error');
      return;
    }
    setLinks(prev => prev.map(l => l.id === opt.id ? toLocal(data) : l));
  }, []);

  const remove = useCallback(async (id) => {
    setLinks(prev => prev.filter(l => l.id !== id));
    const { error } = await supabase.from('links').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir link', 'error'); }
  }, [load]);

  return { links, loading, add, remove };
}

function toLocal(row) {
  return {
    id: row.id, section: row.section, name: row.name,
    desc: row.description, url: row.url,
    icon: row.icon || 'ti-link', bg: row.bg, ic: row.ic,
  };
}
