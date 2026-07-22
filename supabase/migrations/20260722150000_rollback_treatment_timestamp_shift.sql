-- Reverte o deslocamento de +3h adicionado anteriormente em driver_events
-- para restaurar os timestamps UTC originais que já eram convertidos
-- corretamente via `(fim_tratativa at time zone 'America/Sao_Paulo')`.

update public.driver_events
set
  fim_tratativa = case
    when fim_tratativa is not null
    then fim_tratativa - interval '3 hours'
    else fim_tratativa
  end,
  inicio_tratativa = case
    when inicio_tratativa is not null
    then inicio_tratativa - interval '3 hours'
    else inicio_tratativa
  end
where platform_id = 'maxtrack'
  and fim_tratativa is not null;
