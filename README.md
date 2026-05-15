# MedNet · Fadiga Zero

Plataforma operacional da equipe **Fadiga Zero** do GRUPO MedNet. Centraliza o monitoramento de motoristas, fila de intervenções, scripts de contato, agenda, base de conhecimento e administração da equipe.

---

## Guia do Operador

### Acesso

Abra o navegador e acesse **`https://mednetplataform.vercel.app/`**. Faça login com o e-mail e senha fornecidos pelo administrador. No primeiro acesso, use o link recebido por e-mail para definir sua senha.

> Caso a plataforma exiba a tela de manutenção, aguarde o administrador reativá-la.

---

### Fluxo de trabalho diário

```
1. Monitor de Frota  →  faça upload da planilha Sascar OU clique "Buscar eventos agora"
                        (Sascar: use o bookmarklet uma vez por turno para ativar a busca automática)
                        (Maxtrack: configure e-mail e senha em Meu Perfil → Integrações)
2. Aba Intervenção   →  ligue ou envie mensagem ao motorista
3. Templates         →  copie o script de WhatsApp adequado
4. Confirme a ação   →  "Inserir na planilha" registra o atendimento no Google Sheets
5. Aba Histórico     →  consulte o histórico do motorista antes de agir
6. Agenda            →  crie lembretes para acompanhamentos futuros
```

> **Atalho:** `Ctrl+K` (ou `⌘K` no Mac) abre a busca global — pesquise qualquer painel ou motorista pelo nome ou placa.

---

### Painéis

| Painel | O que faz |
|---|---|
| **Dashboard** | Visão geral: alertas ativos, motoristas críticos, atendimentos do dia e gráfico semanal. |
| **Monitor de Frota** | Núcleo operacional. Faça upload da planilha Sascar e gerencie a fila nas abas abaixo. |
| **Cross-Check** | Compare alertas de duas plataformas diferentes. Veja detalhes abaixo. |
| **Agenda** | Lembretes com data, hora e prioridade. Notificação automática no horário configurado. |
| **Templates** | Scripts prontos para WhatsApp. Variáveis como `[NOME]`, `[PLACA]` e `[HORA]` são preenchidas automaticamente. |
| **Workspace** | Wiki interna da equipe: protocolos, configurações e procedimentos. |
| **Bloco de Notas** | Notas pessoais (só você vê) ou compartilhadas com toda a equipe. |
| **Links Rápidos** | Atalhos para sistemas externos usados no dia a dia. |
| **Meu Perfil** | Edite seu nome, cargo e senha. Configure integrações (Sascar bookmarklet, credenciais Maxtrack). |
| **Administração** *(admin)* | Gerencie a equipe, convide operadores e ative/desative modo de manutenção. |
| **Analytics** *(admin)* | Métricas de 30 dias: reincidentes, transportadoras e tendência de atendimentos. |

#### Monitor de Frota — abas

| Aba | Conteúdo | Ações disponíveis |
|---|---|---|
| **Intervenção** | Motoristas com eventos de fadiga ou distração (bocejo, olho fechado, distração genérica) | Histórico · Template · Inserir na planilha · Descartar |
| **Reportar à empresa** | Motoristas com eventos que devem ser reportados à transportadora | Histórico · Template · Reportar · Descartar |
| **Só técnico** | Eventos técnicos (câmera obstruída, perda de vídeo) sem risco imediato | Descartar |
| **Histórico** | Todos os atendimentos registrados, com filtros por período, tipo e busca por nome/placa | Exportar CSV |

---

### Cross-Check — passo a passo

O Cross-Check compara relatórios de alertas de **duas plataformas diferentes** para identificar motoristas ou veículos que aparecem nas duas fontes.

1. Baixe a planilha da **Plataforma A** (ex.: Maxtrack) e da **Plataforma B** (ex.: Horizon).
2. No painel Cross-Check, arraste ou selecione a planilha A na área **Planilha 1** e a planilha B na **Planilha 2**.
3. Se a planilha não tiver coluna de transportadora, preencha o campo **"Transportadora"** antes de carregar — ele será aplicado automaticamente como valor padrão.
4. O cruzamento ocorre automaticamente após o segundo upload. Use **"Comparar lado a lado"** para forçar o recálculo.
5. Use os filtros para refinar: **período**, **tipo** (placa ou motorista), **ordenação**, **somente divergências** ou clique em uma transportadora para filtrar por ela.
6. Clique em **"Exportar resultados"** ou **"Exportar divergências"** para baixar o CSV.

> **Match perfeito** = o motorista ou placa aparece o mesmo número de vezes nas duas plataformas.  
> **Divergência** = número de ocorrências diferente entre as fontes — prioridade de investigação.

---

### Glossário

| Termo | Significado |
|---|---|
| **Intervenção** | Contato direto com o motorista (ligação ou WhatsApp) para tratar um evento de fadiga. |
| **Reportar à empresa** | Comunicado formal enviado à transportadora responsável pelo motorista. |
| **Descarte** | Evento removido da fila por não exigir ação (falso positivo, condição já resolvida, etc.). |
| **Criticidade** | Nível de gravidade do evento — eventos graves/críticos têm prioridade. |
| **Transportadora** | Empresa responsável pelo veículo e pelo motorista monitorado. |
| **Match** | Correspondência encontrada entre as duas planilhas no Cross-Check (mesma placa ou mesmo motorista). |
| **Divergência** | Match onde o número de ocorrências difere entre as duas fontes. |
| **Atendimento** | Qualquer ação registrada na plataforma (intervenção, reporte ou descarte). |

---

### Papéis

| Papel | Acesso |
|---|---|
| **operador** | Dashboard, Monitor, Cross-Check, Agenda, Templates, Workspace, Notas, Links, Perfil |
| **admin** | Tudo acima + Administração + Analytics + toggle de manutenção |

---

## Para Desenvolvedores

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19, Vite 8, Recharts, TipTap, `vite-plugin-pwa` |
| Backend | Supabase (Auth + Postgres + Realtime + Storage) |
| Edge Functions | Deno — `append-sheet`, `invite-user`, `pull-sascar`, `pull-maxtrack` |
| Integração externa | Google Sheets (audit trail de atendimentos) |

SPA sem roteamento de URL — navegação via `activePanel` no contexto global.

### Início rápido

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

### Estrutura

```
src/
├── App.jsx               # Shell principal, auth, painel ativo, SascarTokenHandler
├── context.jsx           # AppProvider — UI state, fila, preferências
├── data.js               # Constantes (NAV_ITEMS, defaults)
├── auth/                 # AuthContext, LoginPage, SetPasswordPage
├── components/           # Topbar, Sidebar, TweaksPanel, ErrorBoundary
├── hooks/                # 11 hooks de domínio
├── modules/              # Painéis (Dashboard, Monitor, CrossCheck, Agenda, …)
│   ├── monitor/          # Subcomponentes do Monitor
│   └── crosscheck/       # Subcomponentes do Cross-Check
└── platforms/            # Adapters de plataforma (padrão Adapter)
    ├── base.js           # Contrato + emptyDriver/emptyStats
    ├── index.js          # Registry
    ├── shared/           # normalize, parsers, history
    ├── sascar/           # Adapter Sascar (spreadsheet + scraper)
    ├── maxtrack/         # Adapter Maxtrack (scraper via Edge Function)
    └── _template/        # Esqueleto para novas plataformas

supabase/
├── migration*.sql        # v2..v10 — schemas e integrações
└── functions/
    ├── append-sheet/     # Append no Google Sheets
    ├── invite-user/      # Convite de operadores
    ├── pull-sascar/      # Busca automática de alarmes Sascar
    └── pull-maxtrack/    # Busca automática de eventos Maxtrack
```

### Plataformas de monitoramento

| Plataforma | Modo | Status |
|---|---|---|
| Sascar | spreadsheet + scraper (bookmarklet) | ✅ ativa · 🧪 scraper beta |
| Maxtrack | scraper (Edge Function + credenciais) | 🧪 beta |
| Autotrack | a definir | 📋 planejada |
| Trimble | a definir | 📋 planejada |
| Cobli | a definir | 📋 planejada |
| Horizon | a definir | 📋 planejada |

Para adicionar uma plataforma nova: copie `src/platforms/_template/`, implemente o bloco de ingestão e registre em `src/platforms/index.js`.

### Documentação técnica

| Documento | Conteúdo |
|---|---|
| [`docs/PROJECT.md`](docs/PROJECT.md) | Documentação completa: modelo de dados, regras de negócio, integração Google Sheets, PWA |
| [`docs/PLATFORMS.md`](docs/PLATFORMS.md) | Guia detalhado para adicionar novas plataformas (adapter, formato canônico, checklist) |
| [`docs/skills/mednet-skill/SKILL.md`](docs/skills/mednet-skill/SKILL.md) | Skill workspace-scoped para scaffold de adapters e módulos |
