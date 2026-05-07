import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function useProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at').then(({ data }) => {
      if (data) setProfiles(data);
      setLoading(false);
    });
  }, []);

  const updateRole = useCallback(async (id, role) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p));
    await supabase.from('profiles').update({ role }).eq('id', id);
  }, []);

  const updateInfo = useCallback(async (id, { nome, cargo }) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, nome, cargo } : p));
    await supabase.from('profiles').update({ nome, cargo }).eq('id', id);
  }, []);

  return { profiles, loading, updateRole, updateInfo };
}
