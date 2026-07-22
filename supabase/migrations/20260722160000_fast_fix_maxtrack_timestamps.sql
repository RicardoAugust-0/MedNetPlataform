-- Ajusta de forma idempotente e rápida apenas as linhas da MaxTrack onde
-- fim_tratativa foi gravada inadvertidamente antes de ocorrido_em devido ao
-- fuso UTC do servidor.

update public.driver_events
set
  fim_tratativa = fim_tratativa + interval '3 hours',
  inicio_tratativa = case
    when inicio_tratativa is not null then inicio_tratativa + interval '3 hours'
    else inicio_tratativa
  end
where platform_id = 'maxtrack'
  and fim_tratativa is not null
  and ocorrido_em is not null
  and fim_tratativa < ocorrido_em;
