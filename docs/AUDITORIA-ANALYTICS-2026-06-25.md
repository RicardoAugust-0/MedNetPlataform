# Auditoria do fluxo Analytics / RPC Fadiga — Correções aplicadas

**Data:** 2026-06-25
**Escopo:** módulo Analytics (`src/modules/Analytics.jsx` + `analytics/*`) e seu
backend Express (`server/analytics-routes.js`, `server/analytics-rpc.js`,
`server/index.js`).
**Objetivo desta sessão:** resolver os achados acionáveis com baixo risco de
regressão (os dois 🔴 + 🟡 contidos) e registrar o que ficou pendente.

> Validação: `npm run build` ✅ · `npm test` ✅ (91/91). Os erros de `npm run lint`
> são **pré-existentes** e em outros arquivos (React Compiler / unused-vars em
> `monitor/utils.jsx`, parsers, `fatigueParser.js`) — não introduzidos aqui.

---

## 1. O QUE FOI FEITO

### 🔴 1.1. API de analytics agora exige autenticação + role admin
**Problema:** o servidor Express subia com `app.use(cors())` aberto, cliente
Supabase com `SERVICE_ROLE_KEY` (ignora RLS) e **zero auth**. Qualquer um que
alcançasse o host lia todos os KPIs e baixava o CSV com **PII** (motorista,
placa, localidade). O `AdminGuard` do front protegia só a UI, não a API.

**Correção:**
- Novo middleware `requireRole(supabase, minRole)` em
  `server/analytics-routes.js`: lê `Authorization: Bearer <jwt>`, valida via
  `supabase.auth.getUser(token)`, busca `profiles.role` e compara com a
  hierarquia `{operador:0, lider:1, admin:2}` (espelha `src/data.js`).
- Aplicado `requireAdmin` às 5 rotas: `/api/platforms`, `/api/compare-options`,
  `/api/analytics`, `/api/analytics/csv`, `/api/clear-cache`.
- CORS configurável por env `CORS_ORIGIN` (lista separada por vírgula) em
  `server/index.js`. Sem a env, mantém permissivo (compat) — a proteção real é
  o middleware; o CORS é defesa-em-profundidade.

**Companion no front (obrigatório, senão o app quebraria):**
- Novo módulo `src/lib/analyticsApi.js` com `getAuthHeaders()` (token da sessão
  Supabase) e `apiFetch(path, options)` que injeta o header.
- Todas as chamadas do front passaram a usar `apiFetch`: contagem de
  plataformas, analytics, drill-down, clear-cache, compare-options.
- **CSV:** `exportToCSV` deixou de usar `window.location.href` (que não carrega
  header) e passou a `apiFetch` + download via `Blob`.

### 🔴 1.2. Race condition no carregamento (respostas fora de ordem)
**Problema:** `loadFromDatabase` era async sem cancelamento; trocas rápidas de
filtro disparavam requests sobrepostos e o último a **resolver** vencia — não o
último **emitido** — podendo renderizar dado obsoleto.

**Correção (`Analytics.jsx`):** `AbortController` por chamada (aborta a anterior)
+ guarda de sequência (`loadSeqRef`). Resultados de requisições obsoletas são
descartados (`isStale()`), `AbortError` é silenciado e o `finally` só desliga o
spinner se a requisição ainda for a atual.

### 🟡 1.3. Builder de URL unificado (fim da divergência)
**Problema:** três cópias do construtor de query (`loadFromDatabase`, o drill e o
CSV) já divergiam — o loader usava `sources=<JSON>` e o drill `company_<pid>=`.

**Correção:** `buildAnalyticsQuery()` em `src/lib/analyticsApi.js` é a fonte única
da verdade, usada pelos três pontos. O drill agora monta `sources` a partir de
`comparePlatformIds`/`compareCompanies`, alinhado ao loader.

### 🟡 1.4. Duplo fetch no mount + `lastLoadedRef` incompleto
**Problema:** dois effects carregavam no mount (o de deps vazias e o reativo); o
`lastLoadedRef` inicial não tinha `compareMode/companyComparePlatform/
companyCompareList`, forçando `platformChanged=true` na 1ª passada.

**Correção (`Analytics.jsx`):** `activeId` passou a ser restaurado do
`localStorage` no `useState` inicial; o effect de mount dedicado foi removido (o
effect reativo faz a carga inicial). O `lastLoadedRef` inicial ganhou as chaves
que faltavam.

### 🟡 1.5. Contagem de fallback descartava `severidade NULL`
**Problema:** os fallbacks de contagem (client em `Analytics.jsx` e server em
`analytics-routes.js`) usavam `.neq('severidade','Leve')`, que em SQL **descarta
NULL**, divergindo do caminho quente (`is distinct from 'Leve'`).

**Correção:** ambos passaram a `.or('severidade.is.null,severidade.neq.Leve')`,
preservando os NULLs — mesma semântica do rollup/`excludeLeve`.

### 🟡 1.6. Modal de comparação não dava feedback em erro de rede
**Correção (`Analytics.jsx`):** `handleCompareClick` agora emite `toast(...,
'warning')` quando `/api/compare-options` falha (antes só `console.warn`).

---

## 2. O QUE ESTÁ FALTANDO (pendente, por criticidade)

| Criticidade | Pendência | Observação |
|---|---|---|
| 🔴 **Operacional** | **Redeploy do servidor** com o novo código de auth e (recomendado) setar `CORS_ORIGIN` com a origem do front no ambiente (Coolify). | Sem o redeploy, a API continua aberta. Após o deploy, o front já envia o token automaticamente — nenhuma env nova é necessária só para a auth funcionar. |
| 🔴 **Fora de escopo** | Rotas `/api/whatsapp/*` (`server/whatsapp-routes.js`) seguem **sem auth** e com `service_role`. São consumidas por `Templates` (visível ao operador), então não dá para travar em admin — precisam de um gate `min='operador'`/`'lider'` próprio. | Mesma classe de risco do item 1.1, em outro módulo. Tratar numa tarefa dedicada. |
| 🟡 **UX** | Takeover de tela inteira ao trocar de fonte/excluir (`Analytics.jsx`, `if (loading) return <spinner>`). Some o header/filtros. | Manter header montado e esmaecer só a área de gráficos; full-screen só na carga inicial. Não feito por ser mudança de render mais ampla. |
| 🟢 **Consistência** | `window.confirm` em `removeSource` em vez do `hooks/useConfirm.jsx` do projeto. | Cosmético; troca direta quando houver janela. |
| 🟢 **Consistência** | Rótulo de plataforma duplicado em 3 lugares (`analytics-routes.js`, `analytics-rpc.js`, front via `PLATFORMS`). | Centralizar num único `platformLabel` derivado de `PLATFORMS`. |
| 🟢 **Perf** | `resultCache.clear()` global no clear-cache por-plataforma (`analytics-routes.js`). | Invalidar seletivamente por prefixo de `platformId`. Seguro como está. |
| 🟡 **Limitação** | Drill-down no modo comparação **por empresas** ainda não é suportado (usa `comparePlatformIds`, vazio nesse modo). | Pré-existente; o builder unificado deixou o caminho pronto, falta passar as fontes do modo "empresas" ao drill. |

> Obs.: o achado anterior de "import com `ignoreDuplicates` subnotifica" já estava
> mitigado no código atual — `onImportConfirm` deduplica em memória (por
> `platform_id|placa|ocorrido_em|nome_evento`) antes do upsert.

---

## 3. ARQUIVOS TOCADOS

**Criados:**
- `src/lib/analyticsApi.js` — `API_URL`, `getAuthHeaders`, `apiFetch`,
  `buildAnalyticsQuery`.
- `docs/AUDITORIA-ANALYTICS-2026-06-25.md` (este arquivo).

**Modificados:**
- `server/index.js` — CORS configurável (`CORS_ORIGIN`).
- `server/analytics-routes.js` — `requireRole` + `requireAdmin` nas 5 rotas;
  contagem de fallback com NULL preservado.
- `src/modules/Analytics.jsx` — auth via `apiFetch`; `AbortController`/race
  guard; builder unificado; `activeId` do localStorage + remoção do mount
  duplicado; `lastLoadedRef` completo; CSV via blob; fallback NULL; toast no
  erro de compare-options.
- `src/modules/analytics/components/FadigaKPIsDrill.jsx` — `apiFetch` + builder
  unificado (`sources` em vez de `company_<pid>`).
