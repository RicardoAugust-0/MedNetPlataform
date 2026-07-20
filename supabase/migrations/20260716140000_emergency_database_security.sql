-- Correcao emergencial de autorizacao para perfis e eventos financeiros.
-- Esta migration e aditiva e nao depende de alteracoes no historico antigo.

-- Valores fora do contrato nao podem continuar servindo como autorizacao.
update public.profiles
set role = 'operador'
where role is null
   or role not in ('operador', 'lider', 'admin');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('operador', 'lider', 'admin'));
  end if;
end
$$;

-- O trigger compara OLD/NEW, algo que uma policy RLS isolada nao consegue
-- fazer. Assim o usuario continua podendo atualizar nome, cargo, last_seen e
-- personalizacao, mas nunca promove o proprio papel.
create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := coalesce(auth.role(), '');
  v_actor_is_admin boolean := false;
begin
  if new.role is null or new.role not in ('operador', 'lider', 'admin') then
    raise exception 'Papel de perfil invalido'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    -- O AuthContext omite role e recebe o default operador. Service role e o
    -- owner do banco continuam aptos a provisionar perfis administrativos.
    if v_actor_id is not null
       and v_actor_role <> 'service_role'
       and new.role <> 'operador' then
      raise exception 'Novos perfis autenticados devem iniciar como operador'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'O identificador do perfil e imutavel'
      using errcode = '42501';
  end if;

  if new.role is distinct from old.role then
    if v_actor_role = 'service_role' or v_actor_id is null then
      return new;
    end if;

    select exists (
      select 1
      from public.profiles p
      where p.id = v_actor_id
        and p.role = 'admin'
    ) into v_actor_is_admin;

    if not v_actor_is_admin then
      raise exception 'Somente administradores podem alterar papeis'
        using errcode = '42501';
    end if;

    -- Evita que a interface remova acidentalmente o ultimo administrador. O
    -- service_role continua sendo a via de recuperacao deliberada.
    if old.role = 'admin'
       and new.role <> 'admin'
       and not exists (
         select 1
         from public.profiles p
         where p.id <> old.id
           and p.role = 'admin'
       ) then
      raise exception 'Nao e permitido remover o ultimo administrador'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_profile_authorization_fields()
  from public, anon, authenticated;

drop trigger if exists protect_profile_authorization_fields_trigger
  on public.profiles;
create trigger protect_profile_authorization_fields_trigger
before insert or update on public.profiles
for each row execute function public.protect_profile_authorization_fields();

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and role = 'operador'
  );

drop policy if exists "profiles_update" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
  )
  with check (
    id = (select auth.uid())
    or (select public.is_admin())
  );

-- API explicita para mudanca administrativa de papel. O trigger acima ainda
-- protege consumidores legados que atualizam profiles diretamente.
create or replace function public.admin_set_profile_role(
  p_profile_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text := coalesce(auth.role(), '');
begin
  if v_actor_role <> 'service_role' and (
    v_actor_id is null or not exists (
      select 1
      from public.profiles p
      where p.id = v_actor_id
        and p.role = 'admin'
    )
  ) then
    raise exception 'Somente administradores podem alterar papeis'
      using errcode = '42501';
  end if;

  if p_role is null or p_role not in ('operador', 'lider', 'admin') then
    raise exception 'Papel de perfil invalido'
      using errcode = '22023';
  end if;

  update public.profiles
  set role = p_role
  where id = p_profile_id;

  if not found then
    raise exception 'Perfil nao encontrado'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_set_profile_role(uuid, text)
  from public, anon;
grant execute on function public.admin_set_profile_role(uuid, text)
  to authenticated, service_role;

comment on function public.admin_set_profile_role(uuid, text) is
  'Altera o papel de um perfil somente quando o JWT pertence a um administrador.';

-- Uploads manuais do Monitor continuam aceitos, mas nao podem atribuir um
-- operador e portanto nao conseguem fabricar linhas usadas na remuneracao.
drop policy if exists "authenticated insert driver_events"
  on public.driver_events;
drop policy if exists "authenticated_manual_insert_driver_events"
  on public.driver_events;
create policy "authenticated_manual_insert_driver_events"
  on public.driver_events for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and operador is null
  );

-- A exclusao de uma fonte permanece disponivel na area administrativa, mas
-- deixa de ser uma permissao global de todo usuario autenticado.
drop policy if exists "authenticated delete driver_events"
  on public.driver_events;
drop policy if exists "privileged_delete_driver_events"
  on public.driver_events;
create policy "privileged_delete_driver_events"
  on public.driver_events for delete to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('lider', 'admin')
    )
  );

-- As duas overloads de ingestao executam como o owner e ignoram RLS. Somente
-- o backend com service_role pode chama-las.
revoke all on function public.upsert_driver_events_preserve(jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_driver_events_preserve(jsonb)
  to service_role;

revoke all on function public.upsert_driver_events_preserve(jsonb, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.upsert_driver_events_preserve(jsonb, boolean, boolean)
  to service_role;

-- refresh_analytics_daily apaga e recria o rollup; chamadas externas ficam
-- restritas ao backend. Os triggers continuam executando como owner.
revoke all on function public.refresh_analytics_daily(text, date[])
  from public, anon, authenticated;
grant execute on function public.refresh_analytics_daily(text, date[])
  to service_role;

-- Claims da fila Horizon tambem sao mutaveis SECURITY DEFINER. As migrations
-- anteriores revogavam anon/authenticated, mas esqueciam o privilegio herdado
-- de PUBLIC concedido por padrao pelo PostgreSQL.
revoke all on function public.claim_horizon_treatment_queue(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_horizon_treatment_queue(integer, integer)
  to service_role;

revoke all on function public.resolve_horizon_treatment_queue(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_horizon_treatment_queue(uuid, text, text)
  to service_role;

-- Funcoes de trigger/event trigger nunca devem ser RPCs. Remove em bloco o
-- EXECUTE implicito de todas as funcoes SECURITY DEFINER desse tipo.
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.prorettype in (
        'pg_catalog.trigger'::regtype,
        'pg_catalog.event_trigger'::regtype
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      v_function
    );
  end loop;
end
$$;
