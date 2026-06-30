import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase.js';
import { useToast } from './useToast.jsx';

const today = () => new Date().toISOString().slice(0, 10);

function toLocal(row) {
  return { id: row.id, title: row.title, sub: row.sub, time: row.time, urgent: row.urgent, done: row.done, date: row.reminder_date || today(), icon: row.icon || null };
}

const RemindersContext = createContext(null);

export function RemindersProvider({ children }) {
  const toast = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const remindersRef = useRef(reminders);
  useEffect(() => { remindersRef.current = reminders; }, [reminders]);

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

  const add = useCallback(async ({ title, sub, time, urgent, date, icon }) => {
    const opt = { id: crypto.randomUUID(), title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, date: date || today(), icon: icon || null, _pending: true };
    setReminders(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('reminders')
      .insert({ title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, reminder_date: date || today(), icon: icon || null })
      .select().single();
    if (error) {
      setReminders(prev => prev.filter(r => r.id !== opt.id));
      toast('Erro ao criar lembrete', 'error');
      return;
    }
    setReminders(prev => prev.map(r => r.id === opt.id ? toLocal(data) : r));
  }, []);

  const toggle = useCallback(async (id) => {
    const current = remindersRef.current.find(r => r.id === id);
    if (!current) return;
    const newDone = !current.done;
    setReminders(prev => prev.map(r => r.id === id ? { ...r, done: newDone } : r));
    const { error } = await supabase.from('reminders').update({ done: newDone }).eq('id', id);
    if (error) { load(); toast('Erro ao atualizar lembrete', 'error'); }
  }, [load]);

  const remove = useCallback(async (id) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (error) { load(); toast('Erro ao excluir lembrete', 'error'); }
  }, [load]);

  const update = useCallback(async (id, { title, sub, time, urgent, date, icon }) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, title, sub: sub || '', time, urgent: !!urgent, date, icon: icon || null } : r));
    const { error } = await supabase
      .from('reminders')
      .update({ title, sub: sub || '', time, urgent: !!urgent, reminder_date: date, icon: icon || null })
      .eq('id', id);
    if (error) { load(); toast('Erro ao atualizar lembrete', 'error'); }
  }, [load]);

  return (
    <RemindersContext.Provider value={{ reminders, loading, add, toggle, remove, update }}>
      {children}
    </RemindersContext.Provider>
  );
}

export function useReminders() {
  const ctx = useContext(RemindersContext);
  if (!ctx) throw new Error('useReminders must be used within RemindersProvider');
  return ctx;
}
