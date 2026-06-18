-- Permite que usuários autenticados excluam registros de driver_events.
-- Necessário para a funcionalidade "Remover fonte" da tela de Analytics.

create policy "authenticated delete driver_events"
  on public.driver_events for delete to authenticated
  using (true);
