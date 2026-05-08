# MedNet — Features para uso diário

**Data:** 2026-05-08  
**Status:** Aprovado

## Escopo

Cinco melhorias de produtividade para uso operacional diário:

1. Templates com variáveis dinâmicas no Monitor
2. Notificações da Agenda no horário
3. Indicador de idade da planilha no Monitor
4. Filtro por data + exportação CSV no histórico
5. PWA instalável

---

## Feature 1 — Templates com variáveis (Monitor)

### Objetivo
Ao clicar em "Template" no card de um motorista em alerta, abrir modal com mensagem de intervenção já pré-preenchida com dados do motorista, pronta para copiar.

### Variáveis suportadas
| Variável | Valor |
|---|---|
| `{{saudacao}}` | "Bom dia", "Boa tarde" ou "Boa noite" por horário |
| `{{nome}}` | `driver.nome` |
| `{{placa}}` | `driver.placa` |
| `{{transportadora}}` | `driver.transportadora` |

### Fluxo
1. Usuário clica "Template" no card do motorista
2. Busca templates com `tag === 'contato'` do Supabase (via `useTemplates`)
3. Substitui variáveis com dados do driver no texto
4. Abre modal com texto final renderizado
5. Botão "Copiar" de 1 clique → fecha modal após cópia

### Caso sem templates de contato
Modal exibe aviso "Nenhum template de contato cadastrado" com link para a aba Templates.

### Alteração de nomenclatura
Botão "Iniciar contato" → **"Inserir na planilha"** (condiz com a ação real de registrar na planilha Google Sheets).

### Arquivos afetados
- `src/modules/Monitor.jsx` — lógica de busca, substituição e modal
- `src/hooks/useTemplates.js` — já existente, sem alteração

---

## Feature 2 — Notificações da Agenda

### Objetivo
Alertar o operador quando um lembrete da Agenda atinge o horário, independente do painel ativo.

### Mecanismo
- `setInterval` de 60 segundos no `AppProvider` (`src/context.jsx`)
- Compara lembretes: `date === hoje && time === HH:MM atual && !done`
- Ao match: dispara toast (via `useToast`) + push notification nativa

### Toast
- Título do lembrete
- Sub-texto do lembrete (se houver)
- Botão inline "Marcar como feito" que chama `toggle(id)`

### Push notification
- Mesmo título e sub-texto
- `tag` única por `lembrete.id` para evitar duplicata no browser
- Solicita permissão na primeira vez que há lembrete próximo

### Anti-duplicata
`Set` em memória com IDs já notificados na sessão. Reseta ao recarregar (aceitável — lembrete não dispara duas vezes na mesma sessão).

### Arquivos afetados
- `src/context.jsx` — adicionar intervalo global
- `src/hooks/useReminders.js` — expor função `toggle` se ainda não exposta ao contexto

---

## Feature 3 — Indicador de idade da planilha

### Objetivo
Mostrar quando foi a última carga de planilha no Monitor para evitar trabalhar com dados desatualizados.

### Armazenamento
Ao carregar arquivo: `localStorage.setItem('mn_sheet_loaded_at', new Date().toISOString())`

### Badge no topo do Monitor
- Atualiza a cada 60s via `setInterval`
- Cores por idade:
  - Verde: < 30 min
  - Amarelo: 30–60 min
  - Vermelho: > 60 min
- Oculto enquanto nenhuma planilha foi carregada na sessão/histórico

### Barra de status
Texto existente complementado: `"RH_220506.xlsx · 47 min atrás · 23 motoristas"`

### Arquivos afetados
- `src/modules/Monitor.jsx` — badge e lógica de timestamp

---

## Feature 4 — Filtro por data + exportação CSV no histórico

### Objetivo
Acessar registros de atendimentos além do limite de 300, com filtro por período e exportação.

### UI
Nova barra de filtros acima da lista de histórico no Monitor:
- Botões de período rápido: `Hoje` / `Esta semana`
- Inputs de data para intervalo personalizado (de / até)
- Botão `Exportar CSV`

### Query
- Período selecionado → query server-side: `.gte('created_at', inicio).lte('created_at', fim)`
- Sem período → comportamento atual (300 mais recentes)
- Padrão ao abrir: `Hoje`

### Exportação
Usa `exportCSV()` já existente no Monitor com os registros do período filtrado.

### Arquivos afetados
- `src/modules/Monitor.jsx` — barra de filtros e lógica de query condicional
- `src/hooks/useAtendimentos.js` — novo método `loadByRange(inicio, fim)`

---

## Feature 5 — PWA

### Objetivo
Permitir instalação do MedNet como app nativo em desktops e celulares da equipe.

### Pacote
`vite-plugin-pwa` (devDependency)

### Manifest
- Nome: `MedNet`
- Cor de tema e background: `#F26931`
- Ícones: 192×192 e 512×512 gerados a partir do favicon existente

### Service worker
- Estratégia `GenerateSW`
- Chamadas Supabase (`*.supabase.co`): `networkFirst` — dados sempre frescos
- Assets estáticos (JS/CSS/fontes): `cacheFirst`

### Instalação
Banner nativo do browser ao atender critérios PWA (HTTPS + manifest + SW). Sem prompt customizado.

### Arquivos afetados
- `vite.config.js` — adicionar plugin PWA
- `public/` — ícones 192 e 512
- `index.html` — meta tags de tema (se ausentes)
