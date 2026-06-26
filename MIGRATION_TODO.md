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

### 1. Migrar tabelas que ficaram pra trás  ✅ FEITO (2026-06-26)
Rodado `migrate_rest2.mjs`: `templates`(12), `links`(16), `reminders`(1), `ws_pages`(8),
`intervencoes_sheet`(2516), `automations`(2), `automation_logs`(70) — todas batendo.
- `automations`/`automation_logs` não existiam na VPS → criadas via `supabase/migration_automations.sql`
  (Studio SQL Editor). O seed do arquivo criou 2 automações + 2 logs de exemplo que viraram
  duplicata; removidas (eram `Bot_Maxtrack`/`Bot_HorizonScraping`, IDs `b0a9…`/`c1b9…`).
- `drivers_queue` estava 0 na VPS (apesar do doc dizer que estava feito) → re-migrada (38/38).
- Auditoria `_audit.mjs` confirma: tudo OK exceto o esperado (driver_events/analytics_daily
  vazios até reimportar; get_distinct_transportadoras e get_cloud_users são RPCs).

### 2. Reimportar `driver_events`  (você, pelo app)
Só tem 1.000 das 429k linhas na VPS. Reimporte as planilhas pela tela de Analytics.
A tabela `analytics_daily` (rollup) se reconstrói sozinha a partir disso.

### 3. Edge Functions na VPS  ✅ DEPLOYADAS (2026-06-26) — falta 1 segredo
As **5** funções foram copiadas via `scp` pro volume do runtime na VPS
(`/data/coolify/services/lo4522vm3cwytmy8bk5s5mbu/volumes/functions/<nome>/index.ts`)
e **bootam OK** (OPTIONS→200, POST sem auth→401). O runtime Deno já estava ativo e
exposto pelo Kong; só faltava o código. `SUPABASE_URL/ANON/SERVICE_ROLE` são injetadas
automaticamente (confirmado — funções retornam 401 limpo, não 500).
- ✅ `generate-report`, `generate-dossier-report` → funcionam (leem chave IA da `ai_credentials`).
- ✅ `invite-user` → cria usuário; só precisa de **SMTP no GoTrue** pra enviar o e-mail de convite.
- ✅ `read-sheet`, `append-sheet` → **FUNCIONANDO** (2026-06-26). `GOOGLE_SERVICE_ACCOUNT` setado
  em Coolify (conta de serviço NOVA `ais-gemini-key-...@927372921452.iam.gserviceaccount.com`,
  compartilhada como Editor na planilha). Coolify injetou a var no container (confirmado:
  `PRESENTE 2358 chars`). Bloqueio final era a **Google Sheets API desabilitada** no projeto
  `927372921452` → habilitada via console. Importar e espelhar OK.
- `pull-sascar` foi **removida do escopo** (decisão do usuário — não deployada). A feature SASCAR
  no frontend vai quebrar se usada; remover do front depois se confirmar que não usa mais.
- `append-sheet` (espelhamento automático): o gatilho `trigger_espelhamento_sheets_fn` monta a URL
  pelo host da requisição → já aponta pra VPS sozinho. Depende de **`pg_net` ativo** na VPS
  (verificar) + `GOOGLE_SERVICE_ACCOUNT`. `TRIGGER_SECRET` é opcional (tem fallback legado).

### 4. Verificar Realtime (websockets)  ✅ FEITO (2026-06-26)
Handshake `wss://www.mednetsupabase.duckdns.org/realtime/v1/websocket` retorna
`HTTP 101 Switching Protocols` (Server: Cowboy, via kong/3.9.1). Realtime OK na VPS.

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
