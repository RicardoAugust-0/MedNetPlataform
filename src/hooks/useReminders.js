import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

const today = () => new Date().toISOString().slice(0, 10);

export function useReminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('reminders').select('*').order('reminder_date').order('time').then(({ data }) => {
      if (data) setReminders(data.map(toLocal));
      setLoading(false);
    });
  }, []);

  const add = useCallback(async ({ title, sub, time, urgent, date }) => {
    const opt = { id: crypto.randomUUID(), title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, date: date || today(), _pending: true };
    setReminders(prev => [...prev, opt]);
    const { data, error } = await supabase
      .from('reminders')
      .insert({ title, sub: sub || '', time: time || '10:00', urgent: !!urgent, done: false, reminder_date: date || today() })
      .select().single();
    if (error) { setReminders(prev => prev.filter(r => r.id !== opt.id)); return; }
    setReminders(prev => prev.map(r => r.id === opt.id ? toLocal(data) : r));
  }, []);

  const toggle = useCallback(async (id) => {
    let newDone;
    setReminders(prev => prev.map(r => {
      if (r.id !== id) return r;
      newDone = !r.done;
      return { ...r, done: newDone };
    }));
    await supabase.from('reminders').update({ done: newDone }).eq('id', id);
  }, []);

  const remove = useCallback(async (id) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    await supabase.from('reminders').delete().eq('id', id);
  }, []);

  return { reminders, loading, add, toggle, remove };
}

function toLocal(row) {
  return { id: row.id, title: row.title, sub: row.sub, time: row.time, urgent: row.urgent, done: row.done, date: row.reminder_date || today() };
}
