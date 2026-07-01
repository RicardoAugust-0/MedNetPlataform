# Automação Horizon — ingestão + sincronização de tratamento com `driver_events`

## Contexto

Hoje o operador trata a Horizon manualmente: baixa o relatório do portal e
sobe pelo Analytics (`ImportModal` → `fatigueParser.js`, `platformId:
'horizon'`). O objetivo é eliminar esse passo por completo — não só a
**ingestão** dos relatórios, mas também o **tratamento dos alertas dentro da
própria Horizon**, porque **Horizon é espelho da MaxTrack** (mesma
frota/eventos): quem trata um alerta na MaxTrack não deveria precisar
repetir o tratamento na Horizon — hoje isso é feito à parte.

Isso divide o trabalho em duas frentes independentes, que o usuário pediu
para separar explicitamente:

1. **Ingestão** — já existe um robô pronto (`Bot_HorizonScraping`,
   Playwright + N8N na VPS) que exporta os relatórios de todas as contas e
   hoje manda por e-mail. Só precisa de 3 ajustes: captcha automático,
   frequência horária, destino = MedNet em vez de e-mail. **Reaproveita
   100% da lógica de parsing/upsert que já existe no backend Express.**
2. **Sincronização de tratamento** — quando um evento é tratado na MaxTrack
   (manualmente pelo operador no Monitor, ou automaticamente pelo
   `Bot_Maxtrack` já existente), o mesmo evento precisa ser marcado como
   tratado também na Horizon. Isso é conceitualmente diferente: não é
   upload de planilha, é uma ação (login + navegar até o alerta + marcar
   como tratado) que o robô Playwright precisa aprender a fazer na Horizon,
   disparada por MedNet ou pela própria VPS conforme o caminho de origem.

Decisões já confirmadas com o usuário:
- Captcha: **2Captcha automático**.
- Destino da ingestão: **`driver_events`** (Analytics) — não a fila do Monitor.
- Frequência de ingestão: **de hora em hora**.
- **Rotação de senha:** a Horizon força troca de senha com frequência, e as
  senhas "circulam" entre um pequeno conjunto de 3-4 senhas conhecidas. O
  robô precisa, ao falhar o login, tentar essas senhas alternativas antes de
  declarar a conta com erro de credencial.
- **Sincronização de tratamento:** quando um evento é tratado na MaxTrack
  (qualquer via), o mesmo evento deve ser tratado automaticamente também na
  Horizon — eliminando de vez a necessidade de mexer na Horizon manualmente,
  tanto para ingestão quanto para tratamento.

## Descoberta técnica (verificada no código)

**Ingestão (reaproveitamento quase total):**
- `src/utils/fatigueParser.js:116-129` já tem `PLATFORM_COLUMN_MAPS.horizon`
  (colunas reais do export: "Placa / Empurrador", "Motorista / Comandante",
  "Data/Hora Evento", "Gravidade" etc.), e `applyPlatformMap(headers,
  'horizon', {})` (linha 158) gera o mapping automaticamente.
- `server/analytics-import.js` exporta `uploadMiddleware` (multer, campo
  `files`) e `handleImportEvents(supabase, req, res, clearCache)`, que lê
  o(s) arquivo(s), aplica o mapping, deduplica e faz `upsert` em
  `driver_events` com `onConflict: 'platform_id,placa,ocorrido_em,nome_evento',
  ignoreDuplicates: true` em lotes de 5000 — **idempotente**.
- Confirmado em `fatigueParser.js:611-640`: o filtro por `operatorEmail` só
  se aplica quando `platformId === 'omnilink'` — para Horizon é seguro
  chamar com `operatorEmail` vazio.
- Precedente direto para autenticação máquina-a-máquina:
  `server/ai-chat-routes.js:232-253`, rota `POST /api/ai/internal/generate-pdf`
  (chamada pelo N8N), autentica comparando um header com
  `process.env.INTERNAL_API_KEY`. A rota Horizon segue o mesmo padrão, com
  token próprio.

**Tratamento (achados sobre como o Monitor registra o "tratar" hoje):**
- `src/hooks/useAtendimentos.js:58-77` — `registrar({motorista, placa,
  transportadora, tipo, obs})` insere em `public.atendimentos` (schema em
  `supabase/migrations/full_schema_latest.sql:16-27` — `tipo` restrito a
  `intervencao|reportar|descarte|limpeza`, **não guarda `platform_id`**).
  Essa função é o **choque único** por onde passam todos os tratamentos
  manuais: `attend()`, `reportar()`, `performDiscard()` e `bulkDiscard()` em
  `src/modules/Monitor.jsx` (linhas 393-478) chamam `registrar()`.
- Confirmado em `Monitor.jsx:404`: o objeto do motorista já carrega
  `d._platformId` (usado hoje só para resolver `sistema` no `postToSheets`)
  — dá pra propagar essa informação para `registrar()` sem nova consulta.
- `Bot_Maxtrack` (`supabase/migrations/migration_automations.sql:62-74`) já
  trata alertas graves (NV3) **automaticamente**, disparado por um webhook
  de evento (`trigger: 'evento'`, `event_type: 'Alerta NV3 (sonolência
  grave)'`) — esse caminho **não passa pelo MedNet**: o webhook vai direto
  da origem do alerta para a VPS. MedNet só vê o resultado depois, via
  `automation_logs`.
- `src/hooks/useAutomations.js:301-379` (`run()`) mostra o padrão já usado
  no front para chamar um endpoint de automação: busca `endpoint`/`token` da
  tabela `automations` e faz `fetch(endpoint, { headers: {
  Authorization: 'Bearer ' + token }, body: {...} })` diretamente do
  browser. Isso confirma que **expor o token da automação ao client
  autenticado já é o padrão aceito no projeto** (RLS de `automations` é
  `authenticated_all`) — não é uma vulnerabilidade nova a introduzir, é
  reaproveitar o padrão existente.

Conclusão: a ingestão é reaproveitamento quase direto do motor existente. A
sincronização de tratamento é uma peça nova, mas o ponto de disparo do lado
MedNet é único e já identificado (`registrar()`), e o padrão de chamada a um
endpoint de automação (endpoint+token vindos de `automations`) já existe e
pode ser reaproveitado sem inventar um mecanismo novo de auth no front.

## Escopo: três trilhas

```
 Trilha A (ingestão)                    Trilha B (VPS, fora deste repo)
 ────────────────────                   ────────────────────────────────
 migration horizon_credentials      →    Bot_HorizonScraping ganha 2Captcha,
 (senha atual + candidatas)              cron 1h/1h, credenciais dinâmicas,
 POST /api/horizon/ingest           ◀────  POST multipart pro endpoint A2
 POST /api/horizon/credential-status ◀───  reporta erro/rotação de senha
 GET  /api/horizon/credentials      ────▶  robô lê candidatas p/ tentar login
 UI admin (editar senha/candidatas)

 Trilha C (sincronização de tratamento)
 ────────────────────────────────────
 useAtendimentos.registrar() dispara     Trilha B: novo workflow
 webhook p/ Bot_HorizonTreatment    →    bot_HorizonTreatment (Playwright)
 quando platformId === 'maxtrack'        acha o alerta na Horizon e trata
                                          + bot_Maxtrack (evento automático)
                                          encadeia o mesmo passo internamente
                                          na VPS (não passa pelo MedNet)
```

- **Trilha A — ingestão (este repositório).** Implementação direta:
  migration, rotas Express, UI de credenciais com rotação de senha.
- **Trilha B — robô N8N/Playwright na VPS.** Fora deste repositório (sem
  acesso). Especificado aqui para quem for mexer no N8N depois.
- **Trilha C — sincronização de tratamento (este repositório para a ponta
  MedNet + especificação para a ponta VPS).** Implementação direta na ponta
  MedNet (o disparo do webhook); a ponta VPS que efetivamente realiza o
  tratamento dentro da Horizon é especificada, não implementada aqui.

---

## Trilha A — Ingestão

### A1. Migration: `supabase/migrations/<timestamp>_horizon_credentials.sql`

RLS admin-only, seguindo o padrão já usado em outras migrations do projeto
(`20260626122000_dynamic_platform_rules.sql`,
`20260626123000_ai_chat_persistence.sql`):

```sql
create table public.horizon_credentials (
  id                  uuid primary key default gen_random_uuid(),
  label               text not null,          -- ex: "Conta 01"
  email               text not null unique,
  password            text not null,          -- senha atual conhecida como válida
  password_candidates jsonb not null default '[]'::jsonb, -- ["Senha@2024","Senha@2025", ...]
  status              text not null default 'ok' check (status in ('ok','credential_error','session_expired')),
  last_login_at       timestamptz,
  last_error          text,
  updated_at          timestamptz not null default now()
);
alter table public.horizon_credentials enable row level security;

create policy "admin_read_horizon_credentials" on public.horizon_credentials
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admin_update_horizon_credentials" on public.horizon_credentials
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
```

Sem policy de `insert`/`delete` para `authenticated` — lista de contas é
fixa; alterações de linha só via SQL/service_role. A rota Express usa o
client `supabase` de `server/index.js` (`SUPABASE_SERVICE_ROLE_KEY`, ignora
RLS), então o robô não precisa de policy própria.

`password_candidates` assumido **por conta** (cada uma das 17 contas mantém
sua própria lista de 3-4 senhas-padrão que costumam circular), editável pela
UI de admin (A4). Se na prática as mesmas 3-4 senhas valem para todas as
contas, isso ainda funciona (só duplicar a mesma lista em todas as linhas) —
o esquema por conta é o mais flexível e não exige decidir isso agora.

Popular as 17 contas via `insert` na própria migration (ver pendência #1
sobre o número exato e os e-mails antes de escrever os `insert`s).

### A2. Nova rota: `server/horizon-routes.js`

Registrar em `server/index.js` como `registerHorizonRoutes(app, supabase)`
(mesmo padrão de `registerAnalyticsRoutes`/`registerWhatsappRoutes`, linhas
42-44 hoje).

**`POST /api/horizon/ingest`** — auth `Authorization: Bearer
<HORIZON_BOT_TOKEN>` comparado com `process.env.HORIZON_BOT_TOKEN` (mesmo
espírito do check em `ai-chat-routes.js:233-239`, só que com header
`Authorization: Bearer` em vez de `x-internal-key`, para reaproveitar o
parsing já usado em `requireRole`).
- Body multipart via `uploadMiddleware` (campo `files`).
- Lê headers do primeiro arquivo (`readHeaders`/`parseCSV`/`XLSX.read`, já
  exportados de `fatigueParser.js`), gera `mapping =
  applyPlatformMap(headers, 'horizon', {})`, seta `req.body.platformId =
  'horizon'`, `req.body.mapping = JSON.stringify(mapping)`,
  `req.body.operatorEmail = ''`, chama `handleImportEvents(supabase, req,
  res, clearCache)` (mesmo `clearCache` usado em `analytics-routes.js` —
  reutilizar a mesma referência de cache, não duplicar).
- Em caso de sucesso, `insert` em `automation_logs` no formato que
  `useAutomations.js`/`HooksTab.jsx` esperam (confirmado em
  `useAutomations.js:350-356`): `{ automation_id:
  'c1b94e82-e3e7-4c74-bfd4-3a56df93df24'` (id existente de
  `Bot_HorizonScraping`) `, status: 'success', duration: '<Xs>', detail:
  '<uniqueSavedCount> eventos importados', logs: [{t, lvl, m}, ...] }`.

**`POST /api/horizon/credential-status`** — mesma auth. Body `{ email,
status, error?, workingPassword? }`:
- Se `workingPassword` vier preenchido (robô descobriu que a senha mudou e
  uma das candidatas funcionou), `update` em `horizon_credentials` seta
  `password = workingPassword`, `status = 'ok'`, `last_login_at = now()`,
  `last_error = null`. Isso "promove" a senha que funcionou para ser a
  tentativa primária no próximo ciclo.
- Se `status = 'credential_error'` (nenhuma candidata funcionou), `update`
  seta `status`, `last_error = error`. Fica visível na UI (A4) para
  intervenção manual.
- Se `status = 'ok'` sem `workingPassword`, só atualiza `last_login_at`.

**`GET /api/horizon/credentials`** — mesma auth. Retorna `[{ email,
password, password_candidates, label }]` só das contas com `status !=
'credential_error'` — é o que a Trilha B usa para saber quais senhas tentar
em qual ordem (atual primeiro, depois candidatas) sem acesso direto ao
Supabase.

### A3. Env vars

Adicionar `HORIZON_BOT_TOKEN=<segredo forte>` em `.env.example` (raiz do
repo) — **não** `server/.env`, que não existe; `server/index.js:10-11`
carrega `dotenv.config({ path: '../.env' })` e depois `dotenv.config()`.

### A4. UI — status e rotação de senha (admin)

Novo componente `src/modules/admin/IntegracoesHorizon.jsx`, mesmo padrão de
`IntegracoesCredenciais.jsx` (fetch direto via `supabase` client +
`useToast`): lista as contas de `horizon_credentials` com `status` (pill
ok/erro/expirada), `last_login_at`, `last_error`; permite editar `password`
e a lista `password_candidates` (adicionar/remover strings) quando
necessário — inclusive quando `status = credential_error`, editar reseta
`status` para `ok`.

Registrar como nova sub-rota, replicando o padrão existente:
- `src/modules/admin/IntegracoesLayout.jsx:7-10` — adicionar `{ to:
  'horizon', label: 'Horizon (contas)', icon: 'ti-cloud-download' }` ao
  array `SUB_TABS`.
- `src/App.jsx:187-191` — `lazy(() => import(".../IntegracoesHorizon.jsx"))`
  + `<Route path="horizon" element={<AdminHorizon />} />` dentro do bloco
  `integracoes`.

### A5. Ajuste da automação existente (via UI, sem migration)

Editar `Bot_HorizonScraping` pela tela de Automações: descrição nova
("Extrai relatórios Horizon de hora em hora e atualiza `driver_events`
automaticamente") e `schedule` = "a cada 1 hora". Cosmético (o agendamento
real é no N8N), mas mantém a UI consistente.

---

## Trilha C — Sincronização de tratamento (MaxTrack → Horizon)

### C1. Nova automação: `Bot_HorizonTreatment`

Novo `insert` na migration de A1 (ou uma migration separada), na tabela
`automations` (mesmo shape de `Bot_Maxtrack`/`Bot_HorizonScraping` em
`migration_automations.sql`): `name: 'Bot_HorizonTreatment'`, `endpoint:
'https://botsplaywright.duckdns.org/automacoes/bot_HorizonTreatment'`,
`trigger: 'evento'`, `event_type: 'Atendimento registrado (MaxTrack)'`,
`token: <segredo>` (token próprio dessa automação, já que o padrão do
projeto guarda token por automação na própria tabela — ver `token` column).
Isso a torna visível/editável na aba Automações como as outras.

### C2. Disparo do lado MedNet: `src/hooks/useAtendimentos.js`

`registrar()` (linha 58) passa a aceitar `platformId` no objeto de entrada.
Depois do `insert` em `atendimentos` ter sucesso, se `platformId ===
'maxtrack'` e `tipo !== 'limpeza'`, disparar uma chamada **best-effort,
fire-and-forget** (não bloqueia nem falha o registro do atendimento se a VPS
estiver fora do ar):

```js
if (platformId === 'maxtrack' && tipo !== 'limpeza') {
  supabase.from('automations').select('endpoint, token').eq('name', 'Bot_HorizonTreatment').maybeSingle()
    .then(({ data: auto }) => {
      if (!auto?.endpoint) return;
      fetch(auto.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(auto.token ? { Authorization: `Bearer ${auto.token}` } : {}) },
        body: JSON.stringify({ motorista, placa, transportadora, tipo, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      }).catch(() => {}); // best-effort — falha aqui não deve incomodar o operador
    });
}
```

Isso segue exatamente o padrão já usado em `useAutomations.js:301-331`
(`run()`): busca `endpoint`/`token` de `automations` e faz `fetch` direto do
client — não introduz mecanismo de auth novo no front.

`src/modules/Monitor.jsx` — os 4 call sites de `registrar()` (`attend()`
linha 396, `reportar()` linha 423, `performDiscard()` linha 437,
`bulkDiscard()` linha 466) passam a incluir `platformId: d._platformId`
(já disponível no objeto do motorista, confirmado linha 404).

Não é necessário MedNet escrever em `automation_logs` para esse caminho — a
VPS/N8N grava seu próprio log ao concluir (mesmo comportamento hoje visto em
`Bot_Maxtrack`), mantendo o padrão de quem executa o passo é quem registra o
resultado.

### C3. Trilha B — o que o robô `bot_HorizonTreatment` precisa fazer (especificação)

1. Receber `{ motorista, placa, transportadora, tipo, timestamp }`.
2. Localizar em qual das 17 contas Horizon está a placa/frota em questão
   (mesma lógica de varredura que `Bot_HorizonScraping` já usa para
   percorrer as contas — **pendência**: confirmar se existe hoje um
   mapeamento placa→conta ou se a busca precisa varrer todas as contas).
3. Logar na conta certa (usando a mesma lógica de credenciais dinâmicas +
   rotação de senha da Trilha B/A — reaproveitar), localizar o alerta
   correspondente (por placa + motorista + janela de tempo próxima do
   `timestamp`) e marcar como tratado na interface da Horizon.
4. Gravar `automation_logs` para `Bot_HorizonTreatment` (sucesso/falha).

### C4. Trilha B — caminho automático (`Bot_Maxtrack` via webhook de evento)

Esse caminho **não passa pelo MedNet** (webhook externo → VPS diretamente),
então a sincronização não pode ser interceptada pelo backend deste repo. A
correção fica inteiramente na Trilha B: encadear, dentro do mesmo workflow
N8N do `bot_Maxtrack`, um passo final que chama a mesma lógica de
`bot_HorizonTreatment` reaproveitando a placa/motorista/timestamp já
disponíveis no contexto da execução — sem precisar de uma nova requisição
HTTP externa, é uma composição interna do workflow N8N.

---

## Contrato entre as trilhas (referência rápida pro N8N)

| Endpoint | Auth | Body | Resposta |
|---|---|---|---|
| `POST /api/horizon/ingest` | `Bearer HORIZON_BOT_TOKEN` | multipart `files[]` (1+ .xlsx/.csv exportados da Horizon) | `{ success, stats, uniqueSavedCount }` |
| `POST /api/horizon/credential-status` | `Bearer HORIZON_BOT_TOKEN` | `{ email, status, error?, workingPassword? }` | `{ success }` |
| `GET /api/horizon/credentials` | `Bearer HORIZON_BOT_TOKEN` | — | `[{ email, password, password_candidates, label }]` (exclui contas com `status = 'credential_error'`) |
| `POST bot_HorizonTreatment` (endpoint da automação, na VPS) | `Bearer <token da automação>` | `{ motorista, placa, transportadora, tipo, timestamp }` | (definido pela Trilha B) |

---

## Pendências a confirmar antes de codar

1. **17 ou 18 contas?** A descrição já cadastrada do `Bot_HorizonScraping`
   (`migration_automations.sql:79`) diz "17 contas"; memória de sessão
   anterior falava em 18. Confirmar número exato + lista de e-mails/labels
   antes de escrever os `insert`s de A1.
2. **Formato real do export do robô Playwright** — comparar com
   `PLATFORM_COLUMN_MAPS.horizon` antes de assumir 100% de compatibilidade
   (se não bater, ajuste pontual, não mudança de arquitetura).
3. **2Captcha** — provisionamento da chave fica na Trilha B, fora do
   alcance direto deste repositório.
4. **Mapeamento placa→conta Horizon (C3)** — confirmar se já existe alguma
   forma de saber em qual das 17 contas está uma placa específica, ou se o
   robô de tratamento precisa varrer todas as contas a cada chamada (mais
   lento, mas funcional).
5. **Senhas candidatas por conta ou globais?** Este plano assume lista **por
   conta** (mais flexível, funciona nos dois casos). Se na prática for uma
   lista única compartilhada por todas as 17 contas, ajustar é trivial
   (uma migration a mais só populando a mesma lista em todas as linhas) —
   não é bloqueante para começar a implementação.

---

## Verificação

- **A2/A3 isoladas:** `curl -F "files=@export_horizon.xlsx" -H
  "Authorization: Bearer $HORIZON_BOT_TOKEN"
  http://localhost:3000/api/horizon/ingest` com export real; conferir
  linhas em `driver_events` com `platform_id = 'horizon'`. Reenviar o mesmo
  arquivo e confirmar que não duplica (idempotência do `onConflict`).
- **Rotação de senha:** simular falha de login chamando
  `POST /api/horizon/credential-status` com `status: 'credential_error'`,
  confirmar que aparece na UI (`IntegracoesHorizon.jsx`); depois chamar com
  `workingPassword` preenchido e confirmar que `password` é atualizado e
  `status` volta a `ok`.
- **Analytics:** abrir `/admin/analytics`, escolher fonte Horizon, conferir
  números batendo e que `clearCache` reflete o dado novo.
- **Automações:** confirmar que a ingestão gera linha real em
  `automation_logs` visível em `HooksTab.jsx`, substituindo o log de exemplo
  semeado na migration.
- **Sincronização de tratamento (C2):** no Monitor, com `platformId =
  'maxtrack'` selecionado, tratar/descartar/reportar um alerta e confirmar
  (via DevTools/network) que a chamada para o endpoint de
  `Bot_HorizonTreatment` é disparada com o payload correto — e que uma falha
  nessa chamada (endpoint indisponível) **não** impede o atendimento de ser
  salvo em `atendimentos`.
- **UI de credenciais:** abrir `/admin/integracoes/horizon`, editar senha e
  candidatas de uma conta com `status = credential_error`, confirmar volta
  para `ok`.
- **Lint/testes:** `npm run lint` e `npm test` (cobre
  `fatigueParser.test.js`) — sobretudo se o formato real do export exigir
  ajuste em `PLATFORM_COLUMN_MAPS.horizon`.
- **Trilha B** (N8N/captcha/schedule/tratamento na Horizon): fora do alcance
  direto desta sessão — precisa ser conferida na VPS/N8N por quem tiver
  acesso.
