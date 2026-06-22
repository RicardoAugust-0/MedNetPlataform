-- Aceleração do Analytics — Fase 5: normalização na ESCRITA (colunas geradas).
--
-- Diagnóstico (277k linhas, instância Micro): o get_analytics gastava ~44s
-- ("todos os meses") porque cada um dos ~15 sub-agregados re-chamava as funções
-- plpgsql de normalização POR LINHA (analytics_norm_crit / _clf / _to_uf). Um
-- único passe dessas funções sobre a tabela inteira já custava ~4,5s; multiplicado
-- pelos passes, dava os 40s+. A CPU é o gargalo (cache hit 100%, vCPU burstable).
--
-- Solução: materializar a normalização UMA VEZ, no momento da escrita, como colunas
-- STORED. As funções são todas IMMUTABLE, então o resultado é idêntico ao que o
-- caminho JS (aggregate) e a RPC calculavam em tempo de consulta — paridade
-- preservada. A partir daqui as queries leem colunas de texto simples (comparação
-- barata) em vez de chamar plpgsql por linha.
--
-- Colunas:
--   sev_norm   = analytics_norm_crit(severidade)            -- {Gravíssimo,Grave,Médio,Leve}
--   clf_norm   = analytics_norm_clf(analise_ia_plataforma)  -- {Positivo,Falso positivo,Não classificado}
--   uf         = analytics_to_uf(localidade)                -- sigla UF ou NULL
--   fleet_raw  = frota (fallback transportadora, '' se nenhum) -- mesma expressão do get_analytics
--
-- Custo único: ADD COLUMN ... GENERATED ... STORED reescreve a tabela uma vez
-- (~88MB). As 4 colunas vão num único ALTER para fazer apenas UM rewrite.

alter table driver_events
  add column sev_norm  text generated always as (analytics_norm_crit(severidade)) stored,
  add column clf_norm  text generated always as (analytics_norm_clf(analise_ia_plataforma)) stored,
  add column uf        text generated always as (analytics_to_uf(localidade)) stored,
  add column fleet_raw text generated always as
    (coalesce(nullif(frota, ''), nullif(transportadora, ''), '')) stored;

-- Índice parcial p/ agrupamento por empresa usando a coluna já materializada
-- (substitui o uso de driver_events_frota_active quando filtramos por fleet_raw).
create index if not exists driver_events_fleet_raw_active
  on driver_events (platform_id, fleet_raw)
  where severidade is distinct from 'Leve';

analyze driver_events;
