-- Cache do cookie de sessão Maxtrack por usuário (evita login a cada pull)
CREATE TABLE maxtrack_sessions (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cookie     text        NOT NULL,
  cco        text        NOT NULL,
  expires_at timestamptz NOT NULL
);

ALTER TABLE maxtrack_sessions ENABLE ROW LEVEL SECURITY;

-- Cache dos eventos buscados por usuário (evita re-pull dentro do TTL)
CREATE TABLE maxtrack_cache (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  events     jsonb       NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL
);

ALTER TABLE maxtrack_cache ENABLE ROW LEVEL SECURITY;
