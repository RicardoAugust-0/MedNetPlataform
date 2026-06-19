# Aceleração do Analytics via RPC no Postgres — Status / Handoff

> Documento de continuidade. O trabalho **não foi finalizado nesta sessão**.
> A camada de banco (migrations + RPCs) está **pronta, aplicada em produção e
> validada numericamente**. Falta a fiação no servidor Express, o ajuste de
> fuso no caminho JS, o texto de loading no front e o script de paridade.

Projeto Supabase: **MedNet** — `jvqlxrixzqlbwmmdwcob` (região `sa-east-1`).
Data da sessão: 2026-06-19.

---

## 0. Decisões tomadas (confirmadas com o usuário)

1. **`driver_events` está VAZIA (0 linhas) em produção.** Não há problema de
   performance hoje; todo o trabalho é preparatório (escala para 1M+). O teste
   de paridade JS×RPC com dados reais (§7 do plano original) **não pôde ser
   feito** — fica para quando houver dados.
2. **Construir tudo atrás de uma flag** `ANALYTICS_ENGINE` (default `js`). O
   caminho atual fica intacto; o caminho RPC só liga quando `ANALYTICS_ENGINE=rpc`.
3. **Padronizar fuso em `America/Sao_Paulo`.** O banco está em `UTC` e o JS
   agrega no fuso do servidor (Coolify = UTC) — ou seja, hoje os buckets de
   hora/dia/mês saem em UTC (errado p/ o usuário BR). A RPC usa
   `at time zone 'America/Sao_Paulo'`; o caminho JS precisa ser corrigido p/ SP
   também (item pendente abaixo). Como a tabela está vazia, não há impacto vivo.

### Desvios em relação ao plano original (e porquê)

- **Engine `hybrid` (busca por janela + aggregate JS) foi descartada.** Ela só
  existia para de-riscar antes da RPC ser confiável, e tinha uma divergência em
  `d.meta.months` (a janela perde os demais meses). Como a RPC `get_analytics`
  foi **validada numericamente**, ela domina o hybrid (agrega no banco, não baixa
  nada). Engines finais: **`js`** (default/fallback) e **`rpc`**.
- **Modo comparação (compare) cai no caminho JS** mesmo com `ANALYTICS_ENGINE=rpc`.
  O `combinedD` do compare é a união de linhas de várias plataformas com filtro
  de empresa **por plataforma** (`company_<pid>`), o que não dá para expressar em
  uma única chamada `get_analytics` (p_frotas é global). Acelerar o compare exige
  RPC adicional — fica como trabalho futuro.
- **Grants seguem a convenção do projeto**: `REVOKE EXECUTE ... FROM anon;
  GRANT ... TO authenticated;` (igual a `get_distinct_transportadoras`). As RPCs
  são chamadas só pelo servidor (service_role), então `anon` não é necessário.

---

## 1. O que está PRONTO (aplicado em produção + arquivos no repo)

### Migration 1 — Índices · `supabase/migrations/20260619120000_analytics_indexes.sql`
**Aplicada** (via `apply_migration`). Índices parciais `where severidade is
distinct from 'Leve'`:
- `driver_events_platform_ts_active (platform_id, ocorrido_em desc)`
- `driver_events_frota_active (frota)`
- `driver_events_platform_evento_active (platform_id, nome_evento)`

Usa `is distinct from 'Leve'` (mantém NULLs) e **não** `<> 'Leve'`, para casar
com o JS (`excludeLeve` mantém severidade NULL).

### Migration 2 — Helpers + metadata · `supabase/migrations/20260619120100_analytics_helpers_and_metadata_rpc.sql`
**Aplicada.** Funções que **replicam exatamente** a normalização do
`fatigueParser.js` (necessário porque o `aggregate()` re-normaliza os valores
crus do banco):
- `analytics_norm(text)` — trim + lower + remove acentos PT.
- `analytics_norm_crit(text)` → `{Gravíssimo, Grave, Médio, Leve}` (mesma ordem
  de testes do `normCrit`).
- `analytics_norm_clf(text)` → `{Positivo, Falso positivo, Não classificado}`
  (testa "falso/improced" ANTES de "positiv/procede", igual ao `normClf`).
- `analytics_to_uf(text)` → última sigla `[A-Z]{2}` que seja UF válida
  (`WITH ORDINALITY` para ordem determinística — **ver bug corrigido abaixo**).
- `analytics_metadata(text[])` → `jsonb {months(desc), types(asc), fleets{cru:contagem}}`
  com `severidade is distinct from 'Leve'`.

> ⚠️ **Bug corrigido na sessão:** a 1ª versão de `analytics_to_uf` usava
> `row_number() over ()` sobre `regexp_matches(...)` no SELECT-list, que **não é
> ordenado de forma determinística** (retornava a 1ª sigla em vez da última).
> Trocado por `regexp_matches(...) WITH ORDINALITY ... order by rn desc`. O
> arquivo no repo já tem a versão correta **e** ela foi reaplicada em produção.

### Migration 3 — `get_analytics` · `supabase/migrations/20260619120200_get_analytics_rpc.sql`
**Aplicada** (ver nota de histórico abaixo). Função `plpgsql stable security
definer` que devolve o objeto `d` inteiro como `jsonb`, **no mesmo shape** que
`aggregate()`. Assinatura:

```
get_analytics(
  p_platform_ids   text[],
  p_date_from      timestamptz default null,
  p_date_to        timestamptz default null,
  p_frotas         text[]      default null,   -- empresa já resolvida p/ frotas cruas
  p_severity       text        default null,   -- 'high'|'medium'|valor exato|'all'|null
  p_classification text        default null,
  p_event_type     text        default null,
  p_daily          boolean     default false,  -- true=buckets diários (mês), false=mensal
  p_window_months  boolean     default false,  -- true=meta.months da janela (modo custom)
  p_tz             text        default 'America/Sao_Paulo'
) returns jsonb
```

> ⚠️ **Bug corrigido na sessão:** `top_motoristas`/`top_placas`/`uf` usavam
> `(select jsonb_agg(...) from d)` referenciando o alias do FROM externo como se
> fosse tabela (erro `relation "d" does not exist`). Trocado por `jsonb_agg(...)`
> direto sobre a subquery. O arquivo no repo já está correto.

> ⚠️ **Nota de histórico de migrations:** a versão **com o bug** foi registrada
> no histórico remoto via `apply_migration`; a **correção** foi aplicada em
> produção via `execute_sql` (não gera linha no histórico). O **arquivo .sql no
> repo é a fonte da verdade e já está correto** — um `supabase db push` num banco
> limpo cria a versão certa. Em produção, a função ativa **é a correta**. Se
> quiser alinhar o histórico, basta reaplicar o arquivo como nova migration.

### Módulo do servidor · `server/analytics-rpc.js`
**Criado** (ainda **não importado** pelo `index.js`). Exporta helpers puros e o
orquestrador `buildSingleAnalyticsViaRPC(supabase, query, { resolveMonitorName, aliases })`
que: chama `analytics_metadata`, deriva limites de data/bucket, resolve empresa→
frotas, chama `get_analytics` (atual + mês anterior) e converte `frota_raw`→
`d.frota` (top 8 com aliases). Retorna
`{ availableMonths, availableCompanies, availableTypes, d, prevD }`.

---

## 2. VALIDAÇÃO já feita (sem dados reais)

- **Shape**: `get_analytics` na tabela vazia devolve `d` com as 17 chaves certas,
  arrays de tamanho correto (hora=24, dow=7, vel=6), zeros/null/`[]`/`{}` onde
  esperado; modo diário gera os 30 dias de junho com `valores` zerados e
  `variacao[0]=null`.
- **Numérica (sentinela)**: inseri 6 linhas sob `platform_id='__ptest__'`
  (depois **removidas** — tabela voltou a 0), cobrindo os pontos de maior risco.
  **Todos os números bateram com o cálculo manual**:
  - Fuso: evento `23:00 SP` (31/mai) caiu em `2026-05`/hora 23; `00:30 SP` na
    hora 0. `meta.periodo = ['31/05/2026','15/06/2026']`.
  - Exclusão de "Leve" dupla: `total=4` (não 6) — `'baixo'` (normaliza p/ Leve) e
    `'Leve'` exato ambos excluídos.
  - Normalização: `'Alta'`→Gravíssimo, `'Procedente'`→Positivo, `null`→Não class.
  - Mediana half-up `[20,50,80,100]`→65; labels `mai/26`,`jun/26`; variação 200.
  - `frota_raw` (fallback p/ transportadora), `uf` (última sigla), buckets de vel,
    `hora_pos`, `clf_total`, `categorias` — todos corretos.
  - Filtros: empresa (3), tipo de evento (2), `severity='high'` (2 — `'Alta'`
    cru **não** casa com `high`, só `Grave`/`Gravíssimo` exatos), classificação
    raw-exata (replica o `filterRows`, que filtra pelo valor CRU).

---

## 3. O que FALTA (acionável, em ordem)

### 3.1. Fiação no `server/index.js` (PENDENTE — não iniciado)
A edição foi **revertida** para manter a árvore limpa; aplicar do zero:

**(a) Import** (após a linha do `aggregate, PLATFORMS`):
```js
import { buildSingleAnalyticsViaRPC } from './analytics-rpc.js';
```

**(b) Cache de resultado** (perto de `const rawEventsCache = {};`):
```js
const resultCache = new Map();            // chave: engine|originalUrl -> { data, ts }
const RESULT_TTL = 5 * 60 * 1000;
```

**(c) Fuso SP no `formatDataRows`.** Adicionar helper antes de `formatDataRows`:
```js
// ocorrido_em (instante UTC) -> wall-clock de São Paulo 'YYYY-MM-DD HH:mm:ss'.
// SP é UTC-3 fixo (Brasil sem horário de verão desde 2019); bate com o
// `at time zone 'America/Sao_Paulo'` da RPC para os dados do hot tier.
function toSpWallclock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const sp = new Date(d.getTime() - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${sp.getUTCFullYear()}-${p(sp.getUTCMonth() + 1)}-${p(sp.getUTCDate())} `
       + `${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}`;
}
```
E trocar a 1ª coluna em `formatDataRows`:
```js
//   ev.ocorrido_em,                 // ANTES
    toSpWallclock(ev.ocorrido_em),   // DEPOIS
```
> Isso padroniza o caminho JS (engine `js` e o fallback do compare) em SP, igual
> à RPC. Afeta também o CSV (passa a mostrar hora local SP) e o filtro de range
> custom (passa a filtrar por data SP) — ambos desejáveis. Os testes
> (`fatigueParser.test.js`) usam horários no meio do dia, sem virada de fuso, e
> **não quebram**.

**(d) Engine + cache + branch RPC** dentro do `try` de `app.get('/api/analytics')`,
logo após o check `if (targetPlatformIds.length === 0) {...}`:
```js
const engine = (process.env.ANALYTICS_ENGINE || 'js').toLowerCase();
const cacheKey = `${engine}|${req.originalUrl}`;
const cached = resultCache.get(cacheKey);
if (cached && (Date.now() - cached.ts < RESULT_TTL)) {
  return res.json(cached.data);
}
const sendPayload = (payload) => {
  resultCache.set(cacheKey, { data: payload, ts: Date.now() });
  return res.json(payload);
};

// Caminho RPC: só uma plataforma. Compare e qualquer erro caem no caminho JS.
if (engine === 'rpc' && !isCompare && targetPlatformIds.length === 1) {
  try {
    const payload = await buildSingleAnalyticsViaRPC(
      supabase,
      { platformId: targetPlatformIds[0], month, startDate, endDate,
        company, severity, classification, eventType },
      { resolveMonitorName, aliases }
    );
    return sendPayload(payload);
  } catch (rpcErr) {
    console.error('[MedNet Backend] RPC falhou, fallback JS:', rpcErr.message || rpcErr);
  }
}
```
E trocar os dois `return res.json({...})` finais (branch compare e branch single)
por `return sendPayload({...})` com o mesmo objeto.

**(e) Invalidar o resultCache** no `app.post('/api/clear-cache')`: adicionar
`resultCache.clear();` nos dois ramos (com e sem `platformId`).

### 3.2. Front-end (PENDENTE)
`src/modules/Analytics.jsx` linha ~555: trocar o texto de loading
`"Carregando dados da plataforma..."` por `"Agregando dados…"`. Nenhuma outra
mudança — o shape do `d` é idêntico, os gráficos não mudam.

### 3.3. Script de paridade (PENDENTE — obrigatório antes de ligar a flag com dados)
Criar `scripts/analytics-parity.mjs` que, para 1–2 plataformas reais e alguns
meses: chama o caminho JS (`getRawEvents`→`formatDataRows`(com SP)→`aggregate`) e
a RPC `get_analytics` com os mesmos params, e faz `deepEqual` chave-a-chave com
tolerância onde houver arredondamento. Conferir especialmente: `kpis.vel_mediana`,
`uf`, `hora/dow` (fuso), `mensal*.variacao`, `mensal_tipo` (top 5), `frota`
(aliases). **Só ligar `ANALYTICS_ENGINE=rpc` quando bater.**

### 3.4. Rollout
1. Aplicar 3.1 + 3.2, deploy com `ANALYTICS_ENGINE` ausente (= `js`). Nada muda.
2. Quando houver dados: rodar 3.3 (paridade).
3. Setar `ANALYTICS_ENGINE=rpc` no env do servidor (Coolify). Fallback automático
   para JS em qualquer erro de RPC.

---

## 4. Caveats de paridade conhecidos (divergências aceitas / a vigiar)

- **Filtros usam valor CRU exato** (igual ao `filterRows`): `severity='high'` só
  casa `Grave`/`Gravíssimo` exatos (não `'Alta'`); `classification`/`eventType`
  idem. Em produção os valores já vêm normalizados (`severidade ∈ {Gravíssimo,
  Grave,Médio,Leve}`, `analise_ia_plataforma ∈ {Positivo,Falso positivo,Não
  classificado}`), então cru == normalizado e não há divergência prática.
- **Empate em ordenação de labels** (top_motoristas/placas/uf/frota/mensal_tipo):
  a RPC desempata por nome (asc); o JS mantém ordem de inserção (ordem dos dados).
  Só afeta a ORDEM de itens com contagem igual — valores idênticos.
- **`d.meta.months`**: vem de `base_all` (sem filtro de data) exceto no modo
  `custom` (`p_window_months=true`), igual ao JS (`filtered`).
- **Fuso**: JS (após 3.1c) e RPC usam SP. Para dados pré-2019 (com horário de
  verão) poderia haver 1h de diferença entre o offset fixo do JS e o IANA da RPC,
  mas o hot tier é de 12 meses — irrelevante.

---

## 5. Arquivos

**Criados (novos, não commitados):**
- `supabase/migrations/20260619120000_analytics_indexes.sql`
- `supabase/migrations/20260619120100_analytics_helpers_and_metadata_rpc.sql`
- `supabase/migrations/20260619120200_get_analytics_rpc.sql`
- `server/analytics-rpc.js`
- `docs/analytics-rpc-progress.md` (este arquivo)

**A modificar (pendente):** `server/index.js`, `src/modules/Analytics.jsx`,
`scripts/analytics-parity.mjs` (novo).

**Banco (produção `jvqlxrixzqlbwmmdwcob`):** índices + funções
`analytics_norm`, `analytics_norm_crit`, `analytics_norm_clf`, `analytics_to_uf`,
`analytics_metadata`, `get_analytics` — **todos aplicados e ativos**. Tabela
`driver_events` permanece com 0 linhas (linhas de teste já removidas).
