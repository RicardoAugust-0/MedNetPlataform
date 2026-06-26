// Autenticação/autorização das rotas do Chat IA.

// Hierarquia de acesso (espelha src/data.js ROLE_LEVEL).
export const ROLE_LEVELS = { operador: 0, lider: 1, admin: 2 };

// Middleware de verificação de cargo
export function requireRole(supabase, minRole) {
  const min = ROLE_LEVELS[minRole] ?? 99;
  return async (req, res, next) => {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
      if (!token) {
        return res.status(401).json({ error: 'Autenticação obrigatória.' });
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user) {
        return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();
      if (profErr || !profile) {
        return res.status(403).json({ error: 'Perfil não encontrado.' });
      }

      if ((ROLE_LEVELS[profile.role] ?? 0) < min) {
        return res.status(403).json({ error: 'Acesso negado: nível de permissão insuficiente.' });
      }

      req.authUser = userData.user;
      req.authRole = profile.role;
      next();
    } catch (err) {
      console.error('[MedNet Backend] Erro na verificação de acesso AI:', err);
      return res.status(500).json({ error: 'Erro na verificação de acesso.' });
    }
  };
}
