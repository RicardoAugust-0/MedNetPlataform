# Auditoria Técnica — Correções Aplicadas (2026-05-29)

Documento de handoff. Cobre dois esforços do dia: **(1)** a auditoria geral de código/segurança e **(2)** a correção e melhoria da **Planilha Embutida (Embedded Sheet)**. Registra o que foi corrigido, a ação manual obrigatória pendente e o que falta para as próximas sessões.

> **Atualização (mesma data):** após a auditoria, foram corrigidos vários bugs de sincronização da Planilha Embutida e feito deploy das edge functions. Ver a seção [Planilha Embutida](#-planilha-embutida--correções-de-sincronização-e-ux).

---

## 📊 Métricas (antes → depois)

| Indicador | Antes | Depois |
|---|---|---|
| Problemas de ESLint | **116** (88 erros, 28 avisos) | **57** (30 erros, 27 avisos) |
| `no-undef` (ambiente errado no lint) | 23 | **0** |
| `no-unused-vars` (código morto) | 14 | **0** |
| `no-empty` (catch vazio) | 13 | **0** |
| `no-useless-escape` (regex) | 4 | **0** |
| Testes | 62 ✅ | 62 ✅ |
| Build de produção | ✅ | ✅ |

> Os 57 problemas restantes são todos da categoria "refatoração profunda de hooks/arquitetura" (ver _O que falta_). Nenhum é código morto ou erro de ambiente.

---

## ✅ O que foi feito

### Segurança
- **Brecha crítica de autenticação em `append-sheet`** (`supabase/functions/append-sheet/index.ts`)
  - Removida a checagem por substring `tokenStr.includes('service_role')` (frágil e perigosa).
  - O literal mágico `SYSTEM_TRIGGER` deixou de ser aceito incondicionalmente. Agora a auth é em camadas e por **comparação exata**:
    1. `service_role` key exata → autorizado (scripts/jobs internos);
    2. `TRIGGER_SECRET` (env da função) exato → autorizado (caminho seguro da trigger);
    3. literal legado `SYSTEM_TRIGGER` → aceito **apenas enquanto `TRIGGER_SECRET` não estiver configurado** (compatibilidade, sem downtime);
    4. caso contrário → valida sessão de operador via `getUser()`.
  - **Nova migration** `supabase/migrations/20260529120000_secure_append_sheet_trigger.sql`: a trigger `trigger_espelhamento_sheets_fn` passa a montar o header `Authorization` lendo o secret do **Vault** (`trigger_secret`), com fallback seguro (JWT do operador → secret do Vault → literal legado). Funciona em todos os estados sem quebrar a sincronização.
  - ⚠️ **Requer provisionamento manual para fechar a brecha de fato — ver seção abaixo.**
- **Removido `query_db.js`** da raiz: script de debug que fazia `SELECT *` em `profiles` e `atendimentos` e imprimia tudo no console. Não deveria estar versionado.

### DevOps / CI
- **`.github/workflows/ci.yml`**: gatilho de `push` corrigido de `branches: [main]` para `branches: [master]`. Antes, o CI **nunca** rodava em pushes (o branch padrão é `master`); só em PRs.

### Configuração de qualidade
- **`eslint.config.js`** reescrito para refletir os ambientes reais:
  - Frontend (`src/**`) → globais de browser;
  - Bot RPA (`vps/**`) → globais de Node (resolve os 23 `no-undef` de `process`);
  - Ignora `dist`, `supabase/functions` (Deno, lintado à parte) e `google-apps-script.js` (Google Apps Script).

### Código morto removido
| Arquivo | Removido |
|---|---|
| `src/components/DataProvider.jsx` | `import React` não usado |
| `src/components/Sidebar.jsx` | import `APP_CONFIG` não usado |
| `src/modules/EmbeddedSheet.jsx` | `import React` não usado |
| `src/modules/DossiesPage.jsx` | vars `navigate`, `profile`, `session`, `theme` + 3 imports órfãos |
| `src/modules/dashboard/drills/index.jsx` | função `isFadigaDriver` + `FADIGA_KEYWORDS` + prop `driversAtivos` |
| `src/modules/Dashboard.jsx` | prop `driversAtivos` passada e não consumida |
| `src/modules/dashboard/hooks/useDashboardMetrics.js` | var `tiposFadiga` |
| `vps/bot/scheduler.js` | parâmetro `intervalMinutes` não usado |

### Higiene de lint
- **13 blocos `catch {}` vazios** anotados com a intenção (`/* storage não crítico */`) em `context.jsx`, `CrossCheck.jsx`, `Dashboard.jsx`, `Monitor.jsx`, `monitor/utils.jsx`. São swallows deliberados em torno de `localStorage`/`JSON.parse`.
- **Regex** em `src/modules/crosscheck/utils.js`: `[\/\-]` → `[/-]` (escapes desnecessários).
- **`src/modules/Profile.jsx`**: corrigida a diretiva `eslint-disable` (o token `exhaustive-deps` estava no escopo errado); intenção do effect documentada.

---

## 🔧 Planilha Embutida — correções de sincronização e UX

Esforço separado da auditoria (mesmo dia). Os bugs giravam em torno da sincronização bidirecional com o Google Sheets via `read-sheet`/`append-sheet`.

### Bugs corrigidos

**1. "Sincronizar Hoje" reimportava infinitamente (duplicatas)** — `EmbeddedSheet.jsx`
A busca de registros existentes (`select` sem filtro e sem `order`) batia no **teto padrão de 1000 linhas do PostgREST**. Com a tabela em 2400+ linhas, as linhas de hoje (as mais recentes) não eram retornadas → a deduplicação não via nada → cada clique reinseria as ~29 intervenções. Sintomas relatados: "27 sincronizadas" repetindo, e "112 eventos vs 29 reais".
- **Fix:** a busca passou a ser escopada por data no servidor (`.in('data', [variantes de hoje])`), independente do tamanho da tabela; chave de dedup normalizada campo a campo (`makeKey`).
- **Limpeza de dados:** duplicatas removidas mantendo a versão mais recente por chave (`2409 → 2030` linhas; re-limpa durante os testes).

**2. Handler de realtime de DELETE invertido** — `EmbeddedSheet.jsx`
`prev.filter(r => r.id === payload.old.id)` mantinha **apenas** a linha apagada (esvaziava a grid). Corrigido para `!==`.

**3. Editar uma linha criava uma nova no Google Sheets** — `append-sheet`/`read-sheet`/`EmbeddedSheet`
As linhas importadas não tinham o `id` da plataforma na coluna P do Sheets, então a `append-sheet` dependia do match por `data+placa+colaborador`. Ao **corrigir o nome do colaborador** (ou com a data em branco no início do dia), o match falhava e uma **nova linha era inserida**.
- **Fix em camadas (mais robusto):**
  1. `read-sheet` agora lê `A:P` e retorna `idPlataforma` (coluna P) e `_row` (número da linha).
  2. `EmbeddedSheet` reaproveita `idPlataforma` como `id` do registro quando existe, e grava `linha_sheet` com a **linha exata** da aba.
  3. `append-sheet` ganhou match **posicional verificado** (usa `linha_sheet`, confere placa **ou** colaborador) e um **fallback tolerante**: exige **placa + (data OU colaborador)**, escolhendo o candidato mais específico. Tolera UM campo-chave editado sem casar com outro dia. Em qualquer match, carimba o `id` na coluna P → edições seguintes casam por ID.

### Melhorias de UX (para o operador preferir a plataforma à planilha)
- **Grid apenas de hoje** (`loadData` filtra por data; antes trazia as últimas 150 de qualquer dia).
- **"Realizado?" em 1 clique**: pílula que alterna SIM/NÃO direto (ação diária do operador).
- **Botão de excluir linha** (ícone de lixeira, com confirmação via `useConfirm`) — remove a intervenção da plataforma.
- Chip **"Hoje · &lt;data&gt;"** no cabeçalho, **realce de criticidade por linha**, e estado vazio com chamada para ação.
- Robustez: filtro de hoje no realtime INSERT, **guarda anti-leitura-parcial** no DELETE da reconciliação, e init único no mount via `ref`.

### Deploys realizados (produção)
- **`append-sheet` → v13** (deployada via MCP; `verify_jwt: false` mantido — a trigger chama sem JWT de usuário).
- **`read-sheet` → v8** (deployada via MCP).
- **Frontend** → `git push` no `master` (deploy Vercel).

### ⚠️ Pendências específicas da Planilha Embutida
- [ ] **Linhas duplicadas já criadas no Google Sheets** pelas edições que falharam antes do fix (ex.: duas versões do mesmo motorista) — precisam de limpeza manual na planilha.
- [ ] **Deletar também no Google Sheets** quando o operador exclui na plataforma (hoje o botão só remove do banco; a `append-sheet` não tem operação de delete). **O usuário implementará depois.**
- [ ] **RLS de exclusão**: hoje só `is_admin()` pode deletar `intervencoes_sheet`. Se operadores precisarem excluir suas linhas, adicionar policy.
- [ ] **Backfill de `linha_sheet` posicional** para as ~30 linhas antigas de hoje (têm o placeholder `"MAIO 2026!A:P"`). Não é crítico: elas se auto-curam na primeira edição (fallback casa por placa+data → atualiza → carimba o ID).

---

## ⚠️ AÇÃO MANUAL OBRIGATÓRIA (antes de deployar)

A função `append-sheet` **já está deployada (v13)** com a lógica do `TRIGGER_SECRET`, mas o secret **ainda não foi provisionado** e a migration do Vault **ainda não foi aplicada** — então o modo de compatibilidade (`SYSTEM_TRIGGER`) segue ativo e a brecha continua aberta. Para fechá-la, provisione o secret nos **dois** lugares (sem isso o comportamento é idêntico ao atual, sem quebrar nada):

1. **Gerar um valor aleatório longo** (no Windows: `[Convert]::ToBase64String((1..32|%{Get-Random -Max 256}))` ou use um gerenciador de senhas).
2. **Vault (banco)** — SQL Editor do Supabase:
   ```sql
   select vault.create_secret('<VALOR_ALEATORIO>', 'trigger_secret');
   ```
3. **Edge Function** — Supabase → Functions → `append-sheet` → Secrets:
   ```
   TRIGGER_SECRET=<MESMO_VALOR_ALEATORIO>
   ```
4. **Aplicar a migration** `20260529120000_secure_append_sheet_trigger.sql` (faz a trigger enviar o secret do Vault). A função já está no ar; não precisa redeploy.
5. **Validar**: editar uma linha na planilha embutida e confirmar que sincroniza (status `sincronizado`). Conferir os logs — não deve mais aparecer `Token legado SYSTEM_TRIGGER aceito`.

---

## 🔜 O que falta (próximas sessões, por prioridade)

### Alta — Segurança
- [ ] **Provisionar `TRIGGER_SECRET`** (seção acima). Sem isso a brecha permanece.
- [ ] **Criptografar credenciais em repouso**: `rpa_credentials.password` (Maxtrack) e `profiles.sascar_token` estão em texto plano. Migrar para Supabase Vault ou criptografia simétrica com chave em secret. Afeta `vps/seed-credentials.js`, `vps/bot/maxtrack.js`, `pull-sascar/index.ts`.
- [ ] **Rotacionar a `service_role` key** se `vps/.env` já foi compartilhado/copiado (está gitignorado e fora do histórico, mas em texto plano no disco da VPS).

### Média — Refatoração de React (57 problemas restantes de lint)
- [ ] **`react-hooks/set-state-in-effect` (17 erros)**: `setState` síncrono dentro de `useEffect` causa renders em cascata. Focos: `AuthContext.jsx`, `useAtendimentos.js`, `useDriversQueue.js`, `App.jsx`. Avaliar caso a caso (lazy init, derivar no render, ou mover para callback de evento).
- [ ] **`react-hooks/exhaustive-deps` (27 avisos)**: arrays de dependência incompletos → risco de closures obsoletas. Em `Dashboard.jsx`, envolver `attend`/`reportar`/`openDossie`/`openTemplate`/`deleteAlert` em `useCallback` (hoje desestabilizam o `useMemo` da linha ~640).
- [ ] **`react-refresh/only-export-components` (12 erros)**: separar constantes/funções utilitárias dos arquivos de componente (`context.jsx`, `monitor/utils.jsx`, `dashboard/components/_shared.jsx`, `useConfirm.jsx`, `AuthContext.jsx`) em módulos próprios.
- [ ] **`react-hooks/preserve-manual-memoization` (1)**: `useDashboardMetrics.js:42` — o React Compiler pulou a otimização porque a memoização manual não pôde ser preservada.
- [ ] Após zerar os **erros** de lint, **remover `continue-on-error: true`** do passo de lint no `ci.yml` para o CI passar a barrar regressões.

### Média — Arquitetura
- [ ] **Deduplicar a assinatura JWT do Google**: `getAccessToken()` está copiada em `append-sheet/index.ts` e `read-sheet/index.ts` (e provavelmente `generate-report`). Extrair para `supabase/functions/_shared/google.ts`.
- [ ] **Decompor arquivos grandes** seguindo o padrão de submódulos já usado em `dashboard/` e `monitor/`: `Admin.jsx` (1009), `Dashboard.jsx` (933), `CrossCheck.jsx` (852), `DossiesPage.jsx` (835), `Monitor.jsx` (795).

### Baixa — Performance e testes
- [ ] **`append-sheet` O(n) por registro**: lê o range inteiro `A:P` e faz dois loops a cada inserção. Com a planilha crescendo e disparo por trigger (1 leitura/registro), degrada linearmente. Considerar índice ID→linha em cache (já há infra de cache em `maxtrack_cache`).
- [ ] **Cobertura de testes**: hoje os 62 testes cobrem só os parsers (`platforms/*`). Zero cobertura em hooks, componentes e edge functions. Priorizar testes para `append-sheet` (auth/idempotência) e os hooks de dados.

---

## Como validar o estado atual
```bash
npm run lint    # 57 problemas (todos da lista "O que falta"); 0 de código morto/ambiente
npm test        # 62 passando
npm run build   # build de produção OK
```

## Arquivos alterados nesta sessão
18 arquivos (17 modificados + 1 migration nova), 1 removido (`query_db.js`). Detalhe em `git diff` / `git log`.
