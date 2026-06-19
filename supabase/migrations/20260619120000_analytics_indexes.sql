-- Fase 1 do plano de aceleração do Analytics: índices adicionais.
--
-- O servidor sempre exclui criticidade "Leve" da análise (excludeLeve / filtro
-- "severidade is distinct from 'Leve'"). Os índices parciais abaixo casam com
-- essa exclusão para que as RPCs de agregação (analytics_metadata / get_analytics)
-- e a busca por janela usem índice em vez de varrer a tabela inteira.
--
-- Observação de paridade: usamos "is distinct from 'Leve'" (NÃO "<> 'Leve'"),
-- porque o caminho JS mantém linhas com severidade NULL na análise
-- (null !== 'Leve' é verdadeiro; normCrit(null) => 'Médio'). "<> 'Leve'"
-- descartaria os NULLs e divergiria do JS.

-- Janela por plataforma/tempo (caso comum: um mês de uma plataforma).
create index if not exists driver_events_platform_ts_active
  on driver_events (platform_id, ocorrido_em desc)
  where severidade is distinct from 'Leve';

-- Agrupamento/filtro por empresa (frota).
create index if not exists driver_events_frota_active
  on driver_events (frota)
  where severidade is distinct from 'Leve';

-- Agregações por tipo de evento.
create index if not exists driver_events_platform_evento_active
  on driver_events (platform_id, nome_evento)
  where severidade is distinct from 'Leve';

analyze driver_events;
