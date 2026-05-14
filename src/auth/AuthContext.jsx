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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setProfile(null); return; }
    const meta = session.user.user_metadata;
    const emailFallback = session.user.email.split('@')[0];
    // Usado apenas na criação do perfil (primeiro login). Para perfis já
    // existentes a fonte de verdade é a tabela `profiles` — nunca o
    // user_metadata, que pode estar desatualizado se um admin renomeou o
    // operador (admin atualiza só `profiles`, não o auth user_metadata).
    const initialNome  = meta?.nome  || emailFallback;
    const initialCargo = meta?.cargo || 'Operador';

    if (!isSupabaseConfigured) {
      setProfile({ id: session.user.id, email: session.user.email, nome: initialNome, cargo: initialCargo, role: 'operador' });
      return;
    }

    let ignore = false;
    const syncProfile = async () => {
      const { data: existing } = await supabase
        .from('profiles')
        .select('nome, cargo, role, avatar_url, telefone, bio, maxtrack_email, sascar_token')
        .eq('id', session.user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', session.user.id);

        if (!ignore) {
          setProfile({
            id: session.user.id,
            email: session.user.email,
            nome: existing.nome || emailFallback,
            cargo: existing.cargo || 'Operador',
            role: existing.role || 'operador',
            avatar_url:      existing.avatar_url      || null,
            telefone:        existing.telefone        || '',
            bio:             existing.bio             || '',
            maxtrack_email:  existing.maxtrack_email  || '',
            sascar_token:    existing.sascar_token    || '',
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert({ id: session.user.id, nome: initialNome, cargo: initialCargo, last_seen: new Date().toISOString() })
        .select('role')
        .single();

      if (error) {
        const { data: current } = await supabase
          .from('profiles')
          .select('nome, cargo, role, avatar_url, telefone, bio, maxtrack_email, sascar_token')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!ignore && current) {
          setProfile({
            id: session.user.id,
            email: session.user.email,
            nome: current.nome || emailFallback,
            cargo: current.cargo || 'Operador',
            role: current.role || 'operador',
            avatar_url:     current.avatar_url     || null,
            telefone:       current.telefone       || '',
            bio:            current.bio            || '',
            maxtrack_email: current.maxtrack_email || '',
            sascar_token:   current.sascar_token   || '',
          });
        }
        return;
      }

      if (!ignore) {
        setProfile({
          id: session.user.id, email: session.user.email,
          nome: initialNome, cargo: initialCargo, role: data?.role || 'operador',
          avatar_url: null, telefone: '', bio: '', maxtrack_email: '', sascar_token: '',
        });
      }
    };

    syncProfile().catch((error) => {
      console.error('Erro ao sincronizar perfil do usuário:', error);
    });
    return () => { ignore = true; };
  }, [session]);

  const signIn = async (email, password) => {
    if (!isSupabaseConfigured) {
      if (email === 'admin@mednet.com.br') {
        setSession({ user: { id: 'mock-admin', email, user_metadata: { nome: 'Admin Teste', cargo: 'Gerente' } } });
        return { error: null };
      }
      setSession({ user: { id: 'mock-user', email, user_metadata: { nome: 'Operador Teste', cargo: 'Operador' } } });
      return { error: null };
    }
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => supabase.auth.signOut();

  const resetPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });

  // Aceita tanto a assinatura antiga (nome, cargo) quanto um objeto com
  // qualquer subconjunto de { nome, cargo, telefone, bio, avatar_url }.
  const updateProfile = async (nomeOrPatch, cargoArg) => {
    const patch = typeof nomeOrPatch === 'object' && nomeOrPatch !== null
      ? nomeOrPatch
      : { nome: nomeOrPatch, cargo: cargoArg };

    // Sincroniza apenas nome/cargo no user_metadata (compat com partes legadas).
    const metaPatch = {};
    if ('nome'  in patch) metaPatch.nome  = patch.nome;
    if ('cargo' in patch) metaPatch.cargo = patch.cargo;
    if (Object.keys(metaPatch).length > 0) {
      const { error } = await supabase.auth.updateUser({ data: metaPatch });
      if (error) return { error };
    }

    if (isSupabaseConfigured && session?.user) {
      const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
      if (error) return { error };
    }
    setProfile(prev => prev ? { ...prev, ...patch } : prev);
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
