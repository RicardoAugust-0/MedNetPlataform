# Migração Cloud → VPS — O que falta (retomar 2026-06-26)

> Estado em 2026-06-25 (fim do dia). O app **já está funcionando na VPS** (login OK,
> frontend no Vercel apontando pra VPS, backend no Coolify apontando pra VPS).
> Faltam tabelas menores, edge functions e limpezas. Nada urgente quebrado.

## Endereços da VPS (já com HTTPS válido)
- **Supabase/Kong (API):** `https://www.mednetsupabase.duckdns.org`
- **Backend (MedNet_Analytics):** `https://www.mednetanalytics.duckdns.org`
- **Studio:** `https://www.mednetsupabasestudio.duckdns.org`
- Chaves da VPS estão nos scripts `migrate_*.mjs` / `.env` (anon + service_role).

---

## ✅ JÁ FEITO
- **Dados migrados e conferidos:** auth.users (18) + auth.identities (18), profiles (13),
  profile_credentials (1), whatsapp_* (todas), atendimentos (510) + FK `operador_id`,
  app_settings/ai_credentials + FK `updated_by`, drivers_queue (38).
- **HTTPS válido** no Kong e no backend (Let's Encrypt via Coolify/DuckDNS).
- **Backend (Coolify → MedNet_Analytics):** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` → VPS. Redeployado, healthy.
- **Frontend (Vercel):** `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` → VPS. Login funcionando.
- **`.env` local** atualizado pra VPS (chaves do Cloud comentadas p/ rollback rápido).
- **`.gitignore`** protege os scripts de migração (contêm service_role).

---

## ⬜ FALTA FAZER (amanhã)

### 1. Migrar tabelas que ficaram pra trás  ← COMEÇAR POR AQUI (rápido)
Script já pronto e idempotente (com paginação, não corta em 1000):
```
node migrate_rest2.mjs
```
Migra: `templates` (12), `links` (16), `reminders` (1), `ws_pages` (8),
`intervencoes_sheet` (2516), `automations` (2), `automation_logs` (70).
- ⚠️ Se `automations`/`automation_logs` derem erro **"table not found"**, é porque o schema
  delas não está na VPS → criar as tabelas na VPS primeiro (pegar o `CREATE TABLE` das
  migrações em `supabase/migrations/`) e rodar o script de novo.

### 2. Reimportar `driver_events`  (você, pelo app)
Só tem 1.000 das 429k linhas na VPS. Reimporte as planilhas pela tela de Analytics.
A tabela `analytics_daily` (rollup) se reconstrói sozinha a partir disso.

### 3. Edge Functions na VPS  ← MAIOR PEDAÇO RESTANTE
As 6 funções **não foram deployadas** na VPS. Enquanto isso, esses recursos quebram:
convidar usuário, gerar relatório/dossiê, integrações de planilha e SASCAR.
- Funções: `invite-user`, `generate-report`, `generate-dossier-report`,
  `read-sheet`, `append-sheet`, `pull-sascar` (em `supabase/functions/`).
- Rodam no runtime de Edge Functions (Deno) do Supabase **self-hosted** — descobrir como o
  template do Coolify serve functions (volume montado vs `supabase functions deploy`).
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` são injetadas
  automaticamente. Os **segredos externos** precisam ser configurados na VPS:
  credenciais Google (read-sheet/append-sheet), credenciais SASCAR (pull-sascar),
  e o **`TRIGGER_SECRET`** do `append-sheet` (estava pendente desde antes — ver memória).

### 4. Verificar Realtime (websockets)
O app usa realtime (`wss://.../realtime/v1/websocket`). Confirmar no console do navegador
que conecta na VPS sem erro. Se falhar, ajustar Kong/Realtime no Coolify.

### 5. Limpar a integração Supabase no Vercel
As vars "Added May 15" (`POSTGRES_*`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`) apontam pro
**Cloud antigo** e são da integração Supabase↔Vercel. O frontend não as usa (só `VITE_*`),
mas a integração pode **reverter** suas `VITE_*` pro Cloud sozinha.
→ Desconectar a integração Supabase (Vercel → Settings → Integrations) e/ou remover essas vars.
→ Confirmar que `VITE_SUPABASE_URL` continua na VPS depois.

### 6. (Opcional/segurança) CORS do backend
Definir `CORS_ORIGIN` no MedNet_Analytics (Coolify) = domínio do app no Vercel.

### 7. Limpezas finais
- Dropar na VPS: `temp_auth_users` (resto da migração) e as tabelas mortas
  `rpa_credentials`, `maxtrack_sessions`, `maxtrack_cache`.
- Dropar no Cloud a função temporária `get_cloud_users`.
- **Rotacionar as chaves service_role** (Cloud e VPS) — elas foram expostas em scripts/chat
  durante a migração.
- Depois de uns dias estável: **pausar/desativar o projeto do Cloud**.

---

## Verificação rápida do estado (rodar quando quiser)
```
node _audit.mjs        # compara contagem de TODAS as tabelas Cloud vs VPS
```
