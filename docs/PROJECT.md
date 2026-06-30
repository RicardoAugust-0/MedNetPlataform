# MedNet · Fadiga Zero — Documentação do Projeto

Plataforma operacional da equipe **Fadiga Zero** do GRUPO MedNet. Centraliza o
monitoramento de motoristas, a fila de intervenções, a planilha de tratativas,
o prontuário clínico, analytics histórico, relatórios por IA, automações
(WhatsApp + VPS), scripts de contato, agenda, base de conhecimento e
administração da equipe.

> **Última revisão geral:** 2026-06-30. Ver o [Changelog](#22-changelog) para o
> que mudou desde a revisão anterior (2026-05-29).
> Estado de infra e pendências críticas em [AUDITORIA-VPS-2026-06-30.md](./AUDITORIA-VPS-2026-06-30.md).

---

## 1. Visão geral

| Item                              | Valor                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Empresa                           | GRUPO MedNet (Medicina e Seg. do Trabalho)                                           |
| Setor                             | Fadiga Zero                                                                          |
| Produto                           | SPA React/Vite com PWA + **roteamento por URL (React Router)**                       |
| Backend de dados                  | Supabase (Auth + Postgres + Storage + Edge Functions)                               |
| Backend de aplicação              | **Servidor Express** (`server/`) — agregação de Analytics + proxy WhatsApp Cloud API |
| Integrações externas              | Google Sheets, WhatsApp Cloud API (Meta), IA (Anthropic Claude / Google Gemini)      |
| Plataformas no Monitor (realtime) | **Sascar** · **Maxtrack** · **OmniLink**                                             |
| Plataformas no Analytics (import) | MaxTrack, Sascar, Sascar JD, Sighra, Horizon, AutoTrac, OmniLink, Trimble            |

A aplicação **deixou de ser uma SPA sem rotas**: agora usa `react-router-dom`,
e a navegação acontece por URL (`/dashboard`, `/monitor/:tab`, `/admin/...`).
O antigo `activePanel` no contexto global foi substituído por `<Routes>` em
`App.jsx`. Todos os módulos são carregados via `React.lazy` + `<Suspense>`.

---

## 2. Stack técnica

- **Frontend:** React 19, Vite 8, **react-router-dom 7**, Recharts (gráficos do
  Dashboard), **Chart.js** (gráficos do Analytics), TipTap (editor rich-text do
  Workspace), `xlsx` (parser de planilhas), `vite-plugin-pwa` (instalável +
  service worker).
- **Backend de aplicação (`server/`):** Node + **Express 4**. Agrega Analytics
  a partir de `driver_events` (via RPCs/rollup do Postgres) e faz proxy da
  WhatsApp Cloud API. Deploy em container (Docker/Coolify). O front fala com ele
  via `VITE_API_URL`.
- **Backend de dados (Supabase):** Postgres com Realtime para sync de listas;
  Auth por e-mail + senha com fluxo de convite; Storage (`workspace-images`,
  avatares).
- **Edge Functions (Deno):**
  - `append-sheet` — registra atendimento em planilha Google (auth em camadas, ver §11).
  - `read-sheet` — lê abas mensais do Sheets (mês atual + anterior).
  - `invite-user` — envia convite a novos operadores (admin).
  - `pull-sascar` — busca alarmes Sascar via token do operador (bookmarklet).
  - `generate-report` — relatório executivo por transportadora gerado por IA.
  - `generate-dossier-report` — laudo clínico-operacional do motorista por IA.
- **Google Apps Script:** webhook de backup que reaproveita o payload da `append-sheet`.

---

## 3. Estrutura de pastas

```
src/
├── App.jsx                  # Shell + React Router (<Routes>), guards de role, notifier, SascarTokenHandler
├── main.jsx                 # Bootstrap React + <BrowserRouter> + providers globais
├── context.jsx              # AppProvider — UI state, fila, preferências, platformId
├── data.js                  # NAV_ITEMS (com path + minRole), ROLE_LEVEL, PANEL_TITLES, defaults, mocks
├── supabase.js              # Cliente Supabase + helpers de erro
├── utils.js                 # Helpers genéricos
├── utils/
│   ├── fatigueParser.js     # ⭐ Parser/registry das 8 plataformas de IMPORT do Analytics
│   └── fatigueParser.test.js
├── auth/                    # AuthContext, LoginPage, SetPasswordPage
├── components/              # Topbar, Sidebar (menu por role), ErrorBoundary, MaintenancePage, DataProvider
├── hooks/                   # Hooks de domínio (atendimentos, drivers_queue, automations, maintenance, …)
├── lib/                     # uploadImage.js, uploadAvatar.js
├── modules/                 # Painéis (cada um é uma rota lazy)
│   ├── Dashboard.jsx + dashboard/    # Gestão à Vista (components/, hooks/, drills/, _helpers, _mocks)
│   ├── Monitor.jsx + monitor/        # Fila de intervenção (UploadArea, DriverCard, HistoryTab, …)
│   ├── CrossCheck.jsx + crosscheck/  # Comparação cruzada de planilhas (líder+)
│   ├── EmbeddedSheet.jsx             # Planilha Embedded (/planilha) — grid editável sync c/ Sheets
│   ├── DossiesPage.jsx               # Dossiês Clínicos (/dossies/:tab) — prontuário + telemetria + IA
│   ├── Agenda.jsx, Templates.jsx, Workspace.jsx, WorkspaceEditor.jsx, Notes.jsx, Links.jsx, Profile.jsx
│   ├── Automacoes.jsx + automacoes/  # Hooks VPS + WhatsApp (HooksTab, ChatTab, DisparosTab, MetricsGrid, DispatchesTable)
│   ├── Analytics.jsx + analytics/    # Analytics histórico (FadigaKPIs, FadigaCharts, ImportModal, ComparisonView, components/)
│   ├── Reports.jsx                   # Relatórios IA por transportadora (/admin/relatorios)
│   ├── PlatformBadge.jsx
│   └── admin/                        # ⭐ Escopo /admin decomposto em layouts + abas
│       ├── AdminLayout.jsx           # Tab bar do /admin (rotas reais via <Outlet/>)
│       ├── EquipeTab.jsx             # /admin/equipe — convites, roles, last_seen
│       ├── AdminAuditoria.jsx        # /admin/auditoria — trilha global de tratativas (paginada)
│       ├── IntegracoesLayout.jsx     # /admin/integracoes (sub-abas)
│       ├── IntegracoesCredenciais.jsx    # OmniLink (operator_email)
│       ├── IntegracoesTransportadoras.jsx# de-para de transportadoras (carrier_aliases)
│       ├── AiCredentials.jsx         # /admin/ia — provedor/modelo/chaves de IA
│       ├── SistemaLayout.jsx         # /admin/sistema (sub-abas)
│       ├── SistemaManutencao.jsx     # toggle de manutenção + mensagem
│       ├── SistemaLimpeza.jsx        # limpeza de histórico de atendimentos (com prévia + CSV)
│       └── adminSubnav.css
└── platforms/               # ⭐ Adapters do MONITOR (realtime) — distinto do fatigueParser
    ├── base.js, index.js    # Contrato + registry (sascar, maxtrack, omnilink)
    ├── shared/              # normalize, parsers, history
    ├── sascar/  maxtrack/  omnilink/   # cada um: index.js, columns.js, parser.js
    └── _template/

server/                      # ⭐ Backend Express (deploy próprio)
├── index.js                 # Bootstrap Express; registra rotas
├── analytics-routes.js      # /api/analytics, /api/platforms, /api/compare-options, /api/analytics/csv, /api/clear-cache
├── analytics-rpc.js         # Orquestra get_analytics_rollup* (RPC) + fallback JS
├── analytics-parity.js      # Comparação JS×RPC (paridade)
├── whatsapp-routes.js       # /api/whatsapp/* (credentials, templates, send, chats, webhook)
└── Dockerfile

supabase/
├── migrations/              # ~40 migrations incrementais (ver §6)
└── functions/               # append-sheet, read-sheet, invite-user, pull-sascar, generate-report, generate-dossier-report
```

---

## 4. Navegação, rotas e papéis (`NAV_ITEMS` em `src/data.js`)

A Sidebar monta o menu a partir de `NAV_ITEMS`, **filtrando por hierarquia de
role**: `ROLE_LEVEL = { operador: 0, lider: 1, admin: 2 }`. Um item com `minRole`
só aparece para quem está no nível igual/superior. As rotas têm guard
correspondente em `App.jsx` (`RoleGuard` / `AdminGuard`).

| Grupo            | Label             | Rota (`path`)         | minRole | Módulo                          |
| ---------------- | ----------------- | --------------------- | ------- | ------------------------------- |
| **Operação**     | Dashboard         | `/dashboard`          | —       | `Dashboard.jsx`                 |
| Operação         | Monitor de Frota  | `/monitor/:tab`       | —       | `Monitor.jsx`                   |
| Operação         | Planilha Embedded | `/planilha`           | —       | `EmbeddedSheet.jsx`             |
| Operação         | Dossiês Clínicos  | `/dossies/:tab`       | —       | `DossiesPage.jsx`               |
| Operação         | Agenda            | `/agenda`             | —       | `Agenda.jsx`                    |
| **Conhecimento** | Templates         | `/templates`          | —       | `Templates.jsx`                 |
| Conhecimento     | Workspace         | `/workspace[/:cat]`   | —       | `Workspace.jsx`                 |
| Conhecimento     | Bloco de Notas    | `/notas`              | —       | `Notes.jsx`                     |
| Conhecimento     | Links Rápidos     | `/links`              | —       | `Links.jsx`                     |
| **Gestão**       | Cross-Check       | `/crosscheck`         | `lider` | `CrossCheck.jsx`                |
| Gestão           | Automações        | `/automacoes`         | `lider` | `Automacoes.jsx`                |
| Gestão           | Administração     | `/admin`              | `admin` | `admin/AdminLayout.jsx` (escopo) |
| **Conta**        | Meu Perfil        | `/perfil`             | —       | `Profile.jsx`                   |

### 4.1. Escopo `/admin` (admin-only, sub-rotas reais via `<Outlet/>`)

O antigo `Admin.jsx` (monolítico, ~1000 linhas) foi **removido**. Hoje `/admin`
tem um único guard no pai e cada aba é uma rota:

| Sub-rota                          | Aba                  | Módulo                          |
| --------------------------------- | -------------------- | ------------------------------- |
| `/admin/analytics`                | Analytics            | `Analytics.jsx`                 |
| `/admin/relatorios`               | Relatórios IA        | `Reports.jsx`                   |
| `/admin/auditoria`                | Auditoria            | `admin/AdminAuditoria.jsx`      |
| `/admin/equipe`                   | Equipe & Acessos     | `admin/EquipeTab.jsx`           |
| `/admin/integracoes/credenciais`  | Credenciais & OmniLink | `admin/IntegracoesCredenciais.jsx`   |
| `/admin/integracoes/transportadoras` | Transportadoras (de-para) | `admin/IntegracoesTransportadoras.jsx` |
| `/admin/ia`                       | IA & Parsing         | `admin/AiCredentials.jsx`       |
| `/admin/sistema/manutencao`       | Modo manutenção      | `admin/SistemaManutencao.jsx`   |
| `/admin/sistema/limpeza`          | Limpeza de histórico | `admin/SistemaLimpeza.jsx`      |

Rotas antigas redirecionam: `/analytics → /admin/analytics`,
`/relatorios → /admin/relatorios`.

Busca global (⌘K / Ctrl+K) na Sidebar pesquisa entre páginas (respeitando o
`minRole` do usuário) e motoristas (por nome ou placa) na fila atual.

---

## 5. Domínios funcionais

### 5.1. Dashboard — Gestão à Vista (`modules/Dashboard.jsx` + `modules/dashboard/`)

Visão de diretoria, foco em macros do dia + drill rápido. Realtime end-to-end
(fila de motoristas `drivers_queue` + atendimentos da equipe).

O módulo foi decomposto: `dashboard/components/` (KPI, FilterBar, CriticalSLA,
ProductivityRanking, TechAlerts, ClassificationBreakdown, TransportadoraRanking,
HourlyActivity, Banner, Section, SheetInsights, `_shared.jsx`),
`dashboard/hooks/` (useDashboardFilters, useDashboardMetrics, useDashboardSettings),
`dashboard/drills/`, `dashboard/_helpers.js` e `dashboard/_mocks.js`.

**KPIs (4 cards):** Volume do dia · Fechados hoje · Em aberto agora · Reincidência.
Cada KPI tem delta vs. ontem (toggle) e drill inline.

**Seções:** Banner SLA vencido · Pulso da operação (Críticos & SLA, Atividade por
hora 24 h, Tipo & Resultado donut, Atenção técnica, Transportadoras) ·
Produtividade da equipe.

**Filtros (`FilterBar`):** Tipo · Resultado · Empresa (após `resolveAlias`) ·
Operador (de `useProfiles()`) · Período (hoje/turno). Persistidos em
`localStorage.mn_dash_filters`. Counts dos chips sempre absolutos.

**Tweaks popover (engrenagem):** SLA, comparação, layout (balanceado/cinema/
compacto), modo executivo, seções visíveis, tema/accent/densidade, atalho admin
para aliases. Persistência granular em `mn_dash_*`. **Modo TV** (`body.dash-tv-mode`)
e **Modo Executivo** (`body.dash-exec-mode`) infláveis.

DEV mocks (`dashboard/_mocks.js`) só carregam em `import.meta.env.DEV` com fila
vazia — tree-shaken em produção.

### 5.2. Monitor de Frota (`modules/Monitor.jsx` + `modules/monitor/`)

Núcleo operacional. Rota `/monitor/:tab` (a aba ativa é segmento de URL). Recebe
a entrada da plataforma e organiza em abas: **Intervenção**, **Reportar à
empresa**, **Só técnico**, **Histórico**.

Plataformas disponíveis vêm do registry `src/platforms/` (Sascar, Maxtrack,
OmniLink). Filtros dinâmicos por plataforma (turno, severidade, transportadora,
evento) + **presets** em `localStorage` (`mn_filter_presets`). DriverCard mostra
badges de reincidência (Supabase) e planilha (Google Sheets). Descarte com
motivo, exportação CSV da aba ativa, descarte em massa.

Toda mutação na fila passa pelos métodos do `useDriversQueue` (local + DB +
realtime). Pipeline de parse e regras de negócio: ver §10.

> A camada de **RPA** (cartão de automação Maxtrack no UploadArea) foi
> **removida** — a automação Maxtrack passou a ser gerida fora da plataforma
> (N8N/código). Ver §22.

### 5.3. Cross-Check (`modules/CrossCheck.jsx` + `modules/crosscheck/`) — líder+

Comparação cruzada de alertas entre duas plataformas. O operador carrega uma
planilha por fonte e o módulo cruza por placa e por motorista, destacando
divergências. Filtros de período/transportadora, estatísticas por
transportadora, duplicados internos e export CSV. **Agora restrito a líder+.**

### 5.4. Planilha Embedded (`modules/EmbeddedSheet.jsx`) — `/planilha`

Grid editável inline das intervenções **do dia**, sincronizada
bidirecionalmente com a planilha mensal do Google Sheets. Substitui o trabalho
direto na planilha pelo operador.

- Tabela `intervencoes_sheet` (uma linha por intervenção do dia). Colunas
  editáveis célula a célula: data, empresa, sistema, colaborador, placa, frota,
  criticidade, classificação, **Realizado?** (pílula SIM/NÃO em 1 clique),
  motivo, solicitado/realizado por, horas, justificativa.
- `loadData` filtra só HOJE (variantes de data tolerantes). Realtime (INSERT/
  UPDATE/DELETE) com guardas anti-leitura-parcial.
- Sincronização com Sheets via `read-sheet` (importa) e `append-sheet`
  (escreve), com **dedup por chave normalizada** (placa+data+colaborador) e
  **match posicional** pela coluna P (id) / `linha_sheet`. Trigger no banco
  espelha alterações para o Sheets (ver §11).
- Excluir linha (lixeira com confirmação) remove do banco. _Pendência conhecida:
  delete não propaga para o Sheets._

### 5.5. Dossiês Clínicos (`modules/DossiesPage.jsx`) — `/dossies/:tab`

Prontuário do motorista cruzando saúde + telemetria + tratativas, com laudo por
IA. Abas `clinico` e `tratativas` (segmento de URL); seleção de motorista via
`?driver=`.

- Lista consolidada de motoristas (de `driver_health` + `driver_events` +
  `atendimentos`), com cache em memória.
- **Ficha Clínica** (`driver_health`): escala de Epworth (0–24, com faixa de
  alerta), polissonografia/apneia, histórico clínico, último exame, placa,
  transportadora, frota, turno. Editável e upsert por `motorista_nome`.
- **Telemetria:** count real + primeiros 200 eventos de `driver_events`
  (severidade, plataforma, velocidade, turno, data).
- **Tratativas:** atendimentos anteriores (`atendimentos`).
- **Laudo Integrado por IA:** botão "Analisar com I.A" chama a edge function
  `generate-dossier-report` (provedor/modelo de `app_settings.ai_config`),
  cruzando fadiga + exames em uma análise clínico-operacional (markdown).

### 5.6. Agenda (`modules/Agenda.jsx`)

Lembretes com data, hora, ícone, prioridade urgente e detalhes. Notificações via
Notification API + toast (`ReminderNotifier` em `App.jsx`).

### 5.7. Templates (`modules/Templates.jsx`)

Scripts reutilizáveis para WhatsApp. Tags, variáveis built-in (`[NOME]`,
`[PLACA]`, …) e customizadas, drag-reorder, copy-to-clipboard.

### 5.8. Workspace (`modules/Workspace.jsx` + `WorkspaceEditor.jsx`)

Wiki interna com TipTap (upload de imagens p/ bucket `workspace-images`).
Categorias roteadas por `/workspace/:categoria`. Inclui **modo de cópia rápida**
com feedback visual no editor.

### 5.9. Bloco de Notas (`modules/Notes.jsx`)

Notas pessoais ou compartilhadas, auto-save com debounce.

### 5.10. Links Rápidos (`modules/Links.jsx`)

Atalhos para sistemas, seções interno/externo, personalização de ícone/cor,
drag-reorder.

### 5.11. Meu Perfil (`modules/Profile.jsx`)

Edita nome, cargo, avatar e senha (e-mail read-only). **Seção Integrações:**
bookmarklet Sascar (ver §12).

### 5.12. Analytics (`modules/Analytics.jsx` + `modules/analytics/`) — `/admin/analytics`

> **Reescrito.** Deixou de ser a janela fixa de 30 dias sobre `atendimentos` e
> virou um **sistema de analytics histórico** sobre eventos brutos importados de
> planilhas, agregados pelo backend Express.

Fluxo:

1. **Import universal** (`ImportModal` + `utils/fatigueParser.js`): o usuário
   sobe um relatório de qualquer das 8 plataformas (MaxTrack, Sascar, Sascar JD,
   Sighra, Horizon, AutoTrac, OmniLink, Trimble). O parser detecta o layout pelo
   cabeçalho, mapeia colunas e normaliza. Os registros são gravados em
   `driver_events` (upsert idempotente por `platform_id,placa,ocorrido_em,
   nome_evento`, em chunks de 2500). Depois, `POST /api/clear-cache`.
2. **Agregação:** o front chama `GET /api/analytics` no servidor Express, que
   agrega `driver_events` no banco (RPC + rollup — ver §8) e devolve o objeto
   `d` (KPIs, séries, top motoristas/placas/UF, distribuições). `prevD` = mês
   anterior, para variação.
3. **Visualização:** `FadigaKPIs` + `FadigaKPIsDrill`, `FadigaCharts`
   (`analytics/components/`: Distribution, DriverVehicle, Temporal, Volume,
   AlertsStatus, CategoryEvidence), filtros de mês/severidade/classificação/tipo/
   empresa, e fontes (`SourceChips`).
4. **Comparação** (`ComparisonModal` + `ComparisonView`): dois modos —
   **plataformas** (entre si) e **empresas** (de UMA plataforma entre si).
5. **Export:** CSV (`/api/analytics/csv`) e HTML self-contained (clona o DOM,
   converte `<canvas>` em imagem). Filtros persistidos em `localStorage`
   (`mednet_analytics_*`).

Normalização: criticidades unificadas em Gravíssimo/Grave/Médio; classificação
em Positivo/Falso positivo/Não classificado; UF extraída da localidade. Eventos
"Leve" ficam no banco mas fora da análise. Fuso `America/Sao_Paulo`.

### 5.13. Relatórios IA (`modules/Reports.jsx`) — `/admin/relatorios`

Gera relatório executivo por transportadora a partir de `driver_events`. Escolhe
transportadora (de `get_distinct_transportadoras`), período (1–12 meses),
provedor (Anthropic/Google) e modelo. Chama a edge function `generate-report`,
que devolve markdown + meta (eventos, intervenções, motoristas, modelo usado).

### 5.14. Automações (`modules/Automacoes.jsx` + `modules/automacoes/`) — líder+

Três abas:

- **Integrações & Webhooks** (`HooksTab`):
  - _Automações VPS (hooks de saída):_ cadastra automações que disparam POST a um
    endpoint da VPS (trigger manual/agendado/por evento). Strip de saúde da VPS
    (`vpsHealth`), modal VNC (noVNC) para operar o robô remotamente. Persistido
    via `useAutomations`/`automation_logs`.
  - _WhatsApp Cloud API & Webhook (entrada):_ formulário das credenciais Meta
    (`phone_number_id`, `whatsapp_business_account_id`, token) e exibição da URL
    de callback + verify token para configurar no painel da Meta.
- **Disparos** (`DisparosTab` + `DispatchesTable` + `MetricsGrid`): histórico de
  `whatsapp_dispatches` (realtime) com métricas do dia (enviados, falhas, taxa de
  leitura, custo estimado).
- **Chat WhatsApp** (`ChatTab`): inbox em tempo real (`whatsapp_chats` /
  `whatsapp_messages` via realtime). Envio de texto livre dentro da **janela de
  24 h**; quando expira, exige envio de **template homologado** (com variáveis)
  para reabrir. Status de entrega/leitura (✓/✓✓). Deep-link de outras abas via
  `?phone=&name=`.

Todas as chamadas WhatsApp passam pelo Express (`/api/whatsapp/*`), que guarda o
token e fala com a Graph API da Meta.

### 5.15. Administração (`/admin/*`) — admin-only

Decomposta nas abas de §4.1:

- **Equipe & Acessos** (`EquipeTab`): convida operadores (`invite-user`), lista a
  equipe com `last_seen`/avatar, edita nome/cargo e **role** (operador/líder/
  admin). Remoção de acesso é feita no Supabase Auth.
- **Auditoria** (`AdminAuditoria`): trilha global somente-leitura de todas as
  tratativas (`atendimentos`), reaproveitando o realtime já carregado.
  Filtro por texto/tipo e **paginação** (25/página).
- **Integrações:** _Credenciais & OmniLink_ (`app_settings.omnilink_config.
  operator_email` — define qual operador da OmniLink é mantido no parsing) e
  _Transportadoras (de-para)_ (`app_settings.carrier_aliases`).
- **IA & Parsing** (`AiCredentials`): provedor ativo + modelos
  (`app_settings.ai_config`) e chaves de API por provedor (`ai_credentials`,
  grava só existência no front). Modelos: Claude Haiku 4.5 / Sonnet 4.6 / Opus
  4.7; Gemini 2.0 Flash / 2.5 Flash / 2.5 Pro.
- **Sistema:** _Modo manutenção_ (`SistemaManutencao`, toggle + mensagem) e
  _Limpeza de histórico_ (`SistemaLimpeza`, apaga `atendimentos` por período/tipo
  com **prévia, confirmação por digitação `LIMPAR` e CSV de backup automático**).

---

## 6. Modelo de dados (Supabase)

Tabelas operacionais (já existentes, inalteradas em essência): `profiles`,
`atendimentos`, `templates`, `notes`, `ws_pages`, `links`, `reminders`,
`app_settings`, `drivers_queue`, `profile_credentials`. Ver detalhes históricos
no git/migrations.

### 6.1. Tabelas novas / relevantes

| Tabela                  | Para quê                                                                                              | Colunas-chave                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `driver_events`         | Histórico permanente de eventos brutos de telemetria (Analytics, Dossiês, Relatórios)                | `platform_id, placa, nome, transportadora, frota, nome_evento, descricao, categoria_bucket, severidade, turno, localidade, velocidade_kmh, analise_ia_plataforma, ocorrido_em`. UNIQUE `(platform_id, placa, ocorrido_em, nome_evento)` |
| `analytics_daily`       | Rollup diário pré-agregado de `driver_events` (acelera Analytics)                                    | PK `(platform, dia, fleet_raw, sev_norm, clf_norm, nome_evento)`; agregados jsonb + `cnt`                                                     |
| `driver_health`         | Prontuário clínico do motorista (Dossiês)                                                             | `motorista_nome` (UNIQUE), `escala_epworth` (0–24), `polissonografia`, `historico_clinico`, `ultimo_exame_em`                                |
| `intervencoes_sheet`    | Planilha Embedded — intervenções do dia + controle de sync com Sheets                                | dados da intervenção + `realizado`, `status_sync` (pendente/sincronizado/erro), `tentativas_sync`, `linha_sheet`                            |
| `ai_credentials`        | Chaves de API de IA por provedor                                                                     | `provider` (UNIQUE), `api_key`                                                                                                               |
| `whatsapp_credentials`  | Token Meta Cloud API (admin-only)                                                                    | `token`, `phone_number_id`, `whatsapp_business_account_id`                                                                                   |
| `whatsapp_templates`    | Cache dos templates homologados na Meta                                                              | `name` (UNIQUE), `category`, `language`, `status`, `components` (jsonb)                                                                       |
| `whatsapp_dispatches`   | Histórico de disparos + custo estimado                                                               | `recipient_*`, `template_name`, `estimated_cost`, `status` (sent/delivered/read/failed), `meta_message_id`                                   |
| `whatsapp_chats`        | Conversas (inbox)                                                                                    | `phone` (UNIQUE), `name`, `last_message_at`, `unread_count`                                                                                  |
| `whatsapp_messages`     | Mensagens da conversa                                                                                | `chat_id`, `direction` (inbound/outbound), `body`, `status`, `meta_message_id`                                                               |
| `maxtrack_sessions` / `maxtrack_cache` | Infra de sessão/cache (legado do scraping Maxtrack)                                    | —                                                                                                                                            |
| `platform_rules`        | Regras de normalização por plataforma (taxonomy de categorias para o Monitor)         | `platform_id`, `rules` (jsonb)                                                                                                               |
| `custom_rules`          | Regras de negócio configuráveis (ex.: auto-descarte fumo Dinon por transportadora)    | `platform_id`, `transportadora`, `nome_evento`, `ativo`                                                                                      |
| `ai_chat_threads`       | Threads de conversa do MedBot                                                         | `id`, `user_id`, `title`, `created_at`                                                                                                       |
| `ai_chat_messages`      | Mensagens do MedBot por thread                                                        | `thread_id`, `role` (user/assistant), `content`, `chart` (jsonb opcional)                                                                   |
| `ai_generated_reports`  | Relatórios gerados pelo MedBot (PDF + metadata)                                      | `thread_id`, `storage_path`, `metadata` (jsonb)                                                                                              |

Automações da VPS: `automations` (hooks cadastrados) + `automation_logs`
(execuções) — alimentam a aba Automações (`useAutomations`).

`app_settings` (chaves JSON): `maintenance` (lockout + mensagem),
`carrier_aliases` (de-para de transportadoras), `omnilink_config`
(`operator_email`), `ai_config` (`provider`, `anthropic_model`, `google_model`),
`vps_config` (saúde/host da VPS para a aba Automações).

**Removidas:** `rpa_credentials` e a chave `app_settings.rpa_config`
(migration `20260625102000_remove_rpa_infrastructure.sql`).

Realtime: `atendimentos`, `templates`, `notes`, `ws_pages`, `links`,
`reminders`, `app_settings`, `drivers_queue`, `whatsapp_chats`,
`whatsapp_messages`, `whatsapp_dispatches`.

### 6.2. Sincronização realtime end-to-end

| Hook                | Tabela                                  | Eventos                       |
| ------------------- | --------------------------------------- | ----------------------------- |
| `useAtendimentos`   | `atendimentos`                          | INSERT (+ helpers de limpeza) |
| `useDriversQueue`   | `drivers_queue`                         | INSERT/UPDATE/DELETE + backfill `localStorage` |
| `useCarrierAliases` | `app_settings` (`key=carrier_aliases`)  | `*`                           |
| `useAutomations`    | automações + `automation_logs`          | status/execuções da VPS       |
| ChatTab / DisparosTab | `whatsapp_chats/messages/dispatches`  | `*`                           |

---

## 7. Autenticação e papéis

- Login: e-mail + senha via Supabase Auth. Convite usa fluxo "invite" + senha
  inicial (`SetPasswordPage`). `AuthContext` sincroniza metadata com `profiles`.
- **Hierarquia de roles** (`ROLE_LEVEL` em `data.js`):
  - `operador` (0): Operação (Dashboard, Monitor, Planilha, Dossiês, Agenda) +
    Conhecimento + Perfil.
  - `lider` (1): tudo do operador + **Cross-Check** + **Automações**.
  - `admin` (2): tudo + **Administração** (`/admin/*`) + toggle de manutenção.
- Guards: `AdminGuard` (exige `role==='admin'`) e `RoleGuard min="lider"`
  redirecionam para `/dashboard` quem não tem nível. A Sidebar esconde o que o
  usuário não pode ver (`canSee`).

---

## 8. Backend de Analytics (servidor Express + Postgres)

O caminho de Analytics tem duas camadas: o **servidor Express** (`server/`) e as
**RPCs/rollup no Postgres**.

- **Rotas** (`server/analytics-routes.js`):
  - `GET /api/platforms` — contagem de eventos por plataforma (badges).
  - `GET /api/compare-options` — plataformas + suas empresas (modal de comparação).
  - `GET /api/analytics` — agrega e devolve `{ d, prevD, availableMonths,
    availableCompanies, availableTypes, sources }`. Aceita `platformId`/`compare`/
    `sources`/`month`/`startDate`/`endDate`/`company`/`severity`/`classification`/
    `eventType`.
  - `GET /api/analytics/csv` — export.
  - `POST /api/clear-cache` — invalida o cache de resultado.
- **Engine** (`server/analytics-rpc.js`): por padrão usa **RPC** (lê o rollup
  pré-agregado), com fallback automático para o caminho JS em erro. As RPCs no
  banco (`get_analytics_rollup`, `get_analytics_rollup_multi`,
  `analytics_metadata_rollup`, `analytics_platform_counts`) leem a tabela
  `analytics_daily`, mantida consistente por triggers statement-level sobre
  `driver_events`. Há ainda `get_analytics` (cru, sobre colunas geradas) como
  referência/fallback.
- **Resultado:** "todos os meses" ~44s → ~1,5s; mês único ~13s → ~0,13s, sem
  varrer dados crus. Histórico completo do esforço em
  [docs/analytics-rpc-progress.md](./analytics-rpc-progress.md).
- **Config:** o front aponta para o servidor via `VITE_API_URL`; o servidor usa
  `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` e (opcional) `ANALYTICS_ENGINE`.
  Deploy via `server/Dockerfile`.

---

## 9. Camadas de plataforma (duas, distintas)

Existem **dois** sistemas de plataforma — não confundir:

1. **Monitor (realtime)** — `src/platforms/` (registry `index.js`). Adapters
   `sascar`, `maxtrack`, `omnilink` (modo `spreadsheet`/`scraper`). Alimenta a
   fila do dia (`drivers_queue`). Guia: [docs/PLATFORMS.md](./PLATFORMS.md).
2. **Analytics (import histórico)** — `src/utils/fatigueParser.js`. Registry de
   **8 plataformas** (MaxTrack, Sascar, Sascar JD, Sighra, Horizon, AutoTrac,
   OmniLink, Trimble) com detecção por assinatura de cabeçalho. Alimenta
   `driver_events` para Analytics/Dossiês/Relatórios.

---

## 10. Regras de negócio — Monitor

### 10.1. Pipeline de processamento (Sascar — referência)

Implementado em `src/platforms/sascar/parser.js`. Ordem:

1. **Falso positivo** removido (`stats.falsosPositivos`).
2. **Baixa velocidade** (`< 10 km/h`) removido (`stats.filtradosPorVelocidade`).
3. **Agrupamento por placa**.
4. **Classificação**: INTERVENÇÃO (Bocejo, Olho fechado, Distração Genérica),
   TÉCNICO (câmera obstruída, perda de vídeo, sem motorista), REPORTAR (resto).
5. **Filtro de histórico**: eventos anteriores à última ação registrada para a
   placa são removidos (`stats.filtradosPorHistorico`).
6. **Regra Dinon (auto-descarte)**: transportadoras com "dinon" têm fumo
   auto-descartado em background (`stats.autoDescartes`).
7. **Severidade** = max(Gravíssimo > Grave > Normal) entre intervenção+reportar.
8. **Turno predominante** (diurno 06–18 h, noturno 18–06 h).

OmniLink e Maxtrack seguem o mesmo contrato com colunas/taxonomia próprias.

### 10.2. Ações no Monitor

Mutações via `useDriversQueue` (local + DB + realtime): `replaceDrivers`
(upload/scrape, com DELETE escopado ao `platform_id`), `updateDriver` (zera
bucket após intervenção/reportar/descarte), `bulkUpdateDrivers` (descarte em
massa), `clearDrivers` (limpa fila). Placas com todos os buckets zerados
permanecem na tabela (saem da UI por filtro).

### 10.3. Critérios de notificação / badge

`notificarCriticos()` dispara Notification API para drivers com `alertas >= 5`.
No badge da Sidebar, Maxtrack conta a partir de **8** alertas; demais
plataformas a partir de **5**.

---

## 11. Integração Google Sheets (bidirecional)

- **Escrita** (`append-sheet`): "Inserir na planilha" e a trigger da
  `intervencoes_sheet`. Range de detecção `A:H`; coluna I com fórmula de status;
  aplica `resolveAlias()` (de-para). **Auth em camadas** (ver
  [AUDITORIA-2026-05-29.md](./AUDITORIA-2026-05-29.md)): `service_role` exata →
  `TRIGGER_SECRET` (env, comparação exata) → literal legado `SYSTEM_TRIGGER`
  (só enquanto `TRIGGER_SECRET` não estiver provisionado) → sessão do operador.
  > ⚠️ Pendência: provisionar `TRIGGER_SECRET` no Vault + env da função para
  > fechar a brecha. Detalhes na auditoria.
- **Leitura** (`read-sheet`): lê `A:P` de abas mensais (mês atual + anterior),
  ignora linhas vazias, normaliza erros de fórmula, devolve `idPlataforma`
  (coluna P) e `_row`. Usada pela Planilha Embedded e pelo histórico do Monitor.
- Backup: `google-apps-script.js` aceita o mesmo payload da `append-sheet`.

---

## 12. Integração automática Sascar (Bookmarklet)

Além do upload manual (`spreadsheet`), a Sascar pode ser integrada por **scraper
com bookmarklet** (beta), porque o portal exige CAPTCHA no login. O operador faz
login no portal, clica o bookmarklet (salvo na barra de favoritos) e o
`AUTH_TOKEN` do `localStorage` é enviado via `#sascar-token=…`, capturado por
`SascarTokenHandler` em `App.jsx` e salvo em `profiles.sascar_token`. O MedNet
renova o token automaticamente; se expirar (idle > 30 min), pede novo clique.

**Mapeamento de alarmes** (`categoryInfoList[0].categoryId`): `100574`
INTERVENÇÃO · `100575` REPORTAR · `100573` TÉCNICO. Severidade por `levelId`:
`15` Gravíssimo · `14` Grave · `13` Normal. Velocidade em 1/10 km/h; `< 10 km/h`
filtrado. Falsos positivos excluídos no servidor (`alarmLevelIds: '15,14,13'`).
Guia completo de plataformas em [docs/PLATFORMS.md](./PLATFORMS.md).

---

## 13. Integrações de IA

Dois usos, ambos via edge function (Deno) lendo provedor/modelo de
`app_settings.ai_config` e a chave de `ai_credentials`:

- `generate-dossier-report` — laudo clínico-operacional do motorista (Dossiês).
- `generate-report` — relatório executivo por transportadora (Relatórios IA).

Provedores: **Anthropic (Claude)** e **Google (Gemini)**. A configuração padrão
fica em `/admin/ia`; cada gerador pode sobrescrever provedor/modelo na hora.

---

## 14. WhatsApp (Cloud API / Meta)

Toda a comunicação passa pelo Express (`server/whatsapp-routes.js`):

- `GET/POST /api/whatsapp/credentials` — token Meta (admin).
- `GET /api/whatsapp/templates` — templates homologados.
- `POST /api/whatsapp/send` — dispara template (com variáveis) → grava
  `whatsapp_dispatches` + custo estimado.
- `GET /api/whatsapp/chats`, `/chats/:id/messages`, `/chats/:id/read`,
  `/chats/:id/send`, `/chats/open` — inbox.
- `GET/POST /api/whatsapp/webhook` — verificação (verify token
  `mednet_verify_token`) e recebimento de mensagens/status da Meta.

Regra de negócio central: **janela de 24 h** — fora dela, só template homologado
reabre a conversa (ver §5.14).

---

## 15. Modo manutenção

Admins ativam em `/admin/sistema/manutencao` (atualiza `app_settings.maintenance`).
Realtime propaga; não-admins veem `MaintenancePage`; admins seguem com a UI e um
chip "Plataforma em manutenção" no rodapé.

---

## 16. Personalização visual

Preferências no popover ⚙ do Dashboard, persistidas em `localStorage` com
prefixo `mn_`:

| Chave             | Valores                                                       | Aplicado por                          |
| ----------------- | ------------------------------------------------------------- | ------------------------------------- |
| `theme`           | `light` \| `dark` (default `dark`)                            | `useApp` + `data-theme` no `<html>`   |
| `density`         | `compact` \| `normal` \| `cozy`                               | `useApp` + `data-density`             |
| `accent`          | `vinho`/`roxo`/`azul`/`verde`/`ambar`/`rosa`                  | `useApp` + `applyAccent()`            |
| `platformId`      | `sascar` \| `maxtrack` \| `omnilink`                          | Monitor (adapter ativo)               |
| `mn_dash_*`       | SLA, compare, hourly, transp, classif, tech, exec, layout, tv | Dashboard (popover ⚙)                 |
| `mn_dash_filters` | JSON dos filtros do Dashboard                                 | Dashboard (FilterBar)                 |
| `mednet_analytics_*` | mês, comparação, severidade, datas, fontes                | Analytics                             |

---

## 17. PWA

`vite-plugin-pwa` gera service worker e manifest. `usePWA` expõe o
`beforeinstallprompt` para o botão "Instalar App" na Sidebar.

---

## 18. Atalhos de teclado

| Atalho          | Ação                        |
| --------------- | --------------------------- |
| `⌘K` / `Ctrl+K` | Foca busca global (sidebar) |
| `Esc`           | Fecha modais / paleta       |

---

## 19. Variáveis de ambiente

**Frontend** (`.env`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` — URL do servidor Express de Analytics/WhatsApp.

**Servidor Express** (`server/.env`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT`
- `ANALYTICS_ENGINE` (opcional; `rpc` por padrão no código, `js` força fallback).

**Edge Functions:** secrets via Supabase CLI (`TRIGGER_SECRET`, credenciais
Google, etc.).

---

## 20. Scripts npm

```bash
# Frontend
npm run dev        # Servidor dev (Vite)
npm run build      # Build de produção
npm run preview    # Servir o build
npm run lint       # ESLint
npm test           # Vitest (parsers de plataforma + fatigueParser)

# Backend
cd server && npm start   # Servidor Express
```

---

## 21. Roadmap / status das plataformas

**Monitor (realtime):**

| Plataforma | Modo                                | Status                     |
| ---------- | ----------------------------------- | -------------------------- |
| Sascar     | spreadsheet + scraper (bookmarklet) | ✅ ativa · 🧪 scraper beta |
| Maxtrack   | spreadsheet                         | ✅ ativa                   |
| OmniLink   | spreadsheet                         | ✅ ativa                   |
| Autotrack/Trimble/Cobli/Horizon | a definir              | 📋 planejadas              |

**Analytics (import):** MaxTrack, Sascar, Sascar JD, Sighra, Horizon, AutoTrac,
OmniLink, Trimble — todas com detecção de layout no `fatigueParser.js`.

Para integrar uma plataforma nova no Monitor: ver [docs/PLATFORMS.md](./PLATFORMS.md).

---

## 22. Changelog

### 2026-06-26/29 — Monitor, Analytics, MedBot, custom_rules, VPS final

Detalhes completos em [AUDITORIA-VPS-2026-06-30.md](./AUDITORIA-VPS-2026-06-30.md).

- **Monitor** — `categoria_bucket` agora preenchido em `fatigueParser.js` (`getBucket()`); eventos voltaram a aparecer nas abas Intervenção/Reportar/Só técnico.
- **Analytics** — Sascar detectada por assinatura de coluna (independente do nome do arquivo); fallback de nome corrigido para `platform_id='auto'`.
- **Regra Dinon/fumo** — removida do hardcode de `sascar/index.js` para a tabela `custom_rules` (configurável pelo admin). `applyCustomRules()` em `src/platforms/shared/customRules.js`; `useOpenAlerts.js` aplica após o aggregate.
- **MedBot** — RPC `aggregate_driver_events` criada no banco e exposta como tool (`tool-schemas.js`, `tool-handlers.js`). Prompt atualizado: rankings usam esta RPC em vez de `query_database_records`. Gráficos inline melhorados (case-insensitive, fallback de bloco ``` simples, guard no `GlobalAiChat`).
- **Migrations VPS** aplicadas via Studio e MCP: `platform_rules`, `custom_rules`, `ai_chat_*`, `thread_id`, Realtime `driver_events`, `atendimentos.bucket` + `norm_clf` + `get_open_alerts`, `drivers_queue` dropada.
- **Bug pendente (infra):** Storage do VPS com `JWT_SECRET` errado → signed URLs do MedBot retornam `InvalidJWT`. Fix é infra (alinhar env do container Storage no Coolify). Ver §2 do doc de auditoria.

### 2026-06-25 — Reestruturação de rotas, roles e remoção do RPA

- **React Router**: navegação por URL; `App.jsx` com `<Routes>` + lazy/Suspense;
  `NAV_ITEMS` ganharam `path`. Fim do `activePanel`.
- **Hierarquia de roles** `operador < lider < admin` (`ROLE_LEVEL`); guards
  `RoleGuard`/`AdminGuard`; Sidebar filtra por `minRole`. Cross-Check e Automações
  viraram líder+.
- **Admin decomposto**: `Admin.jsx` removido; `/admin` com `AdminLayout` +
  sub-rotas (analytics, relatorios, **auditoria**, equipe, integracoes, ia,
  sistema). Auditoria com paginação.
- **RPA removido**: `rpa_credentials` dropada, `rpa_config` apagada, RpaCard
  retirado de Automações/Monitor (migration `20260625102000`).

### Antes (já consolidado, agora documentado aqui)

- **Backend Express** (`server/`) para Analytics + WhatsApp.
- **Analytics reescrito** sobre `driver_events` (import de 8 plataformas via
  `fatigueParser.js`, agregação por RPC + rollup `analytics_daily`, comparação
  plataformas/empresas, export CSV/HTML). Ver
  [analytics-rpc-progress.md](./analytics-rpc-progress.md).
- **Planilha Embedded** (`/planilha`, `intervencoes_sheet`), **Dossiês Clínicos**
  (`/dossies`, `driver_health` + telemetria + laudo IA), **Relatórios IA**
  (`/admin/relatorios`).
- **WhatsApp Cloud API** (chat, disparos, templates, janela 24 h, webhook) +
  tabelas `whatsapp_*`.
- **IA** (Anthropic/Gemini) via `ai_credentials` + `app_settings.ai_config`.
- **OmniLink** adicionada ao Monitor (3ª plataforma realtime).
- Edge functions novas: `read-sheet`, `generate-report`, `generate-dossier-report`.
- Auditoria de código/segurança e correções da Planilha Embutida em
  [AUDITORIA-2026-05-29.md](./AUDITORIA-2026-05-29.md) (inclui a pendência do
  `TRIGGER_SECRET`).

### Known limitations

- **Storage VPS:** signed URLs do MedBot (`ai-reports`) retornam `InvalidJWT` — JWT_SECRET do container Storage fora de sincronia. Fix: infra (Coolify → alinhar env). Ver `AUDITORIA-VPS-2026-06-30.md`.
- **`TRIGGER_SECRET` não provisionado:** brecha de auth em `append-sheet` continua aberta (modo de compatibilidade `SYSTEM_TRIGGER` ativo). Ver `AUDITORIA-2026-05-29.md`.
- **`/api/whatsapp/*` sem auth:** rotas WhatsApp do Express não têm middleware de autenticação.
- **`GOOGLE_SERVICE_ACCOUNT` não setado no VPS:** `read-sheet`/`append-sheet` sem credencial Google → Planilha Embedded sem sync.
- Planilha Embedded: excluir linha não propaga delete para o Google Sheets.
- `append-sheet` ainda lê o range inteiro por inserção (O(n)).
- Modo `compare` do Analytics multi-plataforma já tem caminho RPC; conferir
  paridade ao evoluir.
- Status pill do Topbar ("Fadiga Zero · Online") segue hardcoded.
