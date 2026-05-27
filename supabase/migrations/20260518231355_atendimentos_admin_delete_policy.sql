-- Permite que admins apaguem registros de atendimentos.
-- Necessário para a função "Limpar histórico" do painel Admin.

drop policy if exists "Admins apagam atendimentos" on public.atendimentos;

create policy "Admins apagam atendimentos" on public.atendimentos
  for delete to authenticated
  using (public.is_admin());
