import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';

const AuthCtx = createContext(null);

function parseAuthType() {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return params.get('type'); // 'invite' | 'recovery' | null
}

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(undefined);
  const [profile, setProfile]   = useState(null);
  const [authType, setAuthType] = useState(null); // 'invite' | 'recovery' | null

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      return;
    }

    const type = parseAuthType();
    if (type === 'invite' || type === 'recovery') {
      setAuthType(type);
    }

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    const meta = session.user.user_metadata;
    const nome  = meta?.nome  || session.user.email.split('@')[0];
    const cargo = meta?.cargo || 'Operador';

    if (!isSupabaseConfigured) {
      setProfile({ id: session.user.id, email: session.user.email, nome, cargo, role: 'operador' });
      return;
    }

    // Upsert atualiza last_seen e retorna a linha — incluindo role gerenciado pelo admin
    supabase
      .from('profiles')
      .upsert({ id: session.user.id, nome, cargo, last_seen: new Date().toISOString() }, { onConflict: 'id' })
      .select('role')
      .single()
      .then(({ data }) => {
        setProfile({ id: session.user.id, email: session.user.email, nome, cargo, role: data?.role || 'operador' });
      });
  }, [session]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  const resetPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });

  const updateProfile = async (nome, cargo) => {
    const { error } = await supabase.auth.updateUser({ data: { nome, cargo } });
    if (error) return { error };
    if (isSupabaseConfigured && session?.user) {
      await supabase.from('profiles').update({ nome, cargo }).eq('id', session.user.id);
    }
    setProfile(prev => prev ? { ...prev, nome, cargo } : prev);
    return { error: null };
  };

  const setPassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) {
      setAuthType(null);
      window.history.replaceState(null, '', window.location.pathname);
    }
    return { error };
  };

  return (
    <AuthCtx.Provider value={{ session, profile, authType, signIn, signOut, resetPassword, updateProfile, setPassword, loading: session === undefined }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
