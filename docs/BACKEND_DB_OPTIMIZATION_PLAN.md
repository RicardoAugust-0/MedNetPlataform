# Plano de otimizacao do backend e banco

Este plano organiza o que deve ser feito quando o VPS e o banco Supabase estiverem disponiveis. A primeira rodada de codigo ja deixou preparada a rota de ranking por operador para usar RPCs no banco e adicionou uma migration de performance.

## Alteracoes ja preparadas no codigo

- Ranking de operadores passou a usar RPCs agregadas no banco.
- WhatsApp chat passou a carregar ate 200 conversas/mensagens recentes com colunas explicitas.
- AI chat passou a carregar ate 100 threads, 200 mensagens por thread e 100 relatorios recentes.
- Automacoes passaram a carregar ate 500 logs recentes com colunas explicitas.
- Historico de disparos WhatsApp passou a carregar ate 500 registros recentes.
- Monitor/open alerts passou a buscar somente as colunas usadas pela agregacao local.
- Abertura manual de conversa WhatsApp no frontend agora envia `Authorization`.
- Atendimentos passaram a usar colunas explicitas em cargas, filtros, ranges e inserts.
- Dossies passaram a buscar somente campos usados de `driver_health`, `driver_events`, `atendimentos` e `driver_documents`.
- Planilha embutida passou a carregar/retornar somente colunas visiveis e campos de sincronizacao.
- Hooks de workspace, templates, lembretes, perfis, notas, links e automacoes passaram a usar projecoes explicitas.
- WhatsApp templates/credenciais no backend passaram a usar projecoes explicitas, sem expor campos desnecessarios.
- OCR de documentos passou a ler somente campos necessarios para processamento e retornar somente campos usados pela UI.
- Contagens `head:true` de analytics passaram a selecionar `id` em vez de `*`.

## 1. Aplicar migrations no Supabase

Objetivo: publicar as RPCs e indices novos.

Arquivo principal:

- `supabase/migrations/20260707100000_operator_activity_rpc.sql`

Checklist:

- Aplicar a migration no ambiente de producao.
- Confirmar que as funcoes existem:
  - `get_operator_event_activity`
  - `get_operator_sheet_activity`
- Confirmar que os indices foram criados:
  - `driver_events_operator_activity_idx`
  - `intervencoes_sheet_operator_activity_idx`
  - `driver_events_nome_ts`
  - `atendimentos_motorista_created_at_idx`
  - `driver_events_ocorrido_em_idx`
  - `atendimentos_created_placa_idx`
  - `whatsapp_messages_chat_created_at_idx`
  - `ai_chat_threads_user_updated_at_idx`
  - `ai_chat_messages_user_thread_created_at_idx`
  - `ai_generated_reports_created_at_idx`
  - `automation_logs_automation_created_at_idx`
  - `whatsapp_dispatches_status_created_at_idx`

SQL de verificacao:

```sql
select proname
from pg_proc
where proname in ('get_operator_event_activity', 'get_operator_sheet_activity');

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'driver_events_operator_activity_idx',
    'intervencoes_sheet_operator_activity_idx',
    'driver_events_nome_ts',
    'atendimentos_motorista_created_at_idx',
    'driver_events_ocorrido_em_idx',
    'atendimentos_created_placa_idx',
    'whatsapp_messages_chat_created_at_idx',
    'ai_chat_threads_user_updated_at_idx',
    'ai_chat_messages_user_thread_created_at_idx',
    'ai_generated_reports_created_at_idx',
    'automation_logs_automation_created_at_idx',
    'whatsapp_dispatches_status_created_at_idx'
  );
```

Feito quando: a migration aplica sem erro e as funcoes/indices aparecem nas consultas acima.

## 2. Validar ranking de operadores

Objetivo: garantir que a rota nova funciona e que o resultado bate com a regra anterior, sem o limite antigo de 5000 linhas.

Checklist:

- Subir o backend no VPS.
- Acessar o painel de Analytics.
- Abrir o card/tela de ranking de operadores.
- Testar filtros:
  - plataforma MaxTrack
  - mes especifico
  - periodo customizado
  - severidade `all`
  - severidade alta

SQL de performance:

```sql
explain analyze
select *
from get_operator_event_activity(
  'maxtrack',
  now() - interval '30 days',
  now(),
  'all'
);

explain analyze
select *
from get_operator_sheet_activity(
  'maxtrack',
  now() - interval '30 days',
  now()
);
```

Feito quando: a rota responde sem erro, sem timeout, e o `EXPLAIN ANALYZE` mostra tempo aceitavel para uso interativo.

## 3. Validar dossies

Objetivo: medir e melhorar as consultas interativas de prontuario/dossie.

Consultas impactadas:

- `driver_events` por `placa` ou `nome`
- `atendimentos` por `placa` ou `motorista`
- `driver_health` por `motorista_nome`
- `driver_documents` por `motorista_nome`

Checklist:

- Abrir dossie de motorista com placa.
- Abrir dossie de motorista sem placa, usando busca por nome.
- Confirmar que telemetria, atendimentos e documentos carregam rapido.

SQL de performance:

```sql
explain analyze
select *
from driver_events
where nome = '<NOME_DO_MOTORISTA>'
order by ocorrido_em desc
limit 200;

explain analyze
select *
from atendimentos
where motorista = '<NOME_DO_MOTORISTA>'
order by created_at desc
limit 100;
```

Feito quando: os planos usam indice e a tela de dossie nao trava em motoristas com muito historico.

## 4. Medir rotas principais do backend

Objetivo: parar de otimizar no escuro. Antes de novas mudancas grandes, medir duracao e volume por rota.

Rotas prioritarias:

- `GET /api/analytics`
- `GET /api/analytics/operator-ranking`
- `POST /api/analytics/import`
- rotas de dossie/documentos
- rotas de WhatsApp com historico de mensagens
- rotas de AI chat com historico/relatorios

Metrica minima por request:

- rota
- metodo
- duracao em ms
- status HTTP
- usuario/role quando aplicavel
- quantidade de linhas processadas quando existir

Feito quando: logs do VPS mostram claramente quais endpoints estao acima de 1s, 3s e 10s.

## 4.1. Validar historicos limitados

Objetivo: confirmar que os limites recentes nao prejudicam operacao diaria.

Limites preparados:

- WhatsApp chats: 200 conversas recentes.
- WhatsApp messages: 200 ultimas mensagens por conversa.
- AI chat threads: 100 conversas recentes.
- AI chat history: 200 mensagens por thread.
- AI reports: 100 relatorios recentes.
- Automation logs: 500 logs recentes.
- WhatsApp dispatches: 500 disparos recentes.
- Atendimentos recentes: 1000 ultimos registros na carga inicial.
- Dossie: 200 eventos de telemetria e 100 atendimentos exibidos por motorista.

Feito quando: as telas carregam rapido e os usuarios confirmam que esses limites sao suficientes para uso normal.

## 5. Auditar `select('*')` em tabelas grandes

Objetivo: reduzir dados trafegados e tempo de serializacao.

Prioridade alta:

- `driver_events`
- `atendimentos`
- `whatsapp_messages`
- `ai_chat_messages`
- `automation_logs`

Regra:

- Manter `select('*')` apenas em tabelas pequenas ou telas administrativas simples.
- Em tabelas grandes, selecionar apenas as colunas usadas pela tela/API.
- Para telas que montam varios blocos, preferir RPC unica quando fizer sentido.

Status atual: a varredura local nao encontrou mais `select('*')`/`.select()` problematico nas consultas da aplicacao; os resultados restantes sao selecao de texto no DOM.

Feito quando: essa regra for mantida em novas telas/rotas e validada com medicao no VPS.

## 6. Planejar RPC unica para dossie

Objetivo: reduzir varias chamadas Supabase em uma tela sensivel para uma unica chamada agregada.

RPC proposta:

- `get_driver_dossier(p_nome text, p_placa text default null)`

Retorno esperado:

- `health`
- `telemetry_total`
- `telemetry_events`
- `atendimentos`
- `documents`

Feito quando: a tela de dossie carrega com uma chamada principal e mantem o mesmo resultado visual.

## 7. Revisar importacao de eventos

Objetivo: garantir que importacoes grandes nao prendam o banco nem recalculem rollup de forma excessiva.

Pontos a medir:

- tempo por chunk de upsert
- quantidade de dias afetados
- tempo gasto nos triggers de `analytics_daily`
- volume de duplicados

Melhoria futura:

- staging table temporaria ou permanente
- merge controlado para `driver_events`
- refresh do `analytics_daily` por lote, nao por cada escrita isolada

Feito quando: importacoes grandes terminam previsivelmente e nao derrubam a responsividade do painel.

## 8. Manutencao do banco

Objetivo: manter performance com crescimento de dados.

Verificar mensalmente:

- tamanho de `driver_events`
- tamanho de `analytics_daily`
- tamanho dos indices principais
- linhas antigas fora do hot tier
- necessidade de `vacuum analyze`
- queries lentas recorrentes

SQL util:

```sql
select
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc;
```

Feito quando: existe rotina mensal de revisao e arquivamento/limpeza quando necessario.

## Ordem recomendada

1. Aplicar migration.
2. Validar ranking de operadores.
3. Validar dossies.
4. Medir rotas principais no VPS.
5. Ajustar `select('*')` em tabelas grandes.
6. Criar RPC unica de dossie.
7. Revisar importacao de eventos.
8. Implantar rotina mensal de manutencao.
