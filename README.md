# MedNet · Fadiga Zero

Plataforma operacional da equipe **Fadiga Zero** do GRUPO MedNet. Centraliza o monitoramento de motoristas, fila de intervenções, scripts de contato, agenda, base de conhecimento e administração da equipe.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 8, Recharts, TipTap, `vite-plugin-pwa` |
| Backend | Supabase (Auth + Postgres + Realtime + Storage) |
| Edge Functions | Deno — `append-sheet`, `invite-user` |
| Integração externa | Google Sheets (audit trail de atendimentos) |

SPA sem roteamento de URL — navegação via `activePanel` no contexto global.

## Início rápido

```bash
cp .env.example .env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

| Comando | Ação |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite + HMR) |
| `npm run build` | Build de produção |
| `npm run preview` | Servir o build localmente |
| `npm run lint` | ESLint |

## Estrutura

```
src/
├── App.jsx               # Shell principal, auth, painel ativo
├── context.jsx           # AppProvider — UI state, fila, preferências
├── data.js               # Constantes (NAV_ITEMS, defaults)
├── auth/                 # AuthContext, LoginPage, SetPasswordPage
├── components/           # Topbar, Sidebar, TweaksPanel, ErrorBoundary
├── hooks/                # 11 hooks de domínio
├── modules/              # Painéis (Dashboard, Monitor, Agenda, …)
│   └── monitor/          # Subcomponentes do Monitor
└── platforms/            # Adapters de plataforma (padrão Adapter)
    ├── base.js           # Contrato + emptyDriver/emptyStats
    ├── index.js          # Registry
    ├── shared/           # normalize, parsers, history
    ├── sascar/           # Adapter ativo (spreadsheet)
    └── _template/        # Esqueleto para novas plataformas

supabase/
├── migration*.sql
└── functions/
    ├── append-sheet/
    └── invite-user/
```

## Painéis

| id | Label | Admin only |
|---|---|---|
| `dashboard` | Dashboard | — |
| `monitor` | Monitor de Frota | — |
| `crosscheck` | Cross-Check | — |
| `agenda` | Agenda | — |
| `templates` | Templates | — |
| `workspace` | Workspace (wiki) | — |
| `notas` | Bloco de Notas | — |
| `links` | Links Rápidos | — |
| `perfil` | Meu Perfil | — |
| `admin` | Administração | ✅ |
| `analytics` | Analytics | ✅ |

Busca global: `⌘K` / `Ctrl+K` pesquisa páginas e motoristas na fila.

## Plataformas de monitoramento

| Plataforma | Modo | Status |
|---|---|---|
| Sascar | spreadsheet | ✅ ativa |
| Maxtrack | api / scraper | 🔄 candidata |
| Autotrack | a definir | 📋 planejada |
| Trimble | a definir | 📋 planejada |
| Cobli | a definir | 📋 planejada |
| Horizon | a definir | 📋 planejada |

Para adicionar uma plataforma nova: copie `src/platforms/_template/`, implemente o bloco de ingestão e registre em `src/platforms/index.js`.

## Papéis

- **operador** — Dashboard, Monitor, Agenda, Templates, Workspace, Notas, Links, Perfil.
- **admin** — tudo acima + Admin + Analytics + toggle de manutenção.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/PROJECT.md`](docs/PROJECT.md) | Documentação completa: modelo de dados, regras de negócio, integração Google Sheets, PWA, personalização visual |
| [`docs/PLATFORMS.md`](docs/PLATFORMS.md) | Guia detalhado para adicionar novas plataformas (adapter, formato canônico, checklist) |
| [`docs/skills/mednet-skill/SKILL.md`](docs/skills/mednet-skill/SKILL.md) | Skill workspace-scoped para scaffold de adapters e módulos |
