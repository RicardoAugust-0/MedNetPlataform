# Ponto de retomada da auditoria — 2026-07-16

Este arquivo registra o estado local após a revisão de segurança e qualidade.
As alterações estão salvas no working tree da branch `master`, mas **não foram
commitadas, enviadas ao GitHub nem aplicadas no Supabase/produção**.

## Correções locais já implementadas

- Proteção contra autoelevação de `profiles.role` e RPC administrativa para
  alteração de papel.
- Restrição das gravações financeiras em `driver_events`, RPCs internas e
  filas Horizon ao papel apropriado/service role.
- RLS e auditoria imutável para dados clínicos e documentos de motoristas.
- Webhook do WhatsApp com assinatura HMAC, idempotência transacional e sem
  confiar em `userId` enviado pelo cliente.
- Backend com CORS obrigatório em produção, configuração fail-closed,
  proteção SSRF, limites de upload/JSON, readiness, headers de segurança e
  rate limit.
- `append-sheet` sem o fallback conhecido `SYSTEM_TRIGGER`; o fluxo agora
  exige `TRIGGER_SECRET`.
- Frontend fail-closed para autenticação/configuração, cache PWA sem respostas
  privadas do Supabase, autosave em fila, notificações por usuário e guards de
  papel.
- Dependências de produção e desenvolvimento atualizadas; a última execução de
  `npm audit` retornou zero vulnerabilidades.
- CI alinhado ao Node 22, com instalação do backend, lint bloqueante, testes,
  build e replay das migrations em Supabase local.

## Bloqueador antes de qualquer deploy

A migration
`supabase/migrations/20260716143000_dossier_driver_identity.sql` e o fluxo de
Dossiês ainda precisam ser corrigidos. **Não executar `supabase db push`
enquanto este bloco estiver pendente.**

1. Fazer preflight de duplicatas normalizadas em `driver_health`. A nova
   constraint `(motorista_nome_normalizado, placa_normalizada)` pode falhar em
   dados existentes; registros clínicos duplicados não podem ser mesclados ou
   removidos automaticamente.
2. Introduzir/propagar uma identidade canônica UUID para telemetria e
   atendimentos. Nome + placa ainda é ambíguo quando a placa está vazia,
   compartilhada ou muda ao longo do tempo.
3. Tratar identidades sem UUID/CPF/matrícula inequívoca como ambíguas, sem
   montar um prontuário combinado.
4. Validar `driver_health_id` no trigger de documentos. Quando o UUID for
   informado, nome e placa devem ser derivados da ficha ou validados contra
   ela; hoje é possível informar um UUID com os dados de outra pessoa.
5. Substituir a lista fixa dos primeiros 500 motoristas por busca e paginação
   server-side. Deep links por UUID devem ser resolvidos diretamente, mesmo
   fora da primeira página.
6. Reconciliar documentos legados sem placa somente quando houver um único
   candidato; criar relatório/fila de documentos órfãos para os casos
   ambíguos.
7. Empurrar o filtro de busca para as fontes da RPC e planejar os índices para
   não bloquear escrita em uma tabela `driver_events` grande.
8. Adicionar testes para duplicatas normalizadas, homônimos, placa ausente,
   UUID divergente, documentos órfãos, 501+ motoristas e deep links.

## Segurança clínica ainda pendente

- `supabase/functions/process-driver-document/index.ts` precisa validar no
  servidor se o usuário é `lider` ou `admin`. O guard visual atual não basta,
  pois a função usa service role para gravar e pode contornar a RLS.
- `src/lib/uploadDriverDocument.js` precisa apagar o objeto do Storage quando o
  INSERT de metadados falhar, evitando arquivos órfãos.
- Revisar o fluxo completo upload → OCR → revisão → gravação após a identidade
  canônica ser definida.

## Validações locais que faltam

- Executar `npm run lint` e confirmar zero erros após as últimas alterações.
- Executar a suíte completa com `npm test`.
- Executar `npm run build` com variáveis Vite válidas de teste.
- Executar testes/sintaxe do backend e `npm audit` também dentro de `server/`.
- Fazer replay de todas as migrations com `supabase db start` em uma máquina
  com Docker/Supabase CLI e corrigir qualquer incompatibilidade de schema.
- Executar `git diff --check` e revisar integralmente o diff antes de stage.
- Atualizar `README.md` e `docs/PROJECT.md` (rotas admin, stack, variáveis e
  procedimento de deploy ainda têm trechos desatualizados).

## Preparação obrigatória do deploy

1. Fazer backup e abrir janela de manutenção.
2. Configurar o mesmo segredo em Supabase Vault (`trigger_secret`) e na Edge
   Function (`TRIGGER_SECRET`) antes de aplicar a migration `20260716144000`.
3. Configurar os novos envs do backend indicados em `.env.example`, sobretudo
   `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`, `INTERNAL_API_KEY`,
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, allowlist de
   automações e limites de requisição/upload.
4. Conferir `supabase migration list --linked`: o histórico remoto pode conter
   `20260713180000`, que foi substituída localmente pela versão única
   `20260713180500`. Não reparar o ledger sem comparar o SQL que foi aplicado.
5. Após corrigir e testar Dossiês, aplicar migrations/RPCs antes de publicar o
   backend que depende delas.
6. Publicar Edge Functions, backend e frontend na ordem documentada, depois
   validar `/health/ready`, webhook assinado, roles, Dossiês e ingestões reais.

## Comandos de retomada

```powershell
git status --short
npm run lint
npm test
npm run build
npm audit
npm audit --prefix server
git diff --check
```

Para o banco, em ambiente com Docker e Supabase CLI:

```powershell
supabase migration list --linked
supabase db start
```

## Observações do working tree

- `.claude/settings.local.json` já existia como arquivo local não rastreado e
  deve continuar fora do escopo.
- Não fazer stage/commit automático antes da revisão final.
- Nenhuma migration desta rodada foi aplicada no banco remoto.
