import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useReminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('reminders').select('*').order('time').then(({ data }) => {
      if (data) setReminders(data.map(toLocal));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async ({ title, sub, time, urgent }) => {
    const opt = { id: crypto.randomUUID(), title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, _pending: true };
    setReminders(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('reminders').insert({ title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false }).select().single();
    if (error) { setReminders(prev => prev.filter(r => r.id !== opt.id)); return; }
    setReminders(prev => prev.map(r => r.id === opt.id ? toLocal(data) : r));
  }, []);

  const toggle = useCallback(async (id) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, done: !r.done } : r));
    const item = await supabase.from('reminders').select('done').eq('id', id).single();
    if (item.data) await supabase.from('reminders').update({ done: !item.data.done }).eq('id', id);
  }, []);

  const remove = useCallback(async (id) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    await supabase.from('reminders').delete().eq('id', id);
  }, []);

  return { reminders, loading, add, toggle, remove };
}

function toLocal(row) {
  return { id: row.id, title: row.title, sub: row.sub, time: row.time, urgent: row.urgent, done: row.done };
}
