# MedNet · Fadiga Zero — Documentação do Projeto

Plataforma operacional da equipe **Fadiga Zero** do GRUPO MedNet. Centraliza o
monitoramento de motoristas, a fila de intervenções, scripts de contato,
agenda, base de conhecimento e administração da equipe.

---

## 1. Visão geral

| Item | Valor |
|---|---|
| Empresa | GRUPO MedNet (Medicina e Seg. do Trabalho) |
| Setor   | Fadiga Zero |
| Produto | SPA React/Vite com PWA |
| Backend | Supabase (Auth + Postgres + Storage + Edge Functions) |
| Integração externa | Google Sheets (compliance/audit trail) |
| Plataformas de monitoramento ativas | **Sascar** (Michelin Smart Camera) · **Maxtrack** (Telemetria + IA) |
| Plataformas futuras (planejadas) | Autotrack, Trimble, Cobli, Horizon |

A aplicação é uma SPA sem roteamento de URL — a navegação acontece via o
`activePanel` no contexto global, alternando os painéis.

---

## 2. Stack técnica

- **Frontend:** React 19, Vite 8, React-hooks, Recharts (gráficos), TipTap
  (editor rich-text do Workspace), xlsx (parser de planilhas), `vite-plugin-pwa`
  (instalável + service worker).
- **Backend:** Supabase JS SDK (`@supabase/supabase-js`). Postgres com Realtime
  para sync de listas. Auth via e-mail + senha, com fluxo de convite.
- **Edge Functions (Deno):**
  - `append-sheet`: registra atendimento em planilha Google.
  - `invite-user`: envia convite a novos operadores (apenas admin).
  - `pull-sascar`: busca alarmes do dia via API Sascar usando token do operador (bookmarklet).
  - `pull-maxtrack`: autentica no portal Maxtrack com credenciais do operador e busca eventos do dia em janelas de 15 min paralelas.
- **Google Apps Script:** Webhook de backup que reaproveita o payload da
  `append-sheet`.

---

## 3. Estrutura de pastas

```
src/
├── App.jsx               # Shell, autenticação, painel ativo, notifier, SascarTokenHandler
├── main.jsx              # Bootstrap React + providers globais
├── context.jsx           # AppProvider — UI state, fila, preferências, platformId
├── data.js               # Constantes estáticas (NAV, títulos, defaults, mocks)
├── utils.js              # Helpers genéricos (iniciais, datas, accent)
├── supabase.js           # Cliente Supabase + flag de configuração
├── parseSheet.js         # Wrapper @deprecated p/ adapter Sascar (compat)
├── auth/                 # AuthContext, LoginPage, SetPasswordPage
├── components/           # Topbar (com brand), Sidebar, ErrorBoundary, MaintenancePage
├── hooks/                # Hooks de domínio (atendimentos, drivers_queue, templates, …)
├── lib/                  # uploadImage.js
├── modules/              # Painéis principais (Dashboard, Monitor, Agenda, ...)
│   ├── dashboard/        # Subcomponentes + CSS do Dashboard (gestão à vista)
│   │   ├── components.jsx    # KPI, FilterBar, CriticalSLA, ProductivityRanking, etc.
│   │   └── dashboard.css     # Estilos isolados do painel
│   ├── monitor/          # Subcomponentes do Monitor
│   └── crosscheck/       # Subcomponentes do Cross-Check
│       ├── utils.js          # Funções puras: normalize, parsers, buildStats
│       ├── SideUploadCard.jsx
│       ├── MatchCard.jsx
│       ├── CrossCheckFilters.jsx
│       └── CarrierStats.jsx
├── platforms/            # ⭐ Camada de adapters de plataforma
│   ├── base.js           # Contrato + helpers (emptyDriver/emptyStats)
│   ├── index.js          # Registry, getPlatform, detectPlatform
│   ├── shared/           # Utilitários compartilhados entre adapters
│   │   ├── normalize.js
│   │   ├── parsers.js
│   │   └── history.js
│   ├── sascar/           # Adapter Sascar (spreadsheet + scraper)
│   │   ├── index.js      # Metadata + blocos spreadsheet e scraper
│   │   ├── columns.js    # Mapa de colunas e taxonomia
│   │   └── parser.js     # Parser xlsx/csv comentado
│   ├── maxtrack/         # Adapter Maxtrack (scraper)
│   │   ├── index.js      # Metadata + bloco scraper (chama pull-maxtrack)
│   │   ├── columns.js    # Categorias, severidades e taxonomia
│   │   └── parser.js     # parseApiResponse — transforma resposta da Edge Function
│   └── _template/        # Esqueleto para novas plataformas
│       └── index.js
└── styles/               # CSS tokens + layout + módulos

supabase/
├── migrations/
│   ├── 20260507000000_initial_schema.sql          # Baseline (atendimentos, templates, …)
│   ├── 20260518211646_drivers_queue.sql           # Fila compartilhada com realtime
│   └── …outras migrations incrementais
└── functions/
    ├── append-sheet/index.ts   # Append Google Sheets
    ├── read-sheet/index.ts     # Leitura das abas mensais do Sheets
    ├── invite-user/index.ts    # Convite de operadores
    ├── pull-sascar/index.ts    # Busca automática Sascar (alarm/page)
    └── pull-maxtrack/index.ts  # Busca automática Maxtrack (event/events/load)
```

---

## 4. Navegação e painéis (`NAV_ITEMS` em `src/data.js`)

| id | Label | Grupo | Apenas admin? |
|---|---|---|---|
| `dashboard` | Dashboard | Operação | — |
| `monitor`   | Monitor de Frota | Operação | — |
| `crosscheck` | Cross-Check | Operação | — |
| `agenda`    | Agenda | Operação | — |
| `templates` | Templates | Conhecimento | — |
| `workspace` | Workspace | Conhecimento | — |
| `notas`     | Bloco de Notas | Conhecimento | — |
| `links`     | Links Rápidos | Conhecimento | — |
| `perfil`    | Meu Perfil | Conta | — |
| `admin`     | Administração | Conta | ✅ |
| `analytics` | Analytics | Conta | ✅ |

Busca global (⌘K / Ctrl+K) na Sidebar pesquisa entre páginas e motoristas
(por nome ou placa) na fila atual.

---

## 5. Domínios funcionais

### 5.1. Dashboard — Gestão à Vista (`modules/Dashboard.jsx` + `modules/dashboard/`)

Visão de diretoria, foco em macros do dia + drill rápido. Realtime end-to-end
(fila de motoristas + atendimentos da equipe) — qualquer ação de qualquer
operador propaga em <2 s pros 6 dashboards abertos.

**Subcomponentes** (todos em `modules/dashboard/components.jsx`):
`KPI`, `FilterBar`, `CriticalSLA`, `ProductivityRanking`, `TechAlerts`,
`ClassificationBreakdown` (donut Tipo × Resultado), `TransportadoraRanking`,
`HourlyActivity` (24 h), `Banner`, `Section`, `AnimatedNumber`, `Donut` interno.
CSS isolado em `dashboard/dashboard.css`.

#### KPIs (4 cards no topo)

| KPI | Cálculo |
|---|---|
| **Volume do dia** | `fechados + emAberto` (hero, accent laranja, mostra % concluído) |
| **Fechados hoje** | Atendimentos `tipo ∈ (intervencao, reportar)` de hoje (exclui `descarte`/`limpeza`) |
| **Em aberto agora** | Motoristas com `alertas > 0` OU `reportaveis > 0` (técnico não conta) |
| **Reincidência** | Pos-positivos hoje (placas com intervenção nos últimos 30 d) |

Cada KPI tem **delta vs. ontem** (se toggle "Comparar com ontem" estiver
ligado) e **drill inline** ao clicar (abre um painel com breakdown por
tipo/resultado/operador/transportadora).

#### Seções abaixo dos KPIs

- **Banner SLA vencido** — só aparece quando algum crítico passa do `slaLimit`
- **Pulso da operação** (grid 2 colunas):
  - Coluna principal: `Críticos & SLA` (lista expansível com timeline de eventos) + `Atividade por hora` (24 barras, eixo X em horas pares)
  - Coluna lateral: `Tipo & Resultado` (donut), `Atenção técnica`, `Transportadoras` (top 6 ranqueadas)
- **Produtividade da equipe** — ranking por operador com volume × qualidade (taxa de reincidência destacada)

#### Filtros (`FilterBar`)

Todos os filtros cabeiam **toda** a página (KPIs, drills, cards, ONTEM). Os
counts dos chips são **sempre absolutos** (independentes da seleção atual) pra
o gestor enxergar o universo antes de filtrar.

| Filtro | Semântica | Afeta |
|---|---|---|
| **Tipo** (fadiga/comportamento) | Fadiga = drivers com `alertas > 0` · Comportamento = drivers só em `reportaveis > 0` | Drivers, atendimentos (intervencao=fadiga, reportar=comportamento), KPIs, donut, hourly, transp, produtividade, ONTEM |
| **Resultado** (positivo/pos-positivo/aberto) | Recorta fechados (não-reinc vs reinc) e liga/desliga contagem de em-aberto | KPIs, donut |
| **Empresa** | Nome da transportadora **após `resolveAlias`** (aliases vêm do Admin). Top 6 viram chips, resto vai pro select "Outras…" | Drivers, atendimentos, tecnicos, ONTEM, transp |
| **Operador** | Lista vem de `useProfiles()` (equipe atual, role ∈ {operador, admin}) — não do histórico de atendimentos | Atendimentos, produtividade, fechados, ONTEM |
| **Período** (hoje/turno) | `hoje` = 00 h → agora · `turno` = janela do turno atual (diurno 06 h–agora ou noturno 18 h–agora, cruzando meia-noite quando a hora < 6) | Atendimentos (timeframe) |

Filtros **persistidos em `localStorage.mn_dash_filters`** — view do gestor
sobrevive a reload e troca de painel. Botão "Limpar filtros" reseta.

#### Tweaks popover (engrenagem na barra de saudação)

Substitui o antigo `TweaksPanel` global (removido). Conteúdo do popover:

| Grupo | Itens |
|---|---|
| **SLA** | Input numérico 5–240 min com -5/+5 |
| **Apresentação** | Comparar com ontem · Modo executivo (esconde Hourly/Tech/Transp, infla KPIs) |
| **Layout** | Balanceado · Cinema (1 coluna) · Compacto (2 colunas com cards menores) |
| **Seções visíveis** | Toggle individual: Hourly, Tipo & Resultado, Atenção técnica, Transportadoras |
| **Aparência** | Tema (claro/escuro) · Densidade (compacta/normal/espaçada) · 6 swatches de accent — todos espelham `useApp()` |
| **Footer** (só admin) | Atalho **Configurar aliases de transportadora** → vai direto pro Admin |

Persistidos em `localStorage`: `mn_dash_sla`, `mn_dash_compare`, `mn_dash_hourly`,
`mn_dash_transp`, `mn_dash_classif`, `mn_dash_tech`, `mn_dash_exec`,
`mn_dash_layout`, `mn_dash_tv`. Tema/accent/densidade reusam as chaves globais
de `context.jsx`.

#### Modo TV (`body.dash-tv-mode`)

Botão dedicado na barra (`ti-layout-sidebar-left-collapse`). Esconde a sidebar
e infla `dg-kpi-value` pra ~48 px (`is-hero` ~60 px). CSS em
`dashboard.css §body.dash-tv-mode`.

#### Modo Executivo (`body.dash-exec-mode`)

Toggle no Tweaks. Esconde Hourly/Tech/Transp, infla KPIs ainda mais (~56 px,
hero ~68 px). Mostra só macros + críticos + produtividade.

#### "Atualizado há X min"

Indicador na barra de saudação derivado do `max(driversLastChangeAt,
lastAtendimentoAt)`. Atualiza junto com o clock de 30 s. Formatos: `agora`
(< 1 min), `X min` (< 60), `Xh` (< 24 h), `Xd`.

#### Topbar do projeto (estendida hoje)

- **Brand integrado**: SVG M + "GRUPO MedNet" à esquerda do título (mesma marca do sidebar, pra reforço quando em Modo TV)
- **Turno dinâmico** no breadcrumb: "Visão da diretoria · turno diurno/noturno" calculado por `new Date().getHours()` (diurno 06–18)
- **Dedup de data**: `fmtDate()` saiu do breadcrumb da topbar; agora aparece só na barra de saudação do Dashboard

#### DEV mocks

`Dashboard.jsx` define `MOCK_DRIVERS` + `MOCK_HISTORY` (~70 motoristas + ~250
atendimentos sintéticos) usados só quando `import.meta.env.DEV && driversReal.length === 0`. Vite faz tree-shake em produção (`import.meta.env.DEV = false`), então a build de prod **não contém os mocks** (verificado no build).

### 5.2. Monitor de Frota (`modules/Monitor.jsx`)
Núcleo operacional. Recebe a entrada da plataforma (atualmente upload de
planilha Sascar) e organiza em quatro abas:

| Aba | Conteúdo |
|---|---|
| **Intervenção** | Drivers com eventos de fadiga/distração (Bocejo, Olho fechado, Distração Genérica). Ações: histórico, template, inserir-na-planilha, descartar. |
| **Reportar à empresa** | Drivers com eventos reportáveis. Ações: histórico, template, reportar, descartar. |
| **Só técnico** | Drivers com apenas eventos técnicos (câmera obstruída, perda de vídeo). Ação: descartar. |
| **Histórico** | Atendimentos passados, com filtros por período, tipo e busca, e exportação CSV. |

Filtros: turno, severidade, transportadora, evento (todos dinâmicos por
plataforma). **Presets de filtro** salvos em `localStorage` (`mn_filter_presets`) — até 5 combinações nomeadas, aplicadas com um clique.

**Badges por motorista no DriverCard:**

| Badge | Cor | Origem |
|---|---|---|
| Reincidente há Xd | Danger/Warning | Supabase — atendimento nos últimos 30 dias |
| Planilha · dd/mm · Realizado/Pendente | Success/Warning | Google Sheets — entrada no mês atual ou anterior |

**Descarte com motivo** — ao clicar em descartar, um modal solicita o motivo (falso positivo, câmera com falha, etc.) antes de registrar. O motivo é salvo no campo `obs` do atendimento.

**Exportação da aba ativa** — botão "Exportar" na barra de abas gera CSV dos motoristas visíveis na aba atual (Intervenção, Reportar ou Só técnico).

Sub-arquivos:
- `monitor/UploadArea.jsx` — status bar, seletor de plataforma, drop zone, KPIs
- `monitor/MonitorFilters.jsx` — filtros + presets de filtro
- `monitor/DriverCard.jsx` — cartão de cada motorista com badges (reincidência + planilha)
- `monitor/MonitorModals.jsx` — modal de template + dossiê do motorista
- `monitor/HistoryTab.jsx` — aba de histórico com filtros e CSV
- `monitor/utils.jsx` — helpers (sevClass, applyTemplate, exportCSV)

### 5.3. Cross-Check (`modules/CrossCheck.jsx` + `modules/crosscheck/`)

Ferramenta de comparação cruzada de alertas entre duas plataformas de monitoramento. O operador carrega uma planilha por plataforma (`.xlsx`, `.xls`, `.csv`) e o módulo cruza os registros automaticamente.

**Motor de matching** (`crosscheck/utils.js`):

| Conceito | Descrição |
|---|---|
| Match por placa | Eventos cujas placas normalizadas coincidem nas duas fontes |
| Match por motorista | Eventos cujos nomes normalizados coincidem e não estão cobertos por match de placa |
| Divergência | Matches com contagem de ocorrências diferente entre as fontes |

Normalização resistente a acentos, maiúsculas/minúsculas e separadores em todos os campos.

**Recursos:**
- **Carrier fallback** — campo "Transportadora" na planilha da Fonte 2 pode ser preenchido manualmente quando a planilha não possui coluna própria; aplicado via `useEffect` ao alterar o campo.
- **Filtro de período** — intervalo de datas (detecta automaticamente se as planilhas têm coluna de data).
- **Filtro de transportadora** — clique em qualquer item da lista de transportadoras para filtrar os matches; badge ativo com botão de remoção.
- **Estatísticas de transportadora** — ranking por plataforma (top 6 + contagem de outras).
- **Duplicados internos** — detecta placas e motoristas que aparecem mais de uma vez dentro da mesma planilha (top 5).
- **Export CSV** — dois modos: todos os resultados filtrados ou somente divergências; BOM UTF-8; colunas transportadora e data incluídas.

**Arquivos do módulo:**

| Arquivo | Responsabilidade |
|---|---|
| `CrossCheck.jsx` | Orquestrador: estado, `useMemo`, handlers, JSX estrutural |
| `crosscheck/utils.js` | Funções puras: normalize, parsers de data, `buildStats`, `buildCarrierStats`, `buildDuplicateStats` |
| `crosscheck/SideUploadCard.jsx` | Área de upload com spinner de loading e metadados do arquivo |
| `crosscheck/MatchCard.jsx` | Card de resultado individual com colunas lado a lado e badge "Match perfeito" |
| `crosscheck/CrossCheckFilters.jsx` | Barra de filtros: período, tipo, ordenação, divergências, badge de transportadora |
| `crosscheck/CarrierStats.jsx` | Painéis de transportadoras e duplicados internos por plataforma |

### 5.4. Agenda (`modules/Agenda.jsx`)
Lembretes com data, hora, ícone, prioridade urgente e detalhes opcionais.
Filtros: hoje, futuros, todos. Notificações via Notification API quando o
horário chega.

### 5.5. Templates (`modules/Templates.jsx`)
Scripts reutilizáveis para WhatsApp. Tags: `contato`, `questionario`, `alerta`,
`encerramento`. Variáveis built-in: `[NOME]`, `[PLACA]`, `[TRANSPORTADORA]`,
`[HORA]`, `[SAUDACAO]`. Variáveis customizadas em `localStorage`.
Drag-reorder, copy-to-clipboard.

### 5.6. Workspace (`modules/Workspace.jsx` + `WorkspaceEditor.jsx`)
Wiki interna com TipTap. Suporta upload de imagens para o bucket
`workspace-images` (Supabase Storage). Categorias: `protocolos`, `sistemas`,
`config`. Favoritos, busca e drag-reorder.

### 5.7. Bloco de Notas (`modules/Notes.jsx`)
Notas pessoais (privadas do operador) ou compartilhadas (toda a equipe).
Auto-save com debounce de ~800ms.

### 5.8. Links Rápidos (`modules/Links.jsx`)
Atalhos para sistemas. Seções `interno` / `externo`. Personalização de ícone
e paleta de cor por link. Drag-reorder.

### 5.9. Meu Perfil (`modules/Profile.jsx`)
Edita `nome`, `cargo` e senha. E-mail é read-only.

**Seção Integrações** — configuração por operador das plataformas automáticas:

| Integração | O que armazena | Como configurar |
|---|---|---|
| Sascar | `sascar_token` em `profiles` | Arrastar o **bookmarklet** até a barra de favoritos; clicar uma vez por turno após login no portal |
| Maxtrack | `maxtrack_email` + `maxtrack_password` em `profiles` | Preencher e-mail e senha do portal Maxtrack no formulário |

Senha Maxtrack nunca é carregada em estado React — gravada direto no Supabase via `service_role` e lida exclusivamente pela Edge Function `pull-maxtrack`. O token Sascar é enviado via URL hash (`#sascar-token=…`) pelo bookmarklet e capturado por `SascarTokenHandler` em `App.jsx`.

### 5.10. Administração (`modules/Admin.jsx`, admin-only)
Lista a equipe com `last_seen`. Convida operadores por e-mail (chama
`invite-user`). Toggle de manutenção e edição de role/nome/cargo dos colegas.

**Mapeamento de transportadoras** — seção "Mapeamento de transportadoras" permite cadastrar pares Monitor → Planilha (ex.: "LSL Transportes" → "LSL 2W"). Persistido em `app_settings` com chave `carrier_aliases`. Aplicado automaticamente em `postToSheets` via `useCarrierAliases` + `resolveAlias`.

### 5.11. Analytics (`modules/Analytics.jsx`, admin-only)
Janela de 30 dias: top 10 motoristas reincidentes (bar), top 5 transportadoras
(pie), tendência de 14 dias intervenção × descarte (line). **Exportação CSV** — botão "Exportar CSV" no cabeçalho gera arquivo com as três seções (motoristas, transportadoras, série temporal).

---

## 5.12. Integração Google Sheets bidirecional

### Escrita (`supabase/functions/append-sheet`)
Acionada em "Inserir na planilha". Usa JWT de service account para autenticar na Sheets API.

- **Range de detecção**: `A:H` — evita que a fórmula `=SE(ÉCÉL.VAZIA(N:N);"NÃO";"SIM")` pré-preenchida em ~1000 linhas da coluna I desvie o ponto de inserção para o final dessas linhas.
- **Coluna I**: escrita com a fórmula idêntica às demais linhas — status auto-calculado para o novo registro sem intervenção manual.
- **Mapeamento de transportadora**: aplica `resolveAlias()` antes de enviar, usando os aliases cadastrados em `app_settings.carrier_aliases`.

### Leitura (`supabase/functions/read-sheet`)
Nova Edge Function. Lê uma ou mais abas mensais (padrão: mês atual + anterior).

- **Detecção de linhas vazias**: ignora linhas onde empresa, colaborador e placa estão todos vazios — resistente à fórmula da coluna I que preenche linhas sem dados reais.
- **Erros de fórmula**: `#N/A`, `#VALOR!`, `#REF!` etc. são normalizados para string vazia.
- **Ordenação**: última linha inserida na aba aparece primeiro (`.reverse()` por aba + sort por data descendente entre meses).
- **Query param**: `?meses=MARÇO 2025,ABRIL 2025` para abas específicas.

### Frontend
- `hooks/useSheetHistory.js` — hook lazy; `load()` acionado sob demanda.
- **HistoryTab** — botão "Planilha Sheets" no histórico carrega dados sob demanda, com paginação de 15 itens e busca por colaborador/placa/empresa.
- **DriverCard** — badge "Planilha · dd/mm · Realizado/Pendente" para motoristas com entrada no Sheets; dados carregados em background ao montar o Monitor.

---

## 5.13. Integração automática Sascar (Bookmarklet)

Além do upload manual de planilha (modo `spreadsheet`), a Sascar pode ser
integrada de forma automática via **scraper com bookmarklet** — sem necessidade
de instalar nada, sem alteração de rede corporativa.

### Por que bookmarklet?

O portal Sascar (`smartcamera.michelin.com`) exige CAPTCHA no login, o que
impede qualquer automação de credenciais. A solução adotada é ler o
`AUTH_TOKEN` que o portal já grava em `localStorage` após o operador fazer
login normalmente. Esse token é enviado ao MedNet com um único clique.

### Como funciona (visão do operador)

1. **Início do turno** — o operador abre o portal Sascar no navegador e faz
   login normalmente (usuário + senha + CAPTCHA).
2. **Um clique no bookmarklet** — o favorito (salvo na barra do navegador) lê
   o `AUTH_TOKEN` do `localStorage` do portal e o envia de forma segura à
   Edge Function `sascar-token` do MedNet.
3. **Pronto.** A partir daí o Monitor passa a buscar os alertas automaticamente,
   sem mais uploads manuais durante aquele turno.

### Como obter o bookmarklet

Acesse **Meu Perfil → Integrações → Sascar** dentro do MedNet. O código do
bookmarklet é exibido pronto para arrastar até a barra de favoritos do
navegador (ou copiar e criar um favorito manualmente).

### Renovação automática do token

O `AUTH_TOKEN` da Sascar expira em **30 minutos de inatividade**. O MedNet
chama automaticamente o endpoint de refresh
(`/gateway/base-server-service/api/v1/user/refresh`) antes do vencimento,
mantendo a sessão ativa enquanto o operador estiver trabalhando. Não é
necessária nenhuma ação enquanto o turno estiver em andamento.

### Token expirado (idle > 30 min)

Se o operador ficar mais de 30 minutos sem nenhuma atividade no MedNet (e o
refresh automático não for suficiente), o sistema exibe um **banner de aviso**
solicitando que o bookmarklet seja clicado novamente. O processo é idêntico ao
início do turno: abrir o portal Sascar (que mantém a sessão do navegador) e
clicar o favorito.

### Endpoints utilizados

| Finalidade | Endpoint |
|---|---|
| Salvar token no MedNet | Edge Function `pull-sascar` (o token é capturado via `#sascar-token=…` na URL e salvo por `SascarTokenHandler` em `profiles.sascar_token`) |
| Renovar token | `POST /gateway/base-server-service/api/v1/user/refresh` |
| Listar alarmes | `POST /gateway/report/shipper/alarm/page` |
| Detalhes de evidências | `POST /gateway/report/shipper/evidence/by/alarm/list` |

> O login direto (`/gateway/base-server-service/api/v1/user/login`) **não é
> usado** — é bloqueado por CAPTCHA server-side e não faz parte do fluxo.

### Mapeamento de alarmes (Sascar API)

A classificação usa `categoryInfoList[0].categoryId` (mais confiável que `alarmType`):

| `categoryId` | Categoria MedNet |
|---|---|
| `100574` | INTERVENÇÃO (Fadiga) |
| `100575` | REPORTAR (Distração / Comportamento) |
| `100573` | TÉCNICO (câmera/vídeo) |

Severidade via `levelInfo.levelId`:

| `levelId` | Severidade |
|---|---|
| `15` | Gravíssimo |
| `14` | Grave |
| `13` | Normal |

Velocidade: campo `speed` em **1/10 km/h** (ex: `620` → 62 km/h). Eventos com `speed < 100` (< 10 km/h) são filtrados.

Turno em BRT: `((startTime_utcHour - 3) + 24) % 24` — diurno 06–18 h, noturno demais.

Falsos positivos: **excluídos pelo servidor** via filtro `alarmLevelIds: '15,14,13'` no payload; `stats.falsosPositivos` sempre retorna 0.

---

## 5.14. Integração automática Maxtrack (Scraper)

A Maxtrack é integrada via **scraper server-side** — sem bookmarklet. O operador cadastra suas credenciais uma única vez em **Meu Perfil → Integrações → Maxtrack** e o MedNet faz login automaticamente a cada busca.

### Como funciona

1. Operador salva e-mail e senha Maxtrack em **Meu Perfil → Integrações**.
2. No Monitor, seleciona a aba Maxtrack e clica **"Buscar eventos"**.
3. A Edge Function `pull-maxtrack` autentica em `POST /security/login` (sem CAPTCHA), extrai `PLAY_SESSION` cookie e `empresa.uid` (`cco`) da resposta.
4. Divide o dia em **96 janelas de 15 minutos** e busca todas em paralelo (`Promise.all`) via `POST /event/events/load`.
5. Deduplica eventos por `_id` (bordas de janelas adjacentes podem repetir).
6. Devolve o payload ao adapter `maxtrack/parser.js` para transformação no formato canônico.

### Por que janelas de 15 min?

A API `/event/events/load` retorna no máximo ~30 eventos por chamada. Janelas de 15 min garantem que nenhuma janela estoure esse limite mesmo nos horários de pico.

### Endpoints utilizados

| Finalidade | Endpoint |
|---|---|
| Autenticação | `POST /security/login` |
| Eventos do dia | `POST /event/events/load` |

### Categorias de evento (Maxtrack)

| `categoryId` | Categoria |
|---|---|
| `57` | Análise de Fadiga (Global) → INTERVENÇÃO |
| `63` | Análise desatenção/fadiga (Global) → INTERVENÇÃO |

Severidade via `criticalityLevel.id`:

| `id` | Severidade |
|---|---|
| `4` | Gravíssimo |
| `3` | Grave |
| `2` | Normal (Médio) |

### Modal de credenciais não configuradas

Se o operador tentar buscar eventos Maxtrack sem ter configurado e-mail/senha, um **modal bloqueante** aparece redirecionando para Meu Perfil → Integrações. A busca não pode ser iniciada sem credenciais.

### Sidebar badge

Motoristas Maxtrack aparecem no badge de alertas da sidebar com limiar **≥ 8 alertas** (vs > 5 para Sascar), pois o volume de eventos Maxtrack tende a ser maior.

---

## 6. Modelo de dados (Supabase)

| Tabela | Colunas principais | Observações |
|---|---|---|
| `profiles` | `id`, `nome`, `cargo`, `role`, `last_seen`, `created_at`, `maxtrack_email`, `maxtrack_password`, `sascar_token` | `role ∈ {operador, admin}` · credenciais lidas só via `service_role` |
| `atendimentos` | `id`, `motorista`, `placa`, `transportadora`, `operador_id`, `operador_nome`, `tipo`, `obs`, `hora`, `created_at` | `tipo ∈ {intervencao, reportar, descarte, limpeza}` |
| `templates` | `id`, `tag`, `tag_label`, `title`, `body`, `position`, `created_at` | — |
| `notes` | `id`, `title`, `body`, `is_personal`, `author_id`, timestamps | `is_personal = true` ⇒ só o autor vê |
| `ws_pages` | `id`, `title`, `icon_index`, `category`, `favorite`, `content`, `position`, timestamps | Conteúdo HTML do TipTap |
| `links` | `id`, `section`, `name`, `description`, `url`, `icon`, `bg`, `ic`, `position`, `created_at` | — |
| `reminders` | `id`, `title`, `sub`, `time`, `urgent`, `done`, `reminder_date`, `icon`, `created_at` | — |
| `app_settings` | `key`, `value` (JSON), `updated_at`, `updated_by` | `key='maintenance'` controla lockout · `key='carrier_aliases'` mapeia nomes de transportadoras |
| `drivers_queue` | `id`, `placa` (UNIQUE), `platform_id`, `nome`, `transportadora`, `frota`, `turno`, `alertas`, `tipos` (jsonb), `ultimo_evento`, `reportaveis`, `tipos_reportar`, `ultimo_evento_reportar`, `tecnicos`, `tipos_tecnico` (jsonb), `eventos_detalhados` (jsonb), `severidade`, `loaded_at`, `updated_at`, `updated_by` | 1 linha por placa (cross-platform dedup). Trigger `drivers_queue_touch_updated_at` mantém `updated_at`. `replica identity full` pra DELETE entregar a placa via realtime |

Realtime: `atendimentos`, `templates`, `notes`, `ws_pages`, `links`,
`reminders`, `app_settings`, `drivers_queue`.

#### Sincronização realtime end-to-end

Após a migration `20260518211646_drivers_queue.sql`, a fila de motoristas é
compartilhada entre todos os operadores:

| Hook | Tabela | Eventos escutados |
|---|---|---|
| `useAtendimentos` | `atendimentos` | INSERT (novos atendimentos da equipe) |
| `useDriversQueue` | `drivers_queue` | INSERT/UPDATE/DELETE |
| `useCarrierAliases` | `app_settings` (filter `key=eq.carrier_aliases`) | `*` — aliases recém-salvos no Admin propagam pro Dashboard sem reload |
| `useReminders` / `useTemplates` / `useNotes` / etc. | Cada um na sua tabela | INSERT/UPDATE/DELETE |

`useDriversQueue` faz **backfill automático** no load inicial: se o DB
estiver vazio mas houver cache em `localStorage('mn_drivers_queue')`,
sobe o cache pro DB (cobre casos de upload feito antes da migration ou de
upsert que falhou silenciosamente). Caso contrário, DB é fonte de verdade.

---

## 7. Autenticação e papéis

- Login: e-mail + senha via Supabase Auth.
- Sessões persistidas; convite de usuário usa fluxo "invite" + senha inicial.
- `AuthContext` sincroniza metadata com `profiles`, criando perfil no primeiro
  login.
- Roles:
  - `operador`: acesso a Dashboard, Monitor, Agenda, Templates, Workspace,
    Notas, Links, Perfil.
  - `admin`: tudo acima + Admin + Analytics + toggle de manutenção.

---

## 8. Regras de negócio — Monitor

### 8.1. Pipeline de processamento de planilha (Sascar)

Implementado em `src/platforms/sascar/parser.js`. Ordem das regras:

1. **Falso positivo** — linhas com `Status === 'Falso positivo'` são removidas
   (contabilizadas em `stats.falsosPositivos`).
2. **Baixa velocidade** — linhas com velocidade `< 10 km/h` são removidas
   (`stats.filtradosPorVelocidade`). A coluna de velocidade é localizada por
   match parcial `includes('velocidade')` (case-insensitive).
3. **Agrupamento por `Placa`** — cada placa vira um `driver`.
4. **Classificação dos eventos** por placa:
   - **INTERVENÇÃO**: `Bocejo`, `Olho fechado`, `Distração Genérica` (matchada
     também via combinação `Evento` + `Categoria` para variações).
   - **TÉCNICO**: categoria `Obstrução de Câmera` ou eventos
     `Perda de vídeo` / `Sem motorista`.
   - **REPORTAR**: todo o resto.
5. **Filtro de histórico** — eventos anteriores à última ação registrada para
   a placa são removidos:
   - tipos `intervencao` e `descarte` limpam alertas de intervenção;
   - tipo `reportar` limpa alertas reportáveis;
   - eventos sem data parseável são mantidos (postura conservadora);
   - contabilizados em `stats.filtradosPorHistorico`.
6. **Regra Dinon (auto-descarte)** — transportadoras cujo nome contém
   "dinon" têm eventos de fumo descartados automaticamente. O Monitor registra
   um atendimento `descarte` silencioso em background (`stats.autoDescartes`).
7. **Severidade do driver** = `max(Gravíssimo > Grave > Normal)` entre
   eventos de intervenção + reportar (técnicos não contam para severidade).
8. **Turno predominante** = mais frequente entre os eventos da placa.
   Diurno = 06h–18h, Noturno = 18h–06h.
9. **`ultimoEvento` / `ultimoEventoReportar`** = maior `Hora do evento` de
   cada bucket, para exibição.

### 8.2. Ações no Monitor

Todas as mutações na fila vão pra tabela `drivers_queue` via os métodos do
`useDriversQueue` (expostos pelo contexto). Não há mais `setDrivers` direto —
o Monitor refatorou para chamar o método semântico apropriado, que atualiza
local + DB e propaga via realtime pros outros operadores.

| Ação | Atendimento gerado | Método chamado | Effect no driver |
|---|---|---|---|
| **Upload de planilha** | — (auto-descartes Dinon vão como background) | `replaceDrivers(batch, platformId)` — upsert dos novos + DELETE escopado ao `platform_id` dos sumidos | substitui a fila daquela plataforma |
| **Scrape automático** | — | `replaceDrivers(batch, platformId)` | mesma lógica do upload |
| **Inserir na planilha** (intervenção) | `tipo='intervencao'` + post à `append-sheet` | `updateDriver(placa, {alertas: 0, tipos: []})` | zera o bucket de intervenção |
| **Reportar e remover** | `tipo='reportar'` | `updateDriver(placa, {reportaveis: 0, tiposReportar: []})` | zera o bucket de reportar |
| **Descartar (intervenção/reportar/técnico)** | `tipo='descarte'` | `updateDriver(placa, patch)` com o bucket apropriado | zera o bucket correspondente (linha persiste zerada — não é deletada) |
| **Descarte em massa** | um `tipo='descarte'` por placa | `bulkUpdateDrivers(placas, patch)` | zera o bucket nas placas em lote (`UPDATE … IN`) |
| **Auto-descarte Dinon** | `tipo='descarte'` (background) | (evento removido antes de virar driver) | — |
| **Limpar fila** | nenhum | `clearDrivers()` | `DELETE` em `drivers_queue` (propaga via realtime pros outros operadores) |

Quando uma placa fica com todos os buckets zerados (alertas + reportaveis +
tecnicos = 0), a linha **permanece** em `drivers_queue` (não é deletada). Sai
da UI por ser filtrada em `driversAtivos`, mas serve de referência caso o mesmo
motorista volte a gerar evento (preserva `_loadedAt` original, etc).

### 8.3. Critérios de notificação push

`notificarCriticos()` dispara Notification API para motoristas com
`alertas >= 5` ao final do upload. Necessita `Notification.permission === 'granted'`.

### 8.4. Idade da planilha

A timestamp do último upload é guardada em `localStorage.mn_sheet_loaded_at`.
Um chip ao lado do status mostra a idade colorida:
- `< 30 min` → verde
- `30–60 min` → âmbar
- `>= 60 min` → vermelho

---

## 9. Integração externa — Google Sheets

Edge Function `append-sheet` (autenticada por JWT do operador). Adiciona uma
linha em planilha mensal (`MAIO 2026`, etc.) na planilha
`1Zk8iMPnTw-GkjcK3tHvR4oMFrzqXFaUocF6VWn0yC7s`. Colunas A–P; o operador
preenche `REALIZADO?`, `REALIZADO POR`, `DE REALIZAÇÃO`, `JUSTIFICATIVA`
manualmente depois.

Color coding:
- `GRAVÍSSIMO` → fundo vermelho `#FF9999`
- `GRAVE` → fundo amarelo `#FFD966`

Campo `sistema`: **agora é dinâmico** — vem do adapter da plataforma
(`platform.sistema`). Sascar envia `'SASCAR'`.

Backup: `google-apps-script.js` (Apps Script Web App) aceita o mesmo payload
caso a Edge Function caia.

---

## 10. Modo manutenção

Admins ativam via `Admin` panel → updateia `app_settings.key='maintenance'`.
Realtime propaga; não-admins veem `MaintenancePage`; admins continuam vendo
a UI normal com um chip "Plataforma em manutenção" no rodapé.

---

## 11. Personalização visual

O antigo `TweaksPanel` FAB global foi removido. As preferências visuais agora
moram no **popover ⚙ da barra de saudação do Dashboard** (ver §5.1 Tweaks
popover). Todas seguem persistidas em `localStorage` com prefixo `mn_`:

| Chave | Valores | Aplicado por |
|---|---|---|
| `theme` | `light` \| `dark` (default `dark`) | `useApp` + `data-theme` no `<html>` |
| `density` | `compact` \| `normal` \| `cozy` | `useApp` + `data-density` no `<html>` |
| `accent` | `vinho` \| `roxo` \| `azul` \| `verde` \| `ambar` \| `rosa` | `useApp` + `applyAccent()` que seta vars `--accent-*` |
| `platformId` | `sascar` \| `maxtrack` | Monitor (qual adapter está ativo) |
| `mn_dash_*` | SLA, compare, hourly, transp, classif, tech, exec, layout, tv | Dashboard-only (popover ⚙) |
| `mn_dash_filters` | JSON `{tipo, resultado, empresa, operador, periodo}` | Dashboard (FilterBar) |

Aliases `mode`/`vibe`/`rhythm` foram removidos com a desativação do TweaksPanel
global — não eram aplicados em nenhum CSS ativo do Dashboard novo.

---

## 12. PWA

`vite-plugin-pwa` gera service worker e manifest. `usePWA` expõe o
`beforeinstallprompt` para o botão "Instalar App" na sidebar.

---

## 13. Camada de plataformas (arquitetura)

A pasta `src/platforms/` introduz o padrão **Adapter** para encapsular cada
plataforma de monitoramento. O contrato suporta três modos de ingestão:

- `spreadsheet` (Sascar): operador faz upload de xlsx/csv.
- `scraper` (Sascar bookmarklet + Maxtrack): busca automática via Edge Function.
- `api` (futuro): polling em endpoint REST com autenticação pública.

O Monitor consulta o **registry** (`platforms/index.js`) para descobrir
plataformas, exibe um seletor quando há mais de uma cadastrada, e despacha
o parse para o adapter correto. Todas as Strings que antes diziam "Sascar"
agora vêm da metadata do adapter (`name`, `portalUrl`, `sistema`,
`uploadTitle`, etc.).

📘 **Guia detalhado para adicionar novas plataformas:**
[docs/PLATFORMS.md](./PLATFORMS.md)

---

## 14. Atalhos de teclado

| Atalho | Ação |
|---|---|
| `⌘K` / `Ctrl+K` | Foca busca global (sidebar) |
| `Esc` | Fecha modais |

---

## 15. Variáveis de ambiente

Veja `.env.example`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Edge Functions usam secrets gerenciados via Supabase CLI.

---

## 16. Scripts npm

```bash
npm run dev       # Servidor dev (Vite)
npm run build     # Build de produção
npm run preview   # Servir o build
npm run lint      # ESLint
```

---

## 17. Roadmap / Plataformas futuras

| Plataforma | Modo | Status |
|---|---|---|
| Sascar | spreadsheet + scraper (bookmarklet) | ✅ ativa · 🧪 scraper beta |
| Maxtrack | scraper (credenciais por operador) | 🧪 beta |
| Autotrack | a definir | 📋 planejada |
| Trimble | a definir | 📋 planejada |
| Cobli | a definir | 📋 planejada |
| Horizon | a definir | 📋 planejada |

Para integrar uma plataforma nova: copie `src/platforms/_template/`,
implemente o(s) bloco(s) de ingestão e registre no `index.js`. Detalhes em
[docs/PLATFORMS.md](./PLATFORMS.md).

---

## 18. Changelog — 2026-05-18 (Dashboard redesign + realtime end-to-end)

### Novo
- **Dashboard "Gestão à Vista"** completo (§5.1): 4 KPIs, drills, Críticos & SLA, donut Tipo × Resultado, Hourly 24 h, Transportadoras, Produtividade, Banner SLA. Tudo realtime.
- **Tabela `drivers_queue`** (§6) — fila compartilhada per-row com realtime, replica identity full, trigger touch_updated_at. Migration `20260518211646_drivers_queue.sql`.
- **Hook `useDriversQueue`** — INSERT/UPDATE/DELETE subscription + backfill automático do `localStorage('mn_drivers_queue')` se DB vazio na primeira carga após migration.
- **Tweaks popover do Dashboard** (§5.1) — substitui `TweaksPanel` global FAB (removido). SLA, comparação, layout, executivo, seções, tema/accent/densidade, atalho admin pra aliases. Persistência granular em `mn_dash_*`.
- **FilterBar 100 % funcional** (§5.1): tipo/resultado/empresa/operador/período cabeiam todos os widgets + ONTEM. Counts dos chips absolutos. Persistido em `mn_dash_filters`.
- **Topbar reformulada** (§5.1): brand integrado (M MedNet) à esquerda, turno dinâmico no breadcrumb, data removida (dedup com greet do Dashboard).
- **`useCarrierAliases` ganhou realtime** (§6) — admin edita aliases, Dashboard atualiza sem reload.

### Mudanças de semântica
- **Em aberto agora** e **Fechados hoje** passam a incluir o bucket **reportar** (antes era só intervenção).
- **Reincidência** continua restrita a `tipo='intervencao'` (não faz sentido pra reportar).
- **Limiar de críticos** virou per-plataforma: Sascar ≥ 5, Maxtrack ≥ 8.
- **Transportadora ranking** + chips de filtro usam `resolveAlias` (consistência com Sheets/Admin).
- **HourlyActivity** agora cobre 24 h (era 06–19 h) — turno noturno deixou de ser invisível.
- **Operador filter** agora vem de `useProfiles()` (equipe atual), não do histórico de `atendimentos.operador_nome`.
- **`ONTEM.emAberto`** virou heurística declarada (placas com evento ontem que não tiveram intervenção/reportar fechado no dia) — proxy, não snapshot.
- **`PANEL_TITLES.dashboard`**: t='Dashboard · Gestão à Vista', s='Visão da diretoria' (turno colado dinamicamente pelo Topbar).

### Removido
- `src/components/TweaksPanel.jsx` (FAB global)
- `setDrivers` direto no `context.jsx` (substituído pelos métodos do hook)
- `aliases mode/vibe/rhythm` do TweaksPanel global (não eram aplicados em CSS ativo)

### Known limitations
- `ONTEM.emAberto` é heurística — pra precisão real, faltaria snapshot diário automatizado à meia-noite.
- Produtividade não rastreia tempo médio de atendimento (precisaria coluna `duracao_seg` em `atendimentos` + capturar `started_at` no Monitor).
- Sem indicador de "operador X está com a placa Y" — para reduzir colisão de dois operadores atendendo o mesmo motorista, faltaria tabela `atendimentos_em_andamento` (com TTL).
- Status pill do Topbar ("Fadiga Zero · Online") segue hardcoded — não reflete saúde real de backend/scraper.
