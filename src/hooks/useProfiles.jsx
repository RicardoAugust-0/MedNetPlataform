import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from "../supabase.js";

const ProfilesContext = createContext(null);
const PROFILE_COLUMNS = 'id, nome, cargo, role, avatar_url, created_at';

export function ProfilesProvider({ children }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('profiles').select(PROFILE_COLUMNS).order('created_at').then(({ data }) => {
      if (data) setProfiles(data);
      setLoading(false);
    });
  }, []);

  const applyPatch = useCallback((id, patch) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }, []);

  const persistPatch = useCallback(async (id, patch, previous) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', id)
      .select('id');
    if (error || !data || data.length === 0) {
      if (previous) applyPatch(id, previous);
      return { error: error || new Error('Atualização bloqueada pelas permissões do banco') };
    }
    return { error: null };
  }, [applyPatch]);

  const updateRole = useCallback(async (id, role) => {
    const prev = profiles.find(p => p.id === id);
    applyPatch(id, { role });
    return persistPatch(id, { role }, prev ? { role: prev.role } : null);
  }, [profiles, applyPatch, persistPatch]);

  const updateInfo = useCallback(async (id, { nome, cargo }) => {
    const prev = profiles.find(p => p.id === id);
    applyPatch(id, { nome, cargo });
    return persistPatch(id, { nome, cargo }, prev ? { nome: prev.nome, cargo: prev.cargo } : null);
  }, [profiles, applyPatch, persistPatch]);

  return (
    <ProfilesContext.Provider value={{ profiles, loading, updateRole, updateInfo }}>
      {children}
    </ProfilesContext.Provider>
  );
}

export function useProfiles() {
  const context = useContext(ProfilesContext);
  if (!context) {
    throw new Error('useProfiles must be used within a ProfilesProvider');
  }
  return context;
}
