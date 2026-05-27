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
| Plataformas de monitoramento atuais | **Sascar** (Michelin Smart Camera) |
| Plataformas futuras (planejadas) | Maxtrack, Autotrack, Trimble, Cobli, Horizon |

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
- **Google Apps Script:** Webhook de backup que reaproveita o payload da
  `append-sheet`.

---

## 3. Estrutura de pastas

```
src/
├── App.jsx               # Shell, autenticação, painel ativo, notifier de lembretes
├── main.jsx              # Bootstrap React + providers globais
├── context.jsx           # AppProvider — UI state, fila, preferências, platformId
├── data.js               # Constantes estáticas (NAV, títulos, defaults, mocks)
├── utils.js              # Helpers genéricos (iniciais, datas, accent)
├── supabase.js           # Cliente Supabase + flag de configuração
├── parseSheet.js         # Wrapper @deprecated p/ adapter Sascar (compat)
├── auth/                 # AuthContext, LoginPage, SetPasswordPage
├── components/           # Topbar, Sidebar, TweaksPanel, ErrorBoundary, MaintenancePage
├── hooks/                # 11 hooks de domínio (atendimentos, templates, notas, etc.)
├── lib/                  # uploadImage.js
├── modules/              # Painéis principais (Dashboard, Monitor, Agenda, ...)
│   ├── monitor/          # Subcomponentes do Monitor
│   └── crosscheck/       # Módulo Cross-Check (index, hook, UploadPanel, MatchCard, utils)
├── platforms/            # ⭐ Camada de adapters de plataforma
│   ├── base.js           # Contrato + helpers (emptyDriver/emptyStats)
│   ├── index.js          # Registry, getPlatform, detectPlatform
│   ├── shared/           # Utilitários compartilhados entre adapters
│   │   ├── normalize.js
│   │   ├── parsers.js
│   │   └── history.js
│   ├── sascar/           # Adapter Sascar (planilha)
│   │   ├── index.js
│   │   ├── columns.js
│   │   └── parser.js
│   └── _template/        # Esqueleto para novas plataformas
│       └── index.js
└── styles/               # CSS tokens + layout + módulos

supabase/
├── migration*.sql        # Histórico de schemas (v2..v8 e workspace_images)
└── functions/
    ├── append-sheet/index.ts
    └── invite-user/index.ts
```

---

## 4. Navegação e painéis (`NAV_ITEMS` em `src/data.js`)

| id | Label | Grupo | Apenas admin? |
|---|---|---|---|
| `dashboard` | Dashboard | Operação | — |
| `monitor`   | Monitor de Frota | Operação | — |
| `agenda`    | Agenda | Operação | — |
| `templates` | Templates | Conhecimento | — |
| `workspace` | Workspace | Conhecimento | — |
| `notas`     | Bloco de Notas | Conhecimento | — |
| `links`     | Links Rápidos | Conhecimento | — |
| `crosscheck`| Cross-Check | Operação | — |
| `perfil`    | Meu Perfil | Conta | — |
| `admin`     | Administração | Conta | ✅ |
| `analytics` | Analytics | Conta | ✅ |

Busca global (⌘K / Ctrl+K) na Sidebar pesquisa entre páginas e motoristas
(por nome ou placa) na fila atual.

---

## 5. Domínios funcionais

### 5.1. Dashboard (`modules/Dashboard.jsx`)
KPIs em tempo real: alertas ativos, motoristas críticos, atendimentos do dia,
lista dos motoristas mais críticos, gráfico de atendimentos dos últimos 7
dias, atalhos para outros módulos. Saudação contextual e hero quando há
motoristas com alta contagem.

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
plataforma).

Sub-arquivos:
- `monitor/UploadArea.jsx` — status bar, seletor de plataforma, drop zone, KPIs
- `monitor/MonitorFilters.jsx` — filtros (taxonomia vem da plataforma)
- `monitor/DriverCard.jsx` — cartão de cada motorista com badges
- `monitor/MonitorModals.jsx` — modal de template + dossiê do motorista
- `monitor/HistoryTab.jsx` — aba de histórico com filtros e CSV
- `monitor/utils.jsx` — helpers (sevClass, applyTemplate, exportCSV)

### 5.3. Agenda (`modules/Agenda.jsx`)
Lembretes com data, hora, ícone, prioridade urgente e detalhes opcionais.
Filtros: hoje, futuros, todos. Notificações via Notification API quando o
horário chega.

### 5.4. Templates (`modules/Templates.jsx`)
Scripts reutilizáveis para WhatsApp. Tags: `contato`, `questionario`, `alerta`,
`encerramento`. Variáveis built-in: `[NOME]`, `[PLACA]`, `[TRANSPORTADORA]`,
`[HORA]`, `[SAUDACAO]`. Variáveis customizadas em `localStorage`.
Drag-reorder, copy-to-clipboard.

### 5.5. Workspace (`modules/Workspace.jsx` + `WorkspaceEditor.jsx`)
Wiki interna com TipTap. Suporta upload de imagens para o bucket
`workspace-images` (Supabase Storage). Categorias: `protocolos`, `sistemas`,
`config`. Favoritos, busca e drag-reorder.

### 5.6. Bloco de Notas (`modules/Notes.jsx`)
Notas pessoais (privadas do operador) ou compartilhadas (toda a equipe).
Auto-save com debounce de ~800ms.

### 5.7. Links Rápidos (`modules/Links.jsx`)
Atalhos para sistemas. Seções `interno` / `externo`. Personalização de ícone
e paleta de cor por link. Drag-reorder.

### 5.8. Meu Perfil (`modules/Profile.jsx`)
Edita `nome`, `cargo` e senha. E-mail é read-only.

### 5.9. Administração (`modules/Admin.jsx`, admin-only)
Lista a equipe com `last_seen`. Convida operadores por e-mail (chama
`invite-user`). Toggle de manutenção e edição de role/nome/cargo dos colegas.

### 5.10. Analytics (`modules/Analytics.jsx`, admin-only)
Janela de 30 dias: top 10 motoristas reincidentes (bar), top 5 transportadoras
(pie), tendência de 14 dias intervenção × descarte (line).

### 5.11. Cross-Check (`modules/crosscheck/`)
Compara alertas exportados de duas plataformas diferentes (atualmente Maxtrack
× Horizon) lado a lado. Faz upload de dois arquivos xlsx/csv e encontra
correspondências por placa ou por nome de motorista. Permite filtrar por tipo
de match, ordenar, destacar divergências de contagem e exportar os resultados
em CSV.

Subcomponentes:
- `crosscheck/index.jsx` — componente principal (fino, só renderiza)
- `crosscheck/useCrossCheck.js` — hook com todo o estado e lógica
- `crosscheck/UploadPanel.jsx` — área de upload para um lado (left/right)
- `crosscheck/MatchCard.jsx` — card de resultado individual
- `crosscheck/utils.js` — funções puras (normalização, buildStats, formatação)

---

## 6. Modelo de dados (Supabase)

| Tabela | Colunas principais | Observações |
|---|---|---|
| `profiles` | `id`, `nome`, `cargo`, `role`, `last_seen`, `created_at` | `role ∈ {operador, admin}` |
| `atendimentos` | `id`, `motorista`, `placa`, `transportadora`, `operador_id`, `operador_nome`, `tipo`, `obs`, `hora`, `created_at` | `tipo ∈ {intervencao, reportar, descarte, limpeza}` |
| `templates` | `id`, `tag`, `tag_label`, `title`, `body`, `position`, `created_at` | — |
| `notes` | `id`, `title`, `body`, `is_personal`, `author_id`, timestamps | `is_personal = true` ⇒ só o autor vê |
| `ws_pages` | `id`, `title`, `icon_index`, `category`, `favorite`, `content`, `position`, timestamps | Conteúdo HTML do TipTap |
| `links` | `id`, `section`, `name`, `description`, `url`, `icon`, `bg`, `ic`, `position`, `created_at` | — |
| `reminders` | `id`, `title`, `sub`, `time`, `urgent`, `done`, `reminder_date`, `icon`, `created_at` | — |
| `app_settings` | `key`, `value` (JSON), `updated_at`, `updated_by` | `key='maintenance'` controla lockout |

Realtime: `atendimentos`, `templates`, `notes`, `ws_pages`, `links`,
`reminders`, `app_settings`.

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

| Ação | Atendimento gerado | Effect no driver |
|---|---|---|
| **Inserir na planilha** (intervenção) | `tipo='intervencao'` + post à `append-sheet` | zera `alertas` e `tipos` |
| **Reportar e remover** | `tipo='reportar'` | zera `reportaveis` e `tiposReportar` |
| **Descartar (intervenção/reportar/técnico)** | `tipo='descarte'` | zera o bucket correspondente |
| **Auto-descarte Dinon** | `tipo='descarte'` (background) | evento removido antes de virar driver |
| **Limpar fila** | nenhum | zera lista no `localStorage` |

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

## 11. Personalização visual (`TweaksPanel`)

Persistido em `localStorage` com prefixo `mn_`:
- `theme`: `light` | `dark` (default `dark`)
- `density`: `compact` | `normal` | `cozy`
- `accent`: 6 variantes (`vinho`, `roxo`, `azul`, `verde`, `ambar`, `rosa`)
- `mode`: `pleno` | `plantao` | `foco`
- `vibe`: `sobrio` | `editorial` | `pulse`
- `rhythm`: `operacional` | `compacto` | `cinema`

Plus `platformId` (default `sascar`) controla qual adapter de monitoramento
está ativo.

---

## 12. PWA

`vite-plugin-pwa` gera service worker e manifest. `usePWA` expõe o
`beforeinstallprompt` para o botão "Instalar App" na sidebar.

---

## 13. Camada de plataformas (arquitetura)

A pasta `src/platforms/` introduz o padrão **Adapter** para encapsular cada
plataforma de monitoramento. O contrato suporta três modos de ingestão:

- `spreadsheet` (Sascar hoje): operador faz upload de xlsx/csv.
- `api` (futuro): polling em endpoint REST.
- `scraper` (futuro): scraping via Edge Function.

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

| Plataforma | Modo provável | Status |
|---|---|---|
| Sascar | spreadsheet | ✅ ativa |
| Maxtrack | api ou scraper | 🔄 mais usada — primeira candidata |
| Autotrack | a definir | 📋 planejada |
| Trimble | a definir | 📋 planejada |
| Cobli | a definir | 📋 planejada |
| Horizon | a definir | 📋 planejada |

Para integrar uma plataforma nova: copie `src/platforms/_template/`,
implemente o(s) bloco(s) de ingestão e registre no `index.js`. Detalhes em
[docs/PLATFORMS.md](./PLATFORMS.md).
