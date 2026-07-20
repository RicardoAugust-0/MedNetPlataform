import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured, isMockAuthEnabled } from '../supabase';

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
  const [profileRetryNonce, setProfileRetryNonce] = useState(0);
  const profileRetryRef = useRef({ identity: null, failures: 0 });

  // O Supabase pode emitir SIGNED_IN novamente ao recuperar o foco e cria um
  // novo objeto de sessao ao renovar o token. A identidade abaixo permanece
  // estavel nesses eventos para nao reler o mesmo perfil a cada emissao.
  const sessionUserId = session?.user?.id || null;
  const sessionUserEmail = session?.user?.email || '';
  const sessionUserNome = session?.user?.user_metadata?.nome || '';
  const sessionUserCargo = session?.user?.user_metadata?.cargo || '';
  const profileIdentity = useMemo(() => (
    sessionUserId
      ? {
          id: sessionUserId,
          email: sessionUserEmail,
          initialNome: sessionUserNome || sessionUserEmail.split('@')[0],
          initialCargo: sessionUserCargo || 'Operador',
        }
      : null
  ), [sessionUserCargo, sessionUserEmail, sessionUserId, sessionUserNome]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      if (isMockAuthEnabled) {
        const saved = localStorage.getItem('dev-mock-session');
        setSession(saved ? JSON.parse(saved) : null);
      } else {
        localStorage.removeItem('dev-mock-session');
        setSession(null);
      }
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
    if (!profileIdentity) {
      profileRetryRef.current = { identity: null, failures: 0 };
      setProfile(null);
      return;
    }

    if (profileRetryRef.current.identity !== profileIdentity) {
      profileRetryRef.current = { identity: profileIdentity, failures: 0 };
    }

    const {
      id: userId,
      email: userEmail,
      initialNome,
      initialCargo,
    } = profileIdentity;
    const emailFallback = userEmail.split('@')[0];
    // Usado apenas na criação do perfil (primeiro login). Para perfis já
    // existentes a fonte de verdade é a tabela `profiles` — nunca o
    // user_metadata, que pode estar desatualizado se um admin renomeou o
    // operador (admin atualiza só `profiles`, não o auth user_metadata).

    if (!isSupabaseConfigured) {
      const role = userId === 'mock-admin' ? 'admin' : 'operador';
      setProfile({ id: userId, email: userEmail, nome: initialNome, cargo: initialCargo, role });
      return;
    }

    let ignore = false;
    let retryTimer = null;
    const syncProfile = async () => {
      const { data: existing, error: existingError } = await supabase
        .from('profiles')
        .select('nome, cargo, role, avatar_url, telefone, bio, maxtrack_email')
        .eq('id', userId)
        .retry(false)
        .maybeSingle();

      // Falha de rede nao significa que o perfil nao existe. Sem este teste, um
      // timeout seguia para INSERT e depois para uma segunda leitura, multiplicando
      // requisicoes durante indisponibilidade do Supabase.
      if (existingError) throw existingError;

      if (existing) {
        if (!ignore) {
          setProfile({
            id: userId,
            email: userEmail,
            nome: existing.nome || emailFallback,
            cargo: existing.cargo || 'Operador',
            role: existing.role || 'operador',
            avatar_url:             existing.avatar_url             || null,
            telefone:               existing.telefone               || '',
            bio:                    existing.bio                    || '',
            maxtrack_email:         existing.maxtrack_email         || '',
          });
        }

        // last_seen e telemetria best-effort; nunca deve bloquear a liberacao do
        // perfil nem transformar uma leitura bem-sucedida em falha de login.
        supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', userId)
          .then(({ error }) => {
            if (error) console.warn('[Auth] Nao foi possivel atualizar last_seen:', error.message);
          });
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .insert({ id: userId, nome: initialNome, cargo: initialCargo, last_seen: new Date().toISOString() })
        .select('role')
        .single();

      if (error) {
        // Uma segunda leitura so e valida para a corrida de primeiro login. Em
        // qualquer outro erro (rede, permissao, schema), propague a causa real.
        if (error.code !== '23505') throw error;

        const { data: current, error: currentError } = await supabase
          .from('profiles')
          .select('nome, cargo, role, avatar_url, telefone, bio, maxtrack_email')
          .eq('id', userId)
          .retry(false)
          .maybeSingle();

        if (currentError) throw currentError;

        if (!current) throw new Error('Perfil criado, mas ainda nao esta disponivel para leitura.');

        if (!ignore) {
          setProfile({
            id: userId,
            email: userEmail,
            nome: current.nome || emailFallback,
            cargo: current.cargo || 'Operador',
            role: current.role || 'operador',
            avatar_url:            current.avatar_url            || null,
            telefone:              current.telefone              || '',
            bio:                   current.bio                   || '',
            maxtrack_email:        current.maxtrack_email        || '',
          });
        }
        return;
      }

      if (!ignore) {
        setProfile({
          id: userId, email: userEmail,
          nome: initialNome, cargo: initialCargo, role: data?.role || 'operador',
          avatar_url: null, telefone: '', bio: '', maxtrack_email: '',
        });
      }
    };

    syncProfile()
      .then(() => {
        if (!ignore) profileRetryRef.current.failures = 0;
      })
      .catch((error) => {
        if (ignore) return;
        const failures = profileRetryRef.current.failures + 1;
        profileRetryRef.current.failures = failures;
        const delayMs = Math.min(5000 * (2 ** (failures - 1)), 60000);
        console.error('Erro ao sincronizar perfil do usuário; nova tentativa agendada:', error);
        retryTimer = setTimeout(() => {
          setProfileRetryNonce(current => current + 1);
        }, delayMs);
      });
    return () => {
      ignore = true;
      clearTimeout(retryTimer);
    };
  }, [profileIdentity, profileRetryNonce]);

  const signIn = async (email, password) => {
    if (!isSupabaseConfigured) {
      if (!isMockAuthEnabled) {
        return { error: new Error('Serviço de autenticação indisponível. Verifique a configuração do ambiente.') };
      }
      const isAdmin = email === 'admin@mednet.com.br';
      const mockSession = {
        user: {
          id: isAdmin ? 'mock-admin' : 'mock-user',
          email,
          user_metadata: { nome: isAdmin ? 'Admin Teste' : 'Operador Teste', cargo: isAdmin ? 'Gerente' : 'Operador' },
        },
      };
      localStorage.setItem('dev-mock-session', JSON.stringify(mockSession));
      setSession(mockSession);
      return { error: null };
    }
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = () => {
    if (!isSupabaseConfigured) {
      localStorage.removeItem('dev-mock-session');
      setSession(null);
      return Promise.resolve();
    }
    return supabase.auth.signOut();
  };

  const resetPassword = (email) => {
    if (!isSupabaseConfigured) {
      return Promise.resolve({ error: new Error('Serviço de autenticação indisponível.') });
    }
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  };

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
