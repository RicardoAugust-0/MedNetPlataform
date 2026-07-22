-- Corrige timestamps de tratativa (inicio_tratativa e fim_tratativa) em driver_events
-- que foram gravados com o parser legado em servidores UTC (gerando um desvio de -3h
-- em relação a ocorrido_em).

update public.driver_events
set
  fim_tratativa = case
    when fim_tratativa is not null
     and ocorrido_em is not null
     and fim_tratativa < ocorrido_em
     and (ocorrido_em - fim_tratativa) between interval '2 hours' and interval '4 hours'
    then fim_tratativa + interval '3 hours'
    else fim_tratativa
  end,
  inicio_tratativa = case
    when inicio_tratativa is not null
     and ocorrido_em is not null
     and inicio_tratativa < ocorrido_em
     and (ocorrido_em - inicio_tratativa) between interval '2 hours' and interval '4 hours'
    then inicio_tratativa + interval '3 hours'
    else inicio_tratativa
  end
where platform_id = 'maxtrack'
  and (
    (fim_tratativa is not null and fim_tratativa < ocorrido_em and (ocorrido_em - fim_tratativa) between interval '2 hours' and interval '4 hours')
    or
    (inicio_tratativa is not null and inicio_tratativa < ocorrido_em and (ocorrido_em - inicio_tratativa) between interval '2 hours' and interval '4 hours')
  );
