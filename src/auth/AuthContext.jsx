import { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../supabase';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(undefined); // undefined = loading
  const [profile, setProfile]   = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null); // pula loading, mostra tela de login com aviso
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Carrega perfil (nome) sempre que a sessão mudar
  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    const meta = session.user.user_metadata;
    setProfile({
      id:    session.user.id,
      email: session.user.email,
      nome:  meta?.nome || session.user.email.split('@')[0],
      cargo: meta?.cargo || 'Operador',
    });
  }, [session]);

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signOut = () => supabase.auth.signOut();

  const updateProfile = (nome, cargo) =>
    supabase.auth.updateUser({ data: { nome, cargo } });

  return (
    <AuthCtx.Provider value={{ session, profile, signIn, signOut, updateProfile, loading: session === undefined }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
