import { useState, useEffect, useCallback, createContext, useContext, createElement } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

export const PALETTE = [
  { bg:'#E6F1FB', ic:'#0C447C' }, { bg:'#EAF3DE', ic:'#27500A' },
  { bg:'#FAECE7', ic:'#7D2E10' }, { bg:'#EEEDFE', ic:'#3C3489' },
  { bg:'#FFF9DB', ic:'#856404' }, { bg:'#F8F9FA', ic:'#343a40' },
];

export const AVAILABLE_ICONS = [
  'ti-link', 'ti-activity', 'ti-users', 'ti-chart-bar', 'ti-calendar',
  'ti-brand-whatsapp', 'ti-mail', 'ti-map-pin', 'ti-file-text', 'ti-settings',
  'ti-device-laptop', 'ti-database', 'ti-layout-dashboard', 'ti-message-circle'
];

const LinksContext = createContext(null);
const LINK_COLUMNS = 'id, section, name, description, url, icon, bg, ic, position';

export function LinksProvider({ children, enabled = true }) {
  const toast = useToast();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('links').select(LINK_COLUMNS).order('position', { ascending: true });
    if (error) toast('Erro ao carregar links', 'error');
    else if (data) setLinks(data.map(toLocal));
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
      .channel('links-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, () => {
        load();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [enabled, load]);

  const add = useCallback(async ({ name, desc, url, section, icon, bg, ic }) => {
    const p = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const pos = links.length > 0 ? Math.max(...links.map(l => l.position || 0)) + 1 : 0;
    
    const newLink = {
      section, name, description: desc || 'Link rápido', url,
      icon: icon || 'ti-link', bg: bg || p.bg, ic: ic || p.ic,
      position: pos
    };

    const { data, error } = await supabase.from('links').insert(newLink).select(LINK_COLUMNS).single();
    if (error) {
      toast('Erro ao criar link', 'error');
      return;
    }
    setLinks(prev => [...prev, toLocal(data)]);
  }, [links, toast]);

  const update = useCallback(async (id, updates) => {
    const { data, error } = await supabase
      .from('links')
      .update({
        name: updates.name,
        description: updates.desc,
        url: updates.url,
        section: updates.section,
        icon: updates.icon,
        bg: updates.bg,
        ic: updates.ic,
        position: updates.position
      })
      .eq('id', id)
      .select(LINK_COLUMNS).single();

    if (error) {
      toast('Erro ao atualizar link', 'error');
      return;
    }
    setLinks(prev => prev.map(l => l.id === id ? toLocal(data) : l));
  }, [toast]);

  const reorder = useCallback(async (newLinks) => {
    setLinks(newLinks);
    const updates = newLinks.map((l, i) => ({ id: l.id, position: i }));
    
    // Perform individual updates for now as Supabase doesn't support bulk updates with different values easily in a single call without a RPC
    // But we can do it in parallel
    const promises = updates.map(u => supabase.from('links').update({ position: u.position }).eq('id', u.id));
    const results = await Promise.all(promises);
    
    if (results.some(r => r.error)) {
      toast('Erro ao reordenar links', 'error');
      load();
    }
  }, [load, toast]);

  const remove = useCallback(async (id) => {
    setLinks(prev => prev.filter(l => l.id !== id));
    const { error } = await supabase.from('links').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir link', 'error'); }
  }, [load, toast]);

  return createElement(
    LinksContext.Provider,
    { value: { links, loading: enabled && loading, add, update, remove, reorder } },
    children
  );
}

export function useLinks() {
  const context = useContext(LinksContext);
  if (!context) {
    throw new Error('useLinks must be used within a LinksProvider');
  }
  return context;
}

function toLocal(row) {
  return {
    id: row.id, section: row.section, name: row.name,
    desc: row.description, url: row.url,
    icon: row.icon || 'ti-link', bg: row.bg, ic: row.ic,
    position: row.position || 0
  };
}
