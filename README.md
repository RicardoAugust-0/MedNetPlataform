# MedNet · Fadiga Zero

Plataforma operacional da equipe **Fadiga Zero** do GRUPO MedNet. Centraliza o monitoramento de motoristas, fila de intervenções, scripts de contato, agenda, dossiês clínicos, base de conhecimento, automações de ingestão e administração da equipe.

---

## Guia do Operador

### Acesso

Abra o navegador e acesse **`https://mednetplataform.vercel.app/`**. Faça login com o e-mail e senha fornecidos pelo administrador. No primeiro acesso, use o link recebido por e-mail para definir sua senha.

> Caso a plataforma exiba a tela de manutenção, aguarde o administrador reativá-la.

---

### Fluxo de trabalho diário

```
1. Monitor de Frota  →  faça upload da planilha (Sascar, Maxtrack ou OmniLink)
                        (Maxtrack/Horizon: robôs da VPS alimentam a fila automaticamente, sem upload manual)
2. Aba Intervenção   →  ligue ou envie mensagem ao motorista
3. Templates         →  copie o script de WhatsApp adequado
4. Confirme a ação   →  "Inserir na planilha" registra o atendimento no Google Sheets e no banco
5. Histórico/Dossiê  →  consulte o histórico ou o dossiê clínico do motorista antes de agir
6. Agenda            →  crie lembretes para acompanhamentos futuros
```

> **Atalho:** `Ctrl+K` (ou `⌘K` no Mac) abre a busca global — pesquise qualquer painel ou motorista pelo nome ou placa.

---

### Painéis

| Painel                 | Acesso mínimo | O que faz                                                                                                               |
| ---------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**          | operador      | Visão geral: alertas ativos, motoristas críticos, atendimentos do dia e gráfico semanal.                                |
| **Monitor de Frota**   | operador      | Núcleo operacional. Faça upload das planilhas e gerencie a fila nas abas abaixo.                                        |
| **Planilha Embedded**  | operador      | Edição inline das intervenções com sincronização em tempo real (Supabase Realtime).                                     |
| **Dossiês Clínicos**   | operador      | Histórico de fadiga, tratativas e prontuário de saúde por motorista.                                                    |
| **Agenda**             | operador      | Lembretes com data, hora e prioridade. Notificação automática no horário configurado.                                   |
| **Templates**          | operador      | Scripts prontos para WhatsApp. Variáveis como `[NOME]`, `[PLACA]` e `[HORA]` são preenchidas automaticamente.           |
| **Workspace**          | operador      | Wiki interna da equipe: protocolos, configurações e procedimentos (editor rich-text).                                   |
| **Bloco de Notas**     | operador      | Notas pessoais (só você vê) ou compartilhadas com toda a equipe.                                                        |
| **Links Rápidos**      | operador      | Atalhos para sistemas externos usados no dia a dia.                                                                     |
| **Meu Perfil**         | operador      | Edite seu nome, cargo e senha. Configure integrações (Sascar bookmarklet, credenciais Maxtrack).                        |
| **Automações**         | líder         | Status de execução dos robôs da VPS, disparos e métricas de ingestão.                                                   |
| **Chat IA** _(MedBot)_ | admin         | Assistente de IA com acesso de leitura/escrita à plataforma (analytics, relatórios em PDF, ações administrativas).      |
| **Administração**      | admin         | Analytics, Equipe & Acessos, Integrações, IA & Parsing, Sistema (manutenção/limpeza) e Auditoria — ver subseção abaixo. |

#### Monitor de Frota — abas

| Aba                    | Conteúdo                                                                                 | Ações disponíveis                                      |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Intervenção**        | Motoristas com eventos de fadiga ou distração (bocejo, olho fechado, distração genérica) | Histórico · Template · Inserir na planilha · Descartar |
| **Reportar à empresa** | Motoristas com eventos que devem ser reportados à transportadora                         | Histórico · Template · Reportar · Descartar            |
| **Só técnico**         | Eventos técnicos (câmera obstruída, perda de vídeo) sem risco imediato                   | Descartar                                              |
| **Histórico**          | Todos os atendimentos registrados, com filtros por período, tipo e busca por nome/placa  | Exportar CSV                                           |

#### Administração — subpáginas

| Subpágina            | Conteúdo                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **Analytics**        | Métricas de reincidência, transportadoras e tendência de atendimentos, com comparação de períodos. |
| **Equipe & Acessos** | Convites, papéis e permissões da equipe.                                                           |
| **Integrações**      | Credenciais das plataformas, mapeamento de transportadoras e configuração Horizon.                 |
| **IA & Parsing**     | Provedores, modelos e chaves de API usados pelo parsing e pelo MedBot.                             |
| **Sistema**          | Modo manutenção e limpeza de histórico.                                                            |
| **Auditoria**        | Trilha global de tratativas e atendimentos registrados por toda a equipe.                          |

---

### Glossário

| Termo                  | Significado                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Intervenção**        | Contato direto com o motorista (ligação ou WhatsApp) para tratar um evento de fadiga.      |
| **Reportar à empresa** | Comunicado formal enviado à transportadora responsável pelo motorista.                     |
| **Descarte**           | Evento removido da fila por não exigir ação (falso positivo, condição já resolvida, etc.). |
| **Criticidade**        | Nível de gravidade do evento — eventos graves/críticos têm prioridade.                     |
| **Transportadora**     | Empresa responsável pelo veículo e pelo motorista monitorado.                              |
| **Dossiê Clínico**     | Prontuário de fadiga e saúde acumulado de um motorista ao longo do tempo.                  |
| **Atendimento**        | Qualquer ação registrada na plataforma (intervenção, reporte ou descarte).                 |

---

### Papéis

| Papel        | Nível | Acesso                                                                                             |
| ------------ | ----- | -------------------------------------------------------------------------------------------------- |
| **operador** | 0     | Dashboard, Monitor, Planilha Embedded, Dossiês, Agenda, Templates, Workspace, Notas, Links, Perfil |
| **líder**    | 1     | Tudo acima + Automações                                                                            |
| **admin**    | 2     | Tudo acima + Chat IA (MedBot) + Administração completa                                             |

---

## Para Desenvolvedores

### Stack

| Camada             | Tecnologia                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Frontend           | React 19, Vite 8, React Router 7 (roteamento por URL), Recharts + Chart.js, TipTap, `vite-plugin-pwa` |
| Backend (Supabase) | Auth + Postgres + Realtime + Storage                                                                  |
| Backend (Express)  | `server/` — analytics, ingestão Horizon/Maxtrack via robôs, WhatsApp, MedBot (IA)                     |
| Edge Functions     | Deno — `append-sheet`, `read-sheet`, `invite-user`, `generate-report`, `generate-dossier-report`      |
| Integração externa | Google Sheets (audit trail), n8n (webhook MedBot), robôs Playwright na VPS                            |

### Início rápido

```bash
cp .env.example .env
# preencha VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev

# backend Express (analytics, Horizon/Maxtrack, MedBot, WhatsApp) — em outro terminal
cd server && npm install && npm start
```

| Comando              | Ação                                     |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento (Vite + HMR) |
| `npm run build`      | Build de produção                        |
| `npm run preview`    | Servir o build localmente                |
| `npm run lint`       | ESLint                                   |
| `npm test`           | Testes (Vitest)                          |
| `npm run test:watch` | Testes em modo watch                     |

### Estrutura

```
src/
├── App.jsx               # Shell principal, auth, rotas (React Router)
├── context.jsx           # AppProvider — UI state, fila, preferências
├── data.js               # Constantes (NAV_ITEMS, ROLE_LEVEL, defaults)
├── auth/                 # AuthContext, LoginPage, SetPasswordPage
├── components/           # Topbar, Sidebar, GlobalAiChat, MaintenancePage, DataProvider, ErrorBoundary
├── hooks/                # 15 hooks de domínio (atendimentos, automations, reminders, wsPages, ...)
├── modules/               # Painéis (Dashboard, Monitor, Analytics, Automações, Workspace, Dossiês, ...)
│   ├── dashboard/        # Subcomponentes do Dashboard
│   ├── monitor/          # Subcomponentes do Monitor
│   ├── analytics/        # Subcomponentes do Analytics
│   ├── automacoes/       # Subcomponentes de Automações (status de robôs)
│   ├── admin/            # Subpáginas de Administração + ai-chat/ (UI do MedBot)
│   └── crosscheck/       # utils.js — reaproveitado só pelo backend (server/auto-crosscheck.js)
└── platforms/             # Adapters de plataforma (padrão Adapter)
    ├── base.js           # Contrato + emptyDriver/emptyStats
    ├── index.js          # Registry (sascar, maxtrack, omnilink)
    ├── shared/           # normalize, parsers, history, aggregate, customRules
    ├── sascar/           # Adapter Sascar (spreadsheet + scraper)
    ├── maxtrack/         # Adapter Maxtrack (columns + parser)
    ├── omnilink/         # Adapter OmniLink (upload manual de planilha)
    └── _template/        # Esqueleto para novas plataformas

server/                    # Backend Express — companheiro do Supabase, não substituto
├── index.js               # Bootstrap, monta as rotas abaixo
├── analytics-routes.js    # API de Analytics (role-gated)
├── analytics-rpc.js       # Motor de Analytics via RPC Postgres
├── analytics-import.js    # Upload/parsing compartilhado (multer)
├── horizon-routes.js      # Ingestão Horizon (auth de robô) + Auto Cross-Check
├── maxtrack-routes.js     # Ingestão Maxtrack (auth de robô) + Auto Cross-Check
├── auto-crosscheck.js     # Cruza eventos Maxtrack × Horizon e sugere classificação
├── whatsapp-routes.js     # Credenciais/rotas do WhatsApp Business API
├── ai-chat-routes.js      # Backend do MedBot (chat IA)
├── ai-chat/               # middleware, prompt, tool-handlers do MedBot
├── pdf-generator.js       # Geração de PDF (relatórios do MedBot)
└── Dockerfile             # node:18-alpine, expõe porta 3000

supabase/
├── migrations/            # Schemas e integrações (histórico incremental por data)
└── functions/
    ├── append-sheet/      # Append no Google Sheets
    ├── read-sheet/        # Leitura da planilha embedded
    ├── invite-user/       # Convite de operadores
    ├── generate-report/   # Relatório executivo (IA)
    └── generate-dossier-report/  # Dossiê clínico em PDF
```

### Plataformas de monitoramento

| Plataforma | Modo                                                                                    | Status                                           |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Sascar     | spreadsheet                                                                             | ✅ ativa                                         |
| Maxtrack   | upload de planilha + ingestão automática via robô (`server/maxtrack-routes.js`)         | ✅ ativa                                         |
| OmniLink   | spreadsheet (upload manual do export do portal)                                         | ✅ ativa                                         |
| Horizon    | ingestão automática via robô (`server/horizon-routes.js`), fora do registry de adapters | ✅ ativa (ver `docs/PLANO_AUTOMACAO_HORIZON.md`) |
| Autotrack  | a definir                                                                               | 📋 planejada                                     |
| Trimble    | a definir                                                                               | 📋 planejada                                     |
| Cobli      | a definir                                                                               | 📋 planejada                                     |

Para adicionar uma plataforma nova ao Monitor de Frota (upload/adapter): copie `src/platforms/_template/`, implemente o bloco de ingestão e registre em `src/platforms/index.js`. Para uma plataforma ingerida via robô/VPS (como Horizon), siga o padrão de `server/horizon-routes.js` em vez do registry de adapters.

### Documentação técnica

| Documento                                                                | Conteúdo                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [`docs/PROJECT.md`](docs/PROJECT.md)                                     | Documentação completa: modelo de dados, regras de negócio, integração Google Sheets, PWA          |
| [`docs/PLATFORMS.md`](docs/PLATFORMS.md)                                 | Guia detalhado para adicionar novas plataformas ao Monitor (adapter, formato canônico, checklist) |
| [`docs/PLANO_AUTOMACAO_HORIZON.md`](docs/PLANO_AUTOMACAO_HORIZON.md)     | Status vivo da automação Horizon/Maxtrack (robôs VPS, Auto Cross-Check)                           |
| `docs/AUDITORIA-*.md`, `docs/analytics-rpc-progress.md`                  | Logs de auditoria históricos — consulte só para contexto de decisões passadas                     |
| [`docs/skills/mednet-skill/SKILL.md`](docs/skills/mednet-skill/SKILL.md) | Skill workspace-scoped para scaffold de adapters e módulos                                        |
