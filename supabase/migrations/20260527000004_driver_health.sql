-- Tabela de prontuário clínico e dados de saúde do motorista.
-- Vinculada ao nome do motorista.

CREATE TABLE if not exists public.driver_health (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_nome      text        NOT NULL UNIQUE,
  escala_epworth      integer     CHECK (escala_epworth >= 0 AND escala_epworth <= 24),
  polissonografia     text,
  historico_clinico   text,
  ultimo_exame_em     date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Habilita RLS
ALTER TABLE public.driver_health ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso dos operadores autenticados
CREATE POLICY "authenticated_select_driver_health" ON public.driver_health
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_driver_health" ON public.driver_health
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_driver_health" ON public.driver_health
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_driver_health" ON public.driver_health
  FOR DELETE TO authenticated
  USING (true);
