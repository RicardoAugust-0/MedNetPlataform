-- Fix analytics_norm_clf parity with JS normClf
-- 1. Redefine function to include 'justific', 'invalid', 'nao procede', 'sem proced'
create or replace function analytics_norm_clf(v text)
returns text
language plpgsql
immutable
as $$
declare s text;
begin
  s := analytics_norm(v);
  if s = '' then return 'Não classificado'; end if;
  if s like '%falso%' or s like '%improced%' or s like '%invalid%'
     or s like '%nao procede%' or s like '%sem proced%' or s like '%justific%' then
    return 'Falso positivo';
  end if;
  if s like '%positiv%' or s like '%confirmad%' or s like '%procede%'
     or s like '%verdadeir%' or s like '%real%' or s like '%valido%' then
    return 'Positivo';
  end if;
  return 'Não classificado';
end;
$$;
