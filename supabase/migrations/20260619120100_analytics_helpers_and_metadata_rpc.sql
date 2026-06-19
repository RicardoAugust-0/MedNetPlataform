-- Fase 2 do plano de aceleração do Analytics.
--
-- (a) Funções-helper que replicam EXATAMENTE a normalização do fatigueParser.js
--     (norm / normCrit / normClf / toUF). O caminho JS re-normaliza os valores
--     crus do banco dentro de aggregate(); para a RPC bater com o JS na paridade,
--     o SQL precisa aplicar a mesma normalização — não basta assumir que a coluna
--     já está normalizada.
-- (b) RPC analytics_metadata: monta os dropdowns (meses / tipos / frotas) sem
--     baixar todas as linhas. A resolução de frota -> empresa (carrier_aliases)
--     continua no servidor (matching por substring sobre JSON em app_settings).

-- ── norm(): trim + lower + remoção de acentos (Português) ──
create or replace function analytics_norm(s text)
returns text
language sql
immutable
as $$
  select translate(
    lower(trim(coalesce(s, ''))),
    'àáâãäåèéêëìíîïòóôõöøùúûüçñ',
    'aaaaaaeeeeiiiioooooouuuucn'
  );
$$;

-- ── normCrit(): {Gravíssimo, Grave, Médio, Leve}, mesma ordem de testes do JS ──
create or replace function analytics_norm_crit(v text)
returns text
language plpgsql
immutable
as $$
declare s text;
begin
  s := analytics_norm(v);
  if s = '' then return 'Médio'; end if;
  if s like '%gravi%' or s like '%critic%' or s like '% n2%' or s like '%n2'
     or s like '%altiss%' or s like '%alta%' or s like '%alto%' then
    return 'Gravíssimo';
  end if;
  if s like '%grave%' or s like '%moder%' then
    return 'Grave';
  end if;
  if s like '%leve%' or s = 'baixo' or s = 'baixa' then
    return 'Leve';
  end if;
  return 'Médio';
end;
$$;

-- ── normClf(): {Positivo, Falso positivo, Não classificado} ──
-- "Improcedente" contém "procede" => testar Falso positivo ANTES de Positivo.
create or replace function analytics_norm_clf(v text)
returns text
language plpgsql
immutable
as $$
declare s text;
begin
  s := analytics_norm(v);
  if s = '' then return 'Não classificado'; end if;
  if s like '%falso%' or s like '%improced%' then
    return 'Falso positivo';
  end if;
  if s like '%positiv%' or s like '%confirmad%' or s like '%procede%'
     or s like '%verdadeir%' or s like '%real%' or s like '%valido%' then
    return 'Positivo';
  end if;
  return 'Não classificado';
end;
$$;

-- ── toUF(): última sigla [A-Z]{2} que seja uma UF válida (igual ao JS) ──
-- WITH ORDINALITY garante a ordem dos matches (rn). O JS itera de trás p/ frente
-- e devolve a primeira sigla válida => aqui: maior rn que seja UF (order by rn desc).
create or replace function analytics_to_uf(v text)
returns text
language sql
immutable
as $$
  select m.arr[1]
  from regexp_matches(upper(coalesce(v, '')), '\m[A-Z]{2}\M', 'g')
       with ordinality as m(arr, rn)
  where m.arr[1] = any (array[
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
    'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
  ])
  order by m.rn desc
  limit 1;
$$;

-- ── RPC de metadados (dropdowns) ──
-- months: desc (servidor corta em 12, igual a sort().reverse().slice(0,12) do JS).
-- types : nome_evento distintos, asc.
-- fleets: valor cru de frota (com fallback p/ transportadora) -> contagem.
--         O servidor resolve aliases p/ montar availableCompanies.
create or replace function analytics_metadata(p_platform_ids text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select frota, transportadora, nome_evento, ocorrido_em
    from driver_events
    where platform_id = any (p_platform_ids)
      and severidade is distinct from 'Leve'
  )
  select jsonb_build_object(
    'months', (
      select coalesce(jsonb_agg(m order by m desc), '[]'::jsonb)
      from (
        select distinct to_char(ocorrido_em at time zone 'America/Sao_Paulo', 'YYYY-MM') m
        from base
      ) s
    ),
    'types', (
      select coalesce(jsonb_agg(t order by t), '[]'::jsonb)
      from (
        select distinct nome_evento t
        from base
        where nome_evento is not null and nome_evento <> ''
      ) s
    ),
    'fleets', (
      select coalesce(jsonb_object_agg(fleet, c), '{}'::jsonb)
      from (
        select coalesce(nullif(frota, ''), nullif(transportadora, ''), '') as fleet,
               count(*) c
        from base
        group by 1
      ) f
    )
  );
$$;

revoke execute on function analytics_metadata(text[]) from anon;
grant execute on function analytics_metadata(text[]) to authenticated;
