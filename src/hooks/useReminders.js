import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export function useReminders() {
  const toast = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('reminders').select('*').order('reminder_date').order('time');
    if (error) toast('Erro ao carregar lembretes', 'error');
    else if (data) setReminders(data.map(toLocal));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('reminders-live-' + crypto.randomUUID())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reminders' }, ({ new: row }) => {
        setReminders(prev => prev.some(r => r.id === row.id) ? prev : [...prev, toLocal(row)]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reminders' }, ({ new: row }) => {
        setReminders(prev => prev.map(r => r.id === row.id ? toLocal(row) : r));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reminders' }, ({ old: row }) => {
        setReminders(prev => prev.filter(r => r.id !== row.id));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const add = useCallback(async ({ title, sub, time, urgent, date }) => {
    const opt = { id: crypto.randomUUID(), title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, date: date || today(), _pending: true };
    setReminders(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('reminders')
      .insert({ title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, reminder_date: date || today() })
      .select().single();
    if (error) {
      setReminders(prev => prev.filter(r => r.id !== opt.id));
      toast('Erro ao criar lembrete', 'error');
      return;
    }
    setReminders(prev => prev.map(r => r.id === opt.id ? toLocal(data) : r));
  }, []);

  const toggle = useCallback(async (id) => {
    let newDone;
    setReminders(prev => prev.map(r => {
      if (r.id !== id) return r;
      newDone = !r.done;
      return { ...r, done: newDone };
    }));
    const { error } = await supabase.from('reminders').update({ done: newDone }).eq('id', id);
    if (error) { load(); toast('Erro ao atualizar lembrete', 'error'); }
  }, [load]);

  const remove = useCallback(async (id) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir lembrete', 'error'); }
  }, [load]);

  return { reminders, loading, add, toggle, remove };
}

function toLocal(row) {
  return { id: row.id, title: row.title, sub: row.sub, time: row.time, urgent: row.urgent, done: row.done, date: row.reminder_date || today() };
}
