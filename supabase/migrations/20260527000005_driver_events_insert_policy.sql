-- Habilita que o frontend (operadores autenticados) grave eventos diretamente
-- na tabela de histórico permanente driver_events durante upload manual.

CREATE POLICY "authenticated insert driver_events"
  ON public.driver_events FOR INSERT TO authenticated
  WITH CHECK (true);
