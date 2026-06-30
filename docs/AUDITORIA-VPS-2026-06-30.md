# Status da VPS e Pendências — 2026-06-30

Documento de handoff cobrindo as sessões de **2026-06-26** a **2026-06-30**. Registra o que foi concluído, o problema crítico de JWT no Storage e todas as pendências abertas, por prioridade.

---

## 1. O que foi feito (sessões 26–30/06)

### 2026-06-26 — Monitor, Analytics, custom_rules, MedBot, migrations

| # | Contexto | Fix |
|---|---|---|
| 1 | **Monitor** — eventos sumindo nas abas Intervenção/Reportar/Só técnico | `fatigueParser.js` ganhou `getBucket()`: preenche `categoria_bucket` por lookup na taxonomy + fallback por regex. Campo obrigatório para `aggregate.js`. |
| 2 | **Analytics** — plataforma Sascar aparecia como "Automático" | `PLATFORM_HEADER_SIGS` ganhou assinatura da coluna "hora do evento" (exclusiva do CSV Sascar); fallback de nome no state. |
| 3 | **Regra Dinon/fumo** — era hardcode em `sascar/index.js` | Movida para banco (`custom_rules`): `applyCustomRules()` em `src/platforms/shared/customRules.js`; `useOpenAlerts.js` carrega e aplica após o aggregate. Migration criada. |
| 4 | **MedBot** — geração de gráficos no chat | Prompt reescrito (obriga chamar `query_database_records` antes de emitir JSON do gráfico); `extractChartAndCleanText` case-insensitive; limite de rows aumentado 100 → 500; guard no `GlobalAiChat`. |
| 5 | **Migrations VPS** | Aplicadas via Studio: `platform_rules`, `custom_rules`, `ai_chat_messages`, `ai_generated_reports`, `ai_chat_threads`, coluna `thread_id`, Realtime para `driver_events`. |

### 2026-06-29 — Migrations finais, RPC de agregação MedBot

| # | Contexto | Fix |
|---|---|---|
| 1 | **`atendimentos_bucket_column`** | Aplicada via MCP Supabase: coluna `bucket` em `atendimentos`, função `norm_clf`, RPC `get_open_alerts` recriada. |
| 2 | **`retire_drivers_queue`** | `drivers_queue` dropada no VPS. |
| 3 | **MedBot aggregation RPC** | RPC `aggregate_driver_events(p_platform_id, p_since_hours, p_limit, p_category)` criada no banco. Tool registrada em `tool-schemas.js` (Anthropic + Gemini) e `tool-handlers.js`. Prompt atualizado: rankings usam esta tool (não `query_database_records`). |
| 4 | **Regra Dinon/fumo** verificada | `useOpenAlerts.js` carrega `custom_rules` do banco corretamente; regra ativa no VPS. |

---

## 2. ✅ RESOLVIDO — JWT_SECRET do Storage (links PDF)

### Sintoma

Links gerados pelo MedBot via `generate_pdf_report` retornam:

```
HTTP 400 {"error":"InvalidJWT","message":"signature verification failed"}
```

O código da função está correto (JWT bem-formado, `iat=now`, `exp=+7d`, bucket `ai-reports`). O erro é da **infraestrutura do VPS**, não do app.

### Causa raiz

O container do **Supabase Storage** no VPS tem um `JWT_SECRET` diferente do usado pelo restante da stack (GoTrue/Auth, PostgREST, Kong). Isso ocorre por drift durante a migração — o Storage ficou com um valor padrão/antigo enquanto os demais containers foram configurados com o secret do projeto.

### Diagnóstico rápido

Ambos os containers (Auth e Storage) têm `${SERVICE_PASSWORD_JWT}` como valor na UI do Coolify — isso é uma **variável de template**, não o valor resolvido. O diagnóstico precisa checar o valor **real em runtime**:

```bash
# Passo 1: comparar os valores reais (SSH na VPS)
docker exec supabase-auth-lo4522vm3cwytmy8bk5s5mbu env | grep JWT_SECRET
docker exec supabase-storage-lo4522vm3cwytmy8bk5s5mbu env | grep JWT_SECRET
```

**Se os dois são iguais → pular para "Cenário A".**
**Se são diferentes → pular para "Cenário B".**

### Cenário A — JWT_SECRET igual nos dois containers

O secret dos containers está OK. O problema é que o `ANON_KEY`/`SERVICE_ROLE_KEY` que o app usa (Vercel + Coolify backend) foram gerados com um secret **diferente** do atual `SERVICE_PASSWORD_JWT`. Para confirmar: decodifique seu `SUPABASE_SERVICE_ROLE_KEY` (é JWT — cole a parte do meio em jwt.io) e verifique a assinatura contra `SERVICE_PASSWORD_JWT`.

**Fix Opção 1 (mais segura — não quebra login):** restaurar o secret original (com o qual os keys foram gerados) no `SERVICE_PASSWORD_JWT` → Coolify → reiniciar todos containers Supabase.

**Fix Opção 2:** gerar novos `ANON_KEY` e `SERVICE_ROLE_KEY` a partir do `SERVICE_PASSWORD_JWT` atual e atualizar em Vercel + Coolify backend:

```bash
node -e "
const { SignJWT } = require('jose');
const secret = new TextEncoder().encode('SEU_JWT_SECRET_ATUAL');
Promise.all([
  new SignJWT({ role: 'anon', iss: 'supabase', iat: Math.floor(Date.now()/1000) })
    .setProtectedHeader({ alg: 'HS256' }).sign(secret),
  new SignJWT({ role: 'service_role', iss: 'supabase', iat: Math.floor(Date.now()/1000) })
    .setProtectedHeader({ alg: 'HS256' }).sign(secret),
]).then(([anon, svc]) => {
  console.log('ANON_KEY:', anon);
  console.log('SERVICE_ROLE_KEY:', svc);
});
"
```

### Cenário B — JWT_SECRET diferente entre Auth e Storage

Um dos containers foi recriado pelo Coolify com secret rotacionado sem recriar o outro.

1. O **Auth** é a fonte de verdade (login funciona → seu JWT_SECRET está correto).
2. Coolify UI → serviço Supabase → variáveis globais → encontre `SERVICE_PASSWORD_JWT`.
3. Force o mesmo valor no Storage container individualmente.
4. Reiniciar só o Storage:

```bash
docker restart supabase-storage-lo4522vm3cwytmy8bk5s5mbu
```

### Validação

```bash
# Gerar signed URL no Studio VPS → deve retornar 200 com o arquivo
# OU via curl com uma URL gerada pelo MedBot:
curl -I "<URL_GERADA>"
# Esperado: HTTP 200 com Content-Type: application/pdf
```

---

## 3. Pendências abertas por prioridade

### 🔴 Alta — Segurança / Infra

| # | Pendência | Onde | Ação |
|---|---|---|---|
| A | **Provisionar `TRIGGER_SECRET`** | Vault + Edge Function | Ver `AUDITORIA-2026-05-29.md` §AÇÃO MANUAL |
| B | **Rotas WhatsApp sem auth** (`/api/whatsapp/*`) | `server/whatsapp-routes.js` | Aplicar `requireRole(supabase, 'operador')` igual ao Analytics |
| C | **GOOGLE_SERVICE_ACCOUNT** não setado | Coolify → env edge functions | Setar chave nova do Google → Restart → validar `read-sheet`/`append-sheet` |

> **A e C são pré-requisitos para funcionalidades já no ar** (Planilha Embedded). Storage JWT ✅ resolvido em 2026-06-30.

### 🟡 Média — Configuração VPS

| # | Pendência | Onde | Ação |
|---|---|---|---|
| E | **SMTP no GoTrue** | Coolify → Auth config | Configurar para e-mails de convite funcionarem (`invite-user` edge fn) |
| F | **Desconectar integração Supabase↔Vercel** | Vercel Dashboard | As vars "May 15" ainda apontam para o Cloud; risco de reversão automática |
| G | **Pausar o projeto Cloud** | Supabase Cloud (`jvqlxrixzqlbwmmdwcob`) | Evitar billing duplo após migração confirmada estável |
| H | **Rotacionar `service_role` key** | Coolify + `.env` local | Key foi exposta em texto plano; gerar nova no Studio VPS |
| I | **`pg_net` ativo** | Studio VPS → Extensions | Verificar se o espelhamento automático (triggers de webhook) funciona |

### 🟢 Baixa — Qualidade e Features

| # | Pendência | Contexto |
|---|---|---|
| J | **Testar gráficos MedBot** | Pedir: "gráfico dos motoristas mais reincidentes da Sascar hoje". Deve emitir bloco ` ```json ` + renderizar via Recharts |
| K | **Reimportar `driver_events`** (~429k linhas) | Fazer via app (Analytics → import) com a VPS no ar |
| L | **Delete na Planilha Embedded não propaga para o Sheets** | Conhecido; `append-sheet` não tem operação de delete |
| M | **57 problemas de lint React** | Ver `AUDITORIA-2026-05-29.md` §Refatoração React |
| N | **MedBot: top N/ranking ainda sem validação** | RPC `aggregate_driver_events` criada mas não testada em produção |

---

## 4. Estado atual de infra (VPS)

| Componente | URL | Status |
|---|---|---|
| Kong/API | `https://www.mednetsupabase.duckdns.org` | ✅ HTTPS Let's Encrypt |
| Backend Express | `https://www.mednetanalytics.duckdns.org` | ✅ |
| Studio | `https://www.mednetsupabasestudio.duckdns.org` | ✅ |
| Frontend (Vercel) | produção | ✅ apontando para VPS |
| Edge Functions (5) | `append-sheet`, `read-sheet`, `invite-user`, `generate-report`, `generate-dossier-report` | ✅ OPTIONS 200 / POST 401 (autenticação funcionando) |
| Realtime | `driver_events` publicado | ✅ |
| Storage (bucket `ai-reports`) | signed URLs | ✅ funcionando (confirmado 2026-06-30) |

### Tabelas migradas (todas)

`auth.users` (18) + `identities`, `profiles`, `profile_credentials`, `whatsapp_*`, `atendimentos`, `app_settings`, `ai_credentials`, `drivers_queue` (dropada), `automations`, `automation_logs`, `platform_rules`, `custom_rules`, `ai_chat_messages`, `ai_generated_reports`, `ai_chat_threads`, `driver_events`, `analytics_daily`, `driver_health`, `intervencoes_sheet`, `ws_pages`, `notes`, `templates`, `links`, `reminders`.

---

## 5. Como confirmar o estado atual do VPS

```bash
# Supabase Storage — signed URL OK?
# Studio → Storage → ai-reports → qualquer arquivo → "Get URL" → abrir no browser

# Edge functions respondendo?
curl -X OPTIONS https://www.mednetsupabase.duckdns.org/functions/v1/read-sheet
# Esperado: 200

# Realtime OK?
# Abrir o app → Monitor → carregar planilha → ver se aparece na fila em tempo real

# pg_net OK?
# Studio → SQL Editor:
# SELECT * FROM pg_extension WHERE extname = 'pg_net';
```
