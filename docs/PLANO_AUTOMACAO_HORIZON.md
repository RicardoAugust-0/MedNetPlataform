# Automação Horizon — ingestão + sincronização de tratamento com `driver_events`

## Status (atualizado em 2026-07-01)

- ✅ **Trilha A (ingestão)** — implementada e testada neste repositório
  (MedNetPlataform). `npm test` (100/100) e `npm run lint` sem regressões.
  Migration aplicada em produção (confirmado pelo usuário em 2026-07-01).
  Falta só cadastrar as 17-18 contas reais pela UI
  (`/admin/integracoes/horizon`) — tabela `horizon_credentials` ainda
  vazia em produção.
- ✅ **Trilha C1/C2 (disparo do lado MedNet)** — implementada neste
  repositório.
- 🟡 **Trilha B (robô Playwright/N8N)** — em andamento, no repositório
  `bots_playwright` (VPS). Pasta do robô renomeada pelo usuário para
  `automacoes/BOT_HorizonExport2Captcha` em 2026-07-01 (era
  `bot_HorizonScraping`). ✅ **`endpoint` da automação
  `Bot_HorizonScraping`, id `c1b94e82-e3e7-4c74-bfd4-3a56df93df24`, na
  tabela `automations`, atualizado pelo usuário em 2026-07-02** pro novo
  caminho `.../automacoes/BOT_HorizonExport2Captcha`. **B1 implementado, commitado, pushado e deployado em
  produção** em 2026-07-01 (rebuild automático da VPS confirmado):
  captcha automático via 2Captcha (substitui a extensão Buster/resolução
  manual por VNC, removida do repo), busca de credenciais e envio de
  status via API MedNet (`GET/POST /api/horizon/credentials`,
  `/credential-status`), ingestão do relatório via `POST
  /api/horizon/ingest` logo após cada download, e `playwright-stealth`
  aplicado no contexto do navegador (`apply_stealth_async`) para reduzir
  detecção de automação. `MEDNET_API_BASE`
  (`https://www.mednetanalytics.duckdns.org`) e `HORIZON_BOT_TOKEN` já
  configurados nos dois lados. Falta para rodar ponta a ponta:
  - Cadastrar as contas reais na UI (ver item da Trilha A acima).
  - Pagar/provisionar a chave da conta 2Captcha (`TWOCAPTCHA_API_KEY`) —
    usuário vai fazer isso amanhã.
  - Atualizar o `endpoint` cadastrado (`automations` + N8N) pro novo nome
    da pasta (ver acima).
  - **Frequência (cron 1x/hora)** e **remoção do envio por e-mail** não
    são código — são ajustes no workflow N8N que dispara
    `POST /automacoes/BOT_HorizonExport2Captcha`: trocar trigger de
    1x/dia (06:00) para hourly, e desligar/remover o node que mandava
    e-mail (o robô já envia direto pro MedNet agora). Usuário vai fazer
    isso amanhã, junto da chave do 2Captcha.
  - ✅ **Node HTTP Request do N8N testado e funcionando** em 2026-07-02.
    Achado no caminho: N8N (deployado como "Service" no Coolify, stack
    `n8nio/n8n` + postgresql) e o robô (deployado como "Application")
    ficam em redes Docker diferentes dentro do mesmo servidor
    (`VPS_Mednet`/Coolify), então o container do N8N não conseguia
    resolver `botsplaywright.duckdns.org` via DNS ("DNS server returned
    an error"). Corrigido sem mexer em DNS: adicionado `extra_hosts`
    no serviço `n8n` do docker-compose do Coolify, mapeando
    `botsplaywright.duckdns.org` direto pro IP público
    `178.253.250.45`. Node confirmado disparando a automação
    corretamente após o fix. Payload usado: `POST
    https://botsplaywright.duckdns.org/automacoes/BOT_HorizonExport2Captcha?background=true`,
    header `Authorization: Bearer <API_TOKEN do robô>`, body `{}` vazio
    (não precisa mais montar lista de `contas` no N8N — o robô busca
    sozinho via `GET /api/horizon/credentials`).
  - Falta ainda no fluxo N8N: trocar trigger para cron horário, remover
    node de e-mail e node que montava a lista de `contas` (lógica
    obsoleta, MedNet backend já resolve isso).
  - ✅ **Fluxo N8N remontado em 2026-07-02**: `Schedule Trigger (Hours,
    hours between triggers: 1) → Acesso ao BOT (POST
    .../BOT_HorizonExport2Captcha?background=true) → Wait (20min) →
    Consulta Status (GET /tasks/{task_id})`. Sem node de e-mail/alerta —
    decidido não alertar via N8N (Telegram/e-mail); node de e-mail e
    node que montava lista de `contas` do fluxo antigo removidos.
  - **Pendente (fora deste repo, precisa sessão com acesso ao
    MedNetPlataform):** usuário quer um toast/notificação **dentro da
    plataforma MedNet** quando uma conta Horizon falhar (senha errada,
    captcha não resolvido etc). O dado já chega lá — o robô já reporta
    status por conta via `POST /api/horizon/credential-status`
    (`ok`/`credential_error`/`session_expired`); falta só a UI/backend
    do MedNet consumir isso e exibir a notificação. Não é código deste
    repositório (`bots_playwright`).
  - ✅ **`HORIZON_BOT_TOKEN` confirmado espelhado no `.env` do backend
    MedNet** pelo usuário em 2026-07-02 (mesmo valor do `.env` do robô).
  - ✅ **VNC removido do `Dockerfile`** em 2026-07-01: x11vnc/noVNC/
    websockify/fluxbox tirados (não são mais necessários com captcha
    100% automático via 2Captcha); mantido só o Xvfb (display virtual
    exigido pelo Chromium enquanto `headless=False`) e a porta 8000.
    ✅ **Portas 6080/5900 removidas/ajustadas no painel Coolify** pelo
    usuário em 2026-07-02.
    Avaliar depois se compensa migrar para `headless=True` (dispensaria
    até o Xvfb).
  - Testar o login real com 2Captcha na VPS.
  - B2/B3/B4 (ver abaixo) ainda não iniciados — a decidir em sessão futura
    com o usuário.
- ⬜ **Bot_Maxtrack** — o bot existente está **bem inicial e com vários
  erros** (confirmado pelo usuário em 2026-07-01). Não deve ser corrigido
  incrementalmente — precisa ser **refeito do zero**. Isso passou a fazer
  parte do escopo da Trilha B (ver B2).

## Contexto

Hoje o operador trata a Horizon manualmente: baixa o relatório do portal e
sobe pelo Analytics (`ImportModal` → `fatigueParser.js`, `platformId:
'horizon'`). O objetivo é eliminar esse passo por completo — não só a
**ingestão** dos relatórios, mas também o **tratamento dos alertas dentro da
própria Horizon**, porque **Horizon é espelho da MaxTrack** (mesma
frota/eventos): quem trata um alerta na MaxTrack não deveria precisar
repetir o tratamento na Horizon — hoje isso é feito à parte.

Isso divide o trabalho em duas frentes independentes:

1. **Ingestão** (Trilha A, ✅ concluída) — já existe um robô pronto
   (`Bot_HorizonScraping`, Playwright + N8N na VPS) que exporta os
   relatórios de todas as contas e hoje manda por e-mail. Precisa de 3
   ajustes (ver B1): captcha automático, frequência horária, destino =
   MedNet em vez de e-mail.
2. **Sincronização de tratamento** (Trilha C, parcialmente concluída) —
   quando um evento é tratado na MaxTrack (manualmente pelo operador no
   Monitor, ou automaticamente por um bot), o mesmo evento precisa ser
   marcado como tratado também na Horizon. O disparo do lado MedNet (C2)
   está pronto; falta o robô que efetivamente faz a ação na Horizon (B3) e
   o Bot_Maxtrack que dispara o caminho automático (B2).

Decisões já confirmadas com o usuário:
- Captcha: **2Captcha automático**.
- Destino da ingestão: **`driver_events`** (Analytics) — não a fila do Monitor.
- Frequência de ingestão: **de hora em hora**.
- **Rotação de senha:** a Horizon força troca de senha com frequência, e as
  senhas "circulam" entre um pequeno conjunto de 3-4 senhas conhecidas. O
  robô precisa, ao falhar o login, tentar essas senhas alternativas antes de
  declarar a conta com erro de credencial.
- **Sincronização de tratamento:** quando um evento é tratado na MaxTrack
  (qualquer via), o mesmo evento deve ser tratado automaticamente também na
  Horizon — eliminando de vez a necessidade de mexer na Horizon manualmente,
  tanto para ingestão quanto para tratamento.
- **Contas Horizon (17-18):** em vez de lista fixa semeada por migration, a
  tabela `horizon_credentials` tem CRUD completo pela UI do MedNet
  (`/admin/integracoes/horizon`) — o usuário cadastra/edita/remove contas
  livremente, sem precisar de nova migration.

---

## Trilha A — Ingestão (✅ concluída neste repositório)

Implementada em 2026-07-01. O que foi construído:

- `supabase/migrations/20260701150000_horizon_credentials.sql` — tabela
  `horizon_credentials` (`label`, `email` único, `password`,
  `password_candidates jsonb`, `status` ok/credential_error/session_expired,
  `last_login_at`, `last_error`) com RLS admin-only (`FOR ALL`, CRUD
  completo). Também semeia a automação `Bot_HorizonTreatment` (ver Trilha C1).
- `server/horizon-routes.js` (`registerHorizonRoutes`, registrado em
  `server/index.js`) — as 3 rotas do contrato abaixo.
- `src/modules/admin/IntegracoesHorizon.jsx` — UI em
  `/admin/integracoes/horizon`: lista contas com pill de status, permite
  adicionar conta, editar senha/candidatas (reseta `status` para `ok` ao
  salvar) e remover conta.
- `HORIZON_BOT_TOKEN` documentado em `.env.example`.

### Contrato de ingestão (já em produção, assim que a migration for aplicada)

| Endpoint | Auth | Body | Resposta |
|---|---|---|---|
| `POST <MEDNET_API_BASE>/api/horizon/ingest` | header `Authorization: Bearer <HORIZON_BOT_TOKEN>` | multipart `files[]` (1+ arquivos .xlsx/.csv exportados da Horizon, campo `files`) | `200 { success: true, stats, dupsFiltered, uniqueSavedCount }` ou `4xx/5xx { error }` |
| `POST <MEDNET_API_BASE>/api/horizon/credential-status` | mesma auth | `{ email, status: 'ok'\|'credential_error'\|'session_expired', error?, workingPassword? }` | `200 { success: true }` |
| `GET <MEDNET_API_BASE>/api/horizon/credentials` | mesma auth | — | `200 [{ email, password, password_candidates: string[], label }]` — já exclui contas com `status = 'credential_error'` |

Notas para quem for implementar a Trilha B:
- `<MEDNET_API_BASE>` é o domínio de produção do backend Express do MedNet
  (**não** é o mesmo domínio de `botsplaywright.duckdns.org` — esse é o
  domínio do robô). Precisa ser configurado como variável de ambiente no
  repositório do robô — valor exato a confirmar com quem administra a VPS.
- `<HORIZON_BOT_TOKEN>` é um segredo compartilhado: o mesmo valor precisa
  estar em `HORIZON_BOT_TOKEN` no `.env` do backend MedNet **e** no `.env`
  do robô.
- Em `credential-status`, se `workingPassword` vier preenchido, o MedNet
  promove essa senha a `password` primária da conta (o robô não precisa
  fazer mais nada além de mandar qual candidata funcionou).
- `ingest` é idempotente: reenviar o mesmo arquivo não duplica linhas em
  `driver_events` (`onConflict: platform_id,placa,ocorrido_em,nome_evento`).
  Isso significa que o robô pode reenviar com segurança em caso de dúvida
  sobre uma execução anterior.
- Formato esperado das colunas do export (mapa já usado pelo parser do
  MedNet, útil para conferir se o export do robô bate 100%): "Placa /
  Empurrador", "Motorista / Comandante", "Data/Hora Evento", "Gravidade",
  "Evento", "Avaliação"/"Status", "Velocidade", "Local", "Transportadora /
  Empresa de Navegação"/"Filial", "Data/Hora Disponibilidade Vídeo",
  "Data/Hora Publicação", "Justificativa"/"Descrição". Se o export real
  divergir, é um ajuste pontual no mapa do lado MedNet — não muda o
  contrato acima.

### A5 pendente (cosmético, não bloqueia nada)

Editar a automação `Bot_HorizonScraping` pela tela de Automações do MedNet:
descrição "Extrai relatórios Horizon de hora em hora e atualiza
`driver_events` automaticamente" e `schedule` = "a cada 1 hora". Puramente
estético (o agendamento real é no robô/N8N) — pode ser feito a qualquer
momento direto na UI, sem migration.

---

## Trilha C1/C2 — Disparo do lado MedNet (✅ concluída neste repositório)

- Migration semeia a automação `Bot_HorizonTreatment` (id
  `f0a94e82-e3e7-4c74-bfd4-3a56df93df27`, `trigger: 'evento'`, `event_type:
  'Atendimento registrado (MaxTrack)'`) na tabela `automations` — token
  próprio, editável pela tela de Automações.
- `src/hooks/useAtendimentos.js` (`registrar()`) aceita `platformId`; após
  gravar em `atendimentos` com sucesso, se `platformId === 'maxtrack'` e
  `tipo !== 'limpeza'`, dispara um `fetch` **best-effort** (fire-and-forget,
  timeout 10s, falha não impede o atendimento de ser salvo) para o
  `endpoint`/`token` de `Bot_HorizonTreatment` lidos da tabela
  `automations`, com body `{ motorista, placa, transportadora, tipo,
  timestamp }`.
- `src/modules/Monitor.jsx` — os 4 pontos que chamam `registrar()`
  (`attend`, `reportar`, `performDiscard`, `bulkDiscard`) passam
  `platformId: d._platformId`.

Isso cobre o caminho **manual** (operador trata no Monitor). O caminho
**automático** (Bot_Maxtrack tratando NV3 sozinho) não passa pelo MedNet —
ver B4.

---

## Trilha B — robô Playwright/N8N (repositório separado, na VPS)

> **Esta seção deve ser lida sem acesso ao MedNetPlataform.** É o que uma
> nova sessão, apontada para o repositório do robô, precisa saber para
> implementar do zero. Os contratos de API acima (Trilha A) e abaixo já são
> completos o suficiente para isso.

### B1. Bot_HorizonScraping — ajustar o robô existente (🟡 código pronto, falta configurar valores reais)

Já existia e exportava relatórios de 17-18 contas por e-mail
(`automations.id = 'c1b94e82-e3e7-4c74-bfd4-3a56df93df24'`, endpoint
antigo `https://botsplaywright.duckdns.org/automacoes/bot_HorizonScraping`
— **pasta renomeada em 2026-07-01 para
`automacoes/BOT_HorizonExport2Captcha`, novo endpoint
`.../automacoes/BOT_HorizonExport2Captcha`; `automations.endpoint` e o
workflow N8N ainda precisam ser atualizados pro nome novo**).
Os 3 ajustes abaixo foram implementados em
`automacoes/BOT_HorizonExport2Captcha/app.py` em 2026-07-01 (extensão
`buster_extension` removida do repositório; `playwright-stealth` também
aplicado no context do navegador):

1. **Captcha automático** — a Horizon exige reCAPTCHA v2 (checkbox "I'm not
   a robot") em toda abertura de sessão. Usar 2Captcha como resolvedor
   (chave de API provisionada só nesta VPS).
2. **Frequência** — cron de hora em hora (hoje roda 1x/dia às 06:00). **Não é
   código** — é o trigger do workflow N8N que chama
   `POST /automacoes/bot_HorizonScraping`; ajustar direto na tela do N8N.
3. **Destino** — em vez de enviar por e-mail, ao processar cada conta:
   a. `GET /api/horizon/credentials` para saber quais contas usar e com
      qual senha tentar (atual primeiro, depois cada candidata em ordem).
   b. Login: tentar a senha atual; se falhar, tentar cada candidata.
      - Se uma candidata funcionar → `POST /api/horizon/credential-status`
        com `{ email, status: 'ok', workingPassword: <senha que funcionou> }`.
      - Se nenhuma funcionar → `POST /api/horizon/credential-status` com
        `{ email, status: 'credential_error', error: '<mensagem>' }` e
        pular a conta (não trava as demais).
   c. Exportar o relatório da conta e enviar via `POST /api/horizon/ingest`
      (multipart, campo `files`).

### B2/B3/B4 — Desenho revisado em 2026-07-02 (substitui o desenho antigo abaixo)

> **Mudança de arquitetura importante.** O desenho original (webhook externo
> disparando `Bot_Maxtrack`, que trata "Alerta NV3 (sonolência grave)") foi
> **descartado** após investigação ao vivo na MaxTrack e no código existente.
> O usuário não sabe de onde veio a referência a "NV3" — não existe tal
> filtro no sistema real. Motivo da mudança: (1) o bot que já existe
> (`automacoes/BOT_MaxtrackTratamento`, projeto Node/TS separado, achado só
> depois de o usuário recolocar a pasta que tinha tirado do repo) não recebe
> webhook nenhum — é um daemon que fica varrendo a tela "Central de Eventos"
> da MaxTrack (`https://go.maxtrack.com.br`), que já vem **pré-filtrada só
> pra categoria "Análise de Fadiga (Global)"**; (2) o que esse bot faz hoje é
> só mover alerta de "Aberto" pra "Em tratativa" (reivindicar a fila),
> **não decide nada** — o tratamento de verdade (julgar se é fadiga real ou
> falso positivo) é manual, feito por um operador humano, porque exige
       julgamento sobre o vídeo/evidência.

**Confirmado com o usuário (2026-07-02):**
- Tratar evento de fadiga é sempre **manual** (humano) na MaxTrack — não dá
  pra automatizar essa decisão.
- O que falta automatizar é só a **réplica** do veredito: depois que um
  humano trata um alerta de fadiga na MaxTrack, o mesmo alerta precisa ser
  encontrado e marcado na Horizon com o mesmo resultado — **sem exceção**:
  tanto "Positivo" (fadiga confirmada) quanto "Falso positivo" precisam ser
  replicados na Horizon (a Horizon também acumula falsos positivos que
  precisam ser descartados lá).
- **Sem relatório/API pronta pra isso na MaxTrack**, mas existe export
  manual (botão "Exportar XLS/CSV/PDF" na aba "Fechados" da Central de
  Eventos, mesmo padrão do export da Horizon — só que assíncrono, processa
  como job e pode demorar bastante em datasets grandes; um teste com filtro
  de ~10 dias gerou CSV de 106MB e ficou minutos "aguardando para
  executar" na fila de processos do MaxTrack).

**Schema real do CSV exportado da aba "Fechados"** (delimitador `;`,
confirmado baixando um export real): `Empresa`, `Cliente`, `Operador`,
`Nome` (tipo do evento), `Status` (Finalizado/Auto Finalizado), `Data`,
`Identificador/Placa`, `Motorista`, `Matricula do Motorista`, `CPF`,
`Localidade`, `Início da Tratativa`, `Última Atualização`,
`Tipo de Classificação`, **`Classificação`** (`Positivo` / `Falso positivo`
/ vazio), `Motivo`, `Tipo de Evento` (=`Fadiga`), `Data finalização evento`.
**Achado importante:** a Horizon **não tem CPF** no seu export (confirmado
em `src/utils/fatigueParser.js`, mapa `horizon` só tem
`Motorista / Comandante`, sem CPF) — então o cruzamento entre plataformas
não pode depender de CPF, só **placa + nome do motorista (normalizado) +
janela de tempo próxima**, igual ao `CrossCheck.jsx` manual já faz hoje.

**Achado que simplifica tudo: o motor de import já suporta MaxTrack.**
`src/utils/fatigueParser.js` já tem `PLATFORM_COLUMN_MAPS.maxtrack` pronto e
bate exatamente com o schema acima (`Identificador/Placa`, `Motorista`,
`Classificação`, `Data finalização evento` etc. — provavelmente porque
`ImportModal` (upload manual) já foi usado com exports da MaxTrack antes).
Só que `server/horizon-routes.js:58` **trava `platformId = 'horizon'`** na
rota `POST /api/horizon/ingest` — não dá pra reusar essa rota pro MaxTrack
sem editar. Precisa de uma rota irmã nova.

**Arquitetura final (4 peças, cada uma um "automations" separado — pedido
explícito do usuário: "rodar simultaneamente… bem organizado e
performático"):**

1. ✅ **Bot Horizon** (B1, já implementado) — export hourly →
   `POST /api/horizon/ingest` → `driver_events` (`platform_id='horizon'`).
2. 🔶 **Bot MaxTrack** (novo escopo do B2) — mesmo padrão do B1: Playwright
   Python dentro do orquestrador FastAPI (`automacoes/`, não o projeto
   Node/TS separado — esse fica obsoleto/substituído), login na MaxTrack,
   vai em Central de Eventos → aba "Fechados", filtra período curto (ex:
   última 1h, pra não repetir o problema do export de 106MB), clica
   "Exportar CSV", **aguarda o job assíncrono terminar** (fila de processos
   do MaxTrack, ver ícone de sino no canto superior — pode demorar,
   precisa de polling com timeout/retry), baixa o arquivo, envia via
   `POST /api/maxtrack/ingest` → `driver_events` (`platform_id='maxtrack'`).

   **Lado MedNet ✅ implementado em 2026-07-02:**
   `server/maxtrack-routes.js` (`registerMaxtrackRoutes`, registrado em
   `server/index.js`) — cópia de `horizon-routes.js` só com `platformId =
   'maxtrack'` fixo e sem o branch XLSX (MaxTrack só exporta CSV). Reusa o
   middleware `requireHorizonBotToken` (exportado de `horizon-routes.js`,
   mesmo `HORIZON_BOT_TOKEN` — é o robô/VPS confiável, não um segredo
   exclusivo da Horizon apesar do nome). Automação `Bot_MaxtrackScraping`
   semeada em `20260702120000_maxtrack_ingest_automation.sql` (id
   `a1b94e82-e3e7-4c74-bfd4-3a56df93df28`, `trigger: 'agendado'`, `schedule:
   'a cada 1 hora'`), espelhando `Bot_HorizonScraping`.

   **Contrato:** `POST <MEDNET_API_BASE>/api/maxtrack/ingest`, header
   `Authorization: Bearer <HORIZON_BOT_TOKEN>`, multipart `files[]` (CSV(s)
   exportado(s) da aba "Fechados") — mesma resposta/idempotência de
   `/api/horizon/ingest` (ver contrato na Trilha A acima).

   Migration aplicada no Supabase real em 2026-07-02 ✅.

   **Lado robô ✅ escrito em 2026-07-02** (`bots_playwright`, repo
   separado): `automacoes/BOT_MaxtrackRelatorios/app.py` — mesmo padrão do
   `BOT_HorizonRelatorios` (perfil persistente, Stealth, timeout wrapper,
   screenshot em erro), mas login único via `MAXTRACK_USER`/
   `MAXTRACK_PASSWORD` (não é pool de contas como a Horizon) e sem
   2Captcha (nenhum captcha visto na MaxTrack até agora). Fluxo: login →
   "Central de Eventos" → aba "Fechados" → filtro de período (últimas
   `MAXTRACK_FILTRO_HORAS`h, default 2) → exporta CSV → poll da fila de
   "Processos" da MaxTrack até concluir → baixa → `POST
   /api/maxtrack/ingest`. Bot name pro orquestrador FastAPI:
   `BOT_MaxtrackRelatorios` (endpoint
   `/automacoes/BOT_MaxtrackRelatorios`, precisa registrar no N8N igual o
   B1). Env vars novas em `.env`/`.env.example` do robô:
   `MAXTRACK_USER`, `MAXTRACK_PASSWORD`, `MAXTRACK_FILTRO_HORAS`.

   ⚠️ **Diferença em relação ao B1:** os seletores do
   `BOT_HorizonRelatorios` vieram de uma gravação Codegen real; este bot
   não teve gravação, mas grande parte dos seletores **foi confirmada ao
   vivo** (usuário deu refresh na página que tinha travado, e a
   investigação seguiu) em 2026-07-02:
   - ✅ Confirmado: link "Central de Eventos" (dashboard), pills
     "Abertos/Fechados/Todos/Em espera" na Central de Eventos, link
     "Exportar" (o menu XLS/CSV/PDF abre por **hover**, não clique — bug
     que a primeira tentativa de automação teria caído), links "Exportar
     em formato XLS/CSV/PDF", painel "Processos" (abre sozinho depois do
     clique em "Exportar CSV", um card por job com nome/progresso/status),
     link "Baixar arquivo processado" (só aparece quando o job conclui).
     Um teste real (período de hoje, ~3.400 linhas na aba Fechados) levou
     **~10-15s** pra concluir o job — bem mais rápido que os minutos
     temidos, provavelmente porque o dataset de "hoje" é pequeno perto do
     teste de 10 dias/106MB feito antes.
   - ⚠️ **Achado que exigiu correção no código:** o link "Baixar arquivo
     processado" abre o arquivo numa **nova aba** em vez de disparar o
     evento `download` na página atual — o código original (baseado no
     padrão do B1, que usa `page.expect_download()` direto) teria
     falhado silenciosamente. Corrigido: `_clicar_e_aguardar_download()`
     registra listener tanto de `download` quanto de nova `page` no
     contexto, e usa o que resolver primeiro (a nova aba pode ela mesma
     disparar o download).
   - ❌ **Ainda não confirmado** (login nunca visto — sessão do usuário
     estava sempre ativa; e o filtro de período por data/hora não foi
     testado ao vivo, só o chip "Período: 02/07/2026" pré-existente foi
     visto, não a interação de editá-lo): seletores de
     `login_se_necessario()` e `aplicar_filtro_periodo_recente()`
     continuam best-effort, com fallback + log, não travam o resto do
     fluxo se falharem. **Ainda recomendado verificar esses dois pontos
     ao vivo antes do primeiro uso em produção** (idealmente num momento
     em que a sessão do Chrome logada expirar naturalmente, pra também
     poder gravar a tela de login).
3. ✅ **Auto Cross-Check** — implementado em 2026-07-02 (peça nova,
   backend MedNet, **não é mais uma aba manual** — decidido aposentar
   `CrossCheck.jsx` da UI assim que o B3 estiver consumindo a fila).
   **Trigger escolhido pelo usuário: chamada direta no backend** (não
   trigger de banco) — `server/auto-crosscheck.js`, `runAutoCrossCheck(
   supabase, platformId)`, chamado logo após um ingest bem-sucedido em
   `horizon-routes.js` e `maxtrack-routes.js` (best-effort, try/catch,
   não derruba a resposta do ingest se falhar — mesmo espírito do log em
   `automation_logs`).
   - Lado MaxTrack (`platformId='maxtrack'`): pega eventos com
     `analise_ia_plataforma` em `Positivo`/`Falso positivo` que ainda não
     têm linha na fila, tenta achar par em
     `driver_events(platform_id='horizon')` por placa+nome normalizados
     (reaproveita `normalizePlate`/`normalizeText` de
     `src/modules/crosscheck/utils.js`, sem reescrever) dentro de uma
     janela de ±4h. Se achar par ainda não tratado na Horizon → grava
     pendência `status='pending'`; se o par já está tratado → `
     already_synced`; se não achar par nenhum → `no_horizon_match`.
   - Lado Horizon (`platformId='horizon'`): reavalia as pendências
     `no_horizon_match` (o evento Horizon que faltava pode ter acabado de
     chegar num ingest mais recente).
   - Nova tabela `horizon_treatment_queue`
     (`20260702130000_horizon_treatment_queue.sql`, aplicar no Supabase) —
     cada linha guarda `driver_event_id` (MaxTrack), `horizon_
     driver_event_id` (par, se achado), `classificacao`, `motivo_raw`
     (cópia de `driver_events.descricao`), **`intervencao_sugerida`** (já
     calculada aqui, usando a tabela de mapeamento confirmada — ver B3
     abaixo), `status`. **O B3 só vai precisar fazer `SELECT * WHERE
     status = 'pending'`**, sem lógica de mapeamento própria.
   - **Achado/correção nesta mesma implementação:** o mapa de colunas da
     MaxTrack em `fatigueParser.js` não capturava a coluna real `Motivo`
     (só tinha `Categoria`/`Descrição`, que não existem no export real) —
     corrigido pra `description: ['Motivo', 'Categoria', 'Descrição']`.
     Sem esse fix, `driver_events.descricao` ficaria sempre vazio pro
     MaxTrack e o mapeamento de `intervencao_sugerida` não teria dado
     real pra trabalhar. Suite de testes (`fatigueParser.test.js`, 16
     testes) rodada e passando depois do ajuste.
4. 🔶 **Bot_HorizonTreatment** (B3, código pronto em 2026-07-02, falta
   aplicar migration de correção + configurar N8N + primeiro teste real
   — ver seção detalhada abaixo) — pra cada pendência que o Auto
   Cross-Check encontrar, replica o mesmo veredito na Horizon (login +
   localizar alerta por placa/motorista/tempo + marcar como Positivo ou
   Falso Positivo, o que for). Login/captcha/2Captcha já resolvidos pelo B1,
   reaproveita.

   **Tela de tratamento investigada ao vivo em 2026-07-02**
   (`/dashboard/AlertasSafety`, aba "Alertas", filtro "Tipo Violação" só
   "Fadiga" — confirma que só eventos de fadiga aparecem aqui, igual
   MaxTrack). Cada alerta tem modal "Detalhes da Violação" com aba
   "Tratativa" e 3 tipos de tratativa via radio button:
   - **Procedente** — campo obrigatório "Intervenção" (dropdown), evidência
     opcional. **Lista completa (via DOM, sem truncar)** — é uma lista fixa
     compartilhada (aparece igual não importa qual alerta abriu o modal,
     mistura item de "Olhando pro Painel" junto com os de "Fadiga"):
     1. `Fadiga - Positivo - Não necessário intervenção`
     2. `Fadiga - Positivo - Acompanhamento na jornada`
     3. `Fadiga - Positivo - Intervenção realizada e motorista liberado
        para seguir`
     4. `Fadiga - Positivo - Intervenção realizada e motorista inapto
        para seguir`
     5. `Fadiga - Positivo - Tentativa de intervenção sem sucesso`
     6. `Olhando para o Painel / Fora da via - Positivo - Não foi
        necessário intervenção`
     **Confirmado pelo usuário: o bot sempre vai usar "Procedente"** pra
     evento confirmado (não usa "com abono").
   - **Procedente (com abono do Motorista)** — não usado pelo bot (decisão
     do usuário acima).
   - **Justificada** — campo obrigatório "Escolha o tipo do motivo"
     (dropdown) + "Observações" (texto obrigatório) + evidência opcional.
     Opções de motivo vistas: "Óculos (Escuros ou de grau)", "Vídeo
     indisponível", "Outro (informar na observação)", "Característica
     pessoal - Olhos", "Imagem não visível", "Fora do Parâmetro".
     **Confirmado pelo usuário em 2026-07-02: essa tratativa NÃO pode ser
     usada pelo bot** — Horizon tem viés de tratar quase tudo como
     positivo lá, então "Justificada" fica fora de cogitação mesmo pra
     falso positivo da MaxTrack.

   **Conclusão de arquitetura (ajustada em 2026-07-02, 2 rodadas de
   feedback do usuário):**
   - Tratativa na Horizon é **sempre "Procedente"**, tanto pra Positivo
     quanto pra Falso Positivo da MaxTrack (não usa "Justificada" nem "com
     abono"). O propósito de tratar os falsos positivos na Horizon não é
     registrar divergência lá (a plataforma não comporta isso bem), é só
     garantir que nenhum alerta fique pendente sem tratativa.
   - **Porém o campo "Intervenção" (dentro de Procedente) precisa de
     lógica real de mapeamento, não um valor fixo único.** A MaxTrack já
     registra o tipo de intervenção que o operador aplicou no
     tratamento manual (visto no "Atividades" do alerta e/ns no export:
     categorias como "Acompanhamento de jornada", "Intervenção
     Realizada", "Olhando para o Painel" — "Desatenção" é uma das mais
     frequentes). B3 precisa ler essa classificação específica do
     MaxTrack (via CSV export ou Atividades) e escolher a opção
     equivalente da lista de 6 acima — cai em
     "Fadiga - Positivo - Não necessário intervenção" só como
     **fallback** quando a MaxTrack não trouxer detalhe suficiente pra
     mapear, não como regra geral.
   - Nenhum campo foi de fato submetido nessa investigação da tela Horizon
     (modais só cancelados, sem alterar dado real de produção).

   **Dado real da MaxTrack levantado em 2026-07-02** (via
   `Import-Csv -Delimiter ';'` no export de 149.602 linhas já baixado —
   ver arquivo em Downloads citado antes). A coluna `Motivo` é uma
   **lista de tags separadas por `;`** (não um valor único), livre
   combinação de severidade + causa + ação. Contagens reais:
   - **`Classificação`**: `Positivo` (103.766), `Nâo classificado`
     (26.620 — alerta nunca avaliado, não é Positivo nem Falso positivo,
     **irrelevante pro cross-check**, só entram Positivo/Falso positivo),
     `Falso positivo` (19.215).
   - **Tags de `Motivo` nos `Falso positivo`** (só causas de falso alarme
     da IA, nenhuma menciona fadiga real): `Sem olhos fechados` (15.889),
     `Outro Motivo (especifique)` (1.769), `Óculos (escuros/grau)`
     (1.368 combinado com "Sem olhos fechados"), `Cantando/Sorrindo`,
     `Espirro/Tosse`, `Câmera embaçada`, `Câmera mal posicionada`,
     `Boné/Capacete`.
   - **Tags de `Motivo` nos `Positivo`**: `Desatenção` sozinha ou com
     sub-causa (`Alimentos/Bebidas`, `Cigarro`, `Celular/Rádio`) — 45.200
     + variantes, **sem menção a fadiga** (é evento de atenção, não
     sonolência); `Fadiga Leve/Moderada/Grave` sozinha (sem tag de
     intervenção) — 23.834 / 10.577 / 427; `Fadiga [severidade] +
     Intervenção com motorista` — 911 (Grave) + 666 (Moderada) + 93
     (Leve) + 600 (`Intervenção com motorista` sozinha); `Chamado
     aberto`/`Chamado não aberto` (contato com motorista tentado ou não —
     359 / 2.498); `INTERVENÇÃO JÁ SOLICITADA AGUARDANDO A PARADA` (285,
     +247 com Fadiga Moderada, +146 com Fadiga Grave); `Fadiga Moderada +
     PARADA PREVENTIVA` (166).
   - **Campo `Última Observação` está sempre vazio** nas linhas com
     `Intervenção com motorista` testadas (amostra de 8) — **não existe
     no export nenhum campo que diga se o motorista foi "liberado para
     seguir" ou considerado "inapto para seguir"**. Ou essa distinção fica
     só na aba "Atividades" do alerta dentro da MaxTrack (não capturada no
     CSV, precisaria de scraping ponto-a-ponto por alerta, inviável em
     escala) ou simplesmente não é um dado que a MaxTrack registra
     estruturado.

   **Mapeamento confirmado pelo usuário em 2026-07-02:**
   | Motivo contém | → Intervenção Horizon |
   |---|---|
   | `Desatenção` (com/sem sub-causa), sem tag de Fadiga | 6. Olhando p/ Painel / Fora da via - Não foi necessário intervenção |
   | `Fadiga [qualquer severidade — Leve/Moderada/Grave]` sozinha, sem tag de intervenção | 1. Fadiga - Não necessário intervenção (confirmado: mesma opção pras 3 severidades, não escala pra "Acompanhamento na jornada") |
   | `Intervenção com motorista` ou `PARADA PREVENTIVA` | 3. Intervenção realizada e motorista liberado para seguir (confirmado: padrão fixo "liberado", já que a MaxTrack não distingue liberado/inapto no export) |
   | `INTERVENÇÃO JÁ SOLICITADA AGUARDANDO A PARADA` | 5. Tentativa de intervenção sem sucesso |
   | Falso positivo (qualquer motivo) | 1. Fadiga - Não necessário intervenção (fallback, dispensa) |
   | Motivo vazio / caso não mapeado | 1. Fadiga - Não necessário intervenção (fallback) |

   Opção 4 ("motorista inapto para seguir") **fica sem uso pelo bot** —
   não há sinal na MaxTrack pra justificar essa escolha automaticamente;
   se precisar no futuro, teria que ser revisão manual fora do B3.

**Decidido em 2026-07-02:** projeto Node/TS antigo (`BOT_MaxtrackTratamento`,
só movia Aberto→Tratativa) **removido** de `bots_playwright` (`git rm -r`,
staged — falta só o usuário commitar). `MAXTRACK_USER`/`MAXTRACK_PASSWORD`
já configurados no `.env` real do robô.

**B2 (MaxTrack export): código + N8N concluídos em 2026-07-02.** Fluxo de
export/download confirmado ao vivo (ver seção B2 acima); ainda faltam
confirmar só `login_se_necessario()` (sessão do usuário nunca expirou pra
ver a tela real) e `aplicar_filtro_periodo_recente()` (chip de período
visto, mas não a interação de editá-lo) — não bloqueia produção, só
significa que o primeiro export real pode sair sem filtro de data
(idempotente, não quebra nada) até alguém confirmar esses dois seletores
ao vivo.

**B3 (Bot_HorizonTreatment): implementado em 2026-07-02.** Migration da
fila (`20260702130000_horizon_treatment_queue.sql`) aplicada em produção
pelo usuário. Código novo:

- `server/horizon-routes.js` — 2 rotas novas, protegidas por
  `requireHorizonBotToken`:
  - `GET /api/horizon/treatment-queue` — devolve as pendências
    `status='pending'` (id, placa, nome, ocorrido_em, classificacao,
    motivo_raw, intervencao_sugerida, tentativas), ordenadas por
    `ocorrido_em`, limit 500.
  - `POST /api/horizon/treatment-queue/:id/resolve` — body
    `{status, erro?}`, `status` um de `done|error|no_horizon_match`.
    Em `done` limpa o campo `erro`; em qualquer outro status incrementa
    `tentativas` e grava `erro`.
- `bots_playwright/automacoes/BOT_HorizonTreatment/app.py` — robô novo,
  reaproveita quase verbatim o login/captcha/2Captcha/perfil persistente
  do B1 (`resolver_recaptcha_se_necessario`, `desativar_gerenciador_senha`,
  padrão de `launch_persistent_context` + Stealth). Fluxo:
  1. `buscar_credenciais_mednet` (endpoint já existente do B1) +
     `buscar_fila_pendente_mednet` (endpoint novo acima).
  2. Pra cada conta Horizon cadastrada (loop — ver decisão de matching
     abaixo), login e navega pra `/dashboard/AlertasSafety`.
  3. `configurar_filtro_fadiga` — marca checkbox "Fadiga", desmarca
     "Telemetria"/"Comportamento" (mesmo padrão do filtro do B1, mas essa
     tela usa checkboxes diferentes dos do Histórico de Condução).
  4. Pra cada pendência ainda não resolvida: `filtrar_por_placa` (grid
     tem 9 inputs de filtro por coluna, sem botão/Enter — filtro é
     live/auto-apply, confirmado ao vivo) → `localizar_linha_com_evento`
     (compara `Data/Hora Evento` de cada linha filtrada com o
     `ocorrido_em` da pendência via regex, pega a mais próxima dentro de
     4h) → clica no botão de ação rápida "Tratativa" da linha (abre o
     modal já direto na aba certa, sem passar por "Detalhes da
     Violação") → marca radio `"Procedente"` (`exact=True`, senão bate
     também com "Procedente com abono do Motorista") → abre o combobox
     "Intervenção" → clica na `option` com texto exatamente igual a
     `intervencao_sugerida` → clica "Finalizar" → espera o modal fechar
     como sinal de sucesso.
  5. Reporta cada resultado via `resolver_pendencia_mednet` (`done` ou
     `error` com a mensagem da exceção).

  **Confirmado ao vivo em 2026-07-02** (login manual do usuário na Horizon,
  nenhum "Finalizar" real foi clicado — só `Cancelar`, sem side-effect):
  toda a estrutura do modal de Tratativa (radio `role=radio
  name="Procedente"` exato, combobox `role=combobox`, 6 `option`s com
  texto idêntico ao já cravado em `sugerirIntervencaoHorizon`, botão
  "Finalizar" só habilita depois de escolher a Intervenção), o botão de
  ação rápida "Tratativa" por linha da grade, e o filtro de placa
  live/auto-apply. **Não confirmado** (não dá pra testar sem side-effect
  real): o que acontece exatamente depois de clicar "Finalizar" de
  verdade — o bot assume que o modal fechar sozinho é sucesso; se não
  fechar em 15s, trata como erro.

  **Decisão sobre qual conta Horizon usar por pendência:** hoje só existe
  **1 conta Horizon cadastrada** (`label: "ALP"`,
  `horizonapltfdzero@gmail.com`) — confirmado consultando
  `horizon_credentials` direto via REST/PostgREST com a
  `SUPABASE_SERVICE_ROLE_KEY` do `.env` (banco é self-hosted na VPS, não
  o projeto Supabase cloud). `driver_events.transportadora` está **sempre
  `NULL`** nos dados reais hoje (0 linhas `platform_id IN
  ('horizon','maxtrack')` — os 7645 registros existentes são todos
  `platform_id='sascar'`, plataforma antiga). Sem campo confiável pra
  mapear pendência → conta, o B3 **tenta cada conta Horizon cadastrada em
  sequência** até achar a placa (login 1x por conta, filtra fadiga, tenta
  achar cada pendência ainda pendente na lista daquela conta). Funciona
  hoje com 1 conta só e escala sem mudança de código quando as outras
  ~16-17 contas forem cadastradas — só fica mais lento (mais logins) se
  muitas pendências não baterem nas primeiras contas tentadas.
- Nova migration `20260702140000_fix_horizon_treatment_automation.sql` —
  o registro `Bot_HorizonTreatment` já existia (semeado em
  `20260701150000_horizon_credentials.sql`) mas com a arquitetura antiga
  (`trigger='evento'`, disparado por "Atendimento registrado (MaxTrack)"
  vindo da tela `CrossCheck.jsx` manual, endpoint em minúsculo
  `bot_HorizonTreatment`). Corrigido pra `trigger='agendado'`, `schedule='a
  cada 15 minutos'`, `endpoint=.../BOT_HorizonTreatment` (maiúsculo,
  consistente com B1/B2), `event_type=null` — reflete a arquitetura real
  (polling da fila via Auto Cross-Check, não mais evento manual).

**Migration de correção e N8N: concluídos em 2026-07-02.** Migration
`20260702140000_fix_horizon_treatment_automation.sql` aplicada em
produção. Workflow N8N do B3 montado (Schedule 15min → POST
`/automacoes/BOT_HorizonTreatment` com `background=true` → Wait → GET
`/tasks/{task_id}`), duplicado do padrão já validado do B1/B2.

**Arquitetura completa fechada:** B1 (Horizon) + B2 (MaxTrack) alimentam
`driver_events` → Auto Cross-Check popula `horizon_treatment_queue` →
B3 consome a fila e replica a tratativa na Horizon. Todas as 4 peças
têm código pronto e agendadas no N8N.

**Pendente pra próxima sessão:**
- Rodar o B3 pela primeira vez em produção com uma pendência real pra
  confirmar o comportamento pós-"Finalizar" (não testável sem
  side-effect real na Horizon) — hoje o bot só assume sucesso se o modal
  fechar sozinho em até 15s.
- Cadastrar as demais contas Horizon em `/admin/integracoes/horizon`
  (hoje só "ALP" existe) — o B3 já escala pra isso sem mudança de código.
- Aposentar `CrossCheck.jsx` da UI assim que o B3 estiver consumindo a
  fila de verdade em produção (decidido, não fazer antes disso
  funcionar).

---

<details>
<summary>Desenho original do B2/B3/B4 (obsoleto, mantido só pra histórico)</summary>

### B2. Bot_Maxtrack — refazer do zero (ARQUITETURA DESCARTADA — ver acima)

O bot atual (`automations.id = 'b0a94e82-e3e7-4c74-bfd4-3a56df93df23'`,
endpoint `.../automacoes/bot_Maxtrack`) está bem inicial e com vários
erros — **não corrigir incrementalmente, reescrever do zero**.

Responsabilidade: ao receber um webhook de evento (hoje cadastrado como
`event_type: 'Alerta NV3 (sonolência grave)'`, disparado pela origem do
alerta direto pra VPS — não passa pelo MedNet), tratar automaticamente o
alerta na MaxTrack (login + localizar o alerta + marcar como tratado).

Pontos a levantar na nova sessão (este repositório não tem visibilidade
sobre a implementação atual do bot nem sobre quem dispara o webhook):
- Payload real do webhook de origem — confirmar schema com quem o envia.
- Autenticação/manutenção de sessão na MaxTrack (login, se há expiração e
  reautenticação; avaliar se faz sentido replicar a lógica de rotação de
  senha da B1 caso a MaxTrack também troque senha com frequência).
- Gravação de `automation_logs` real (a linha hoje na tabela `automations`
  é só um exemplo semeado na migration original — sem execução real por
  trás).
- Encadear, após tratar com sucesso, o passo da B3 internamente (ver B4).

### B3. Bot_HorizonTreatment — robô novo

Recebe `{ motorista, placa, transportadora, tipo, timestamp }` (via HTTP do
MedNet — Trilha C2 — ou internamente do Bot_Maxtrack — B4) e replica o
tratamento na Horizon:

1. Localizar em qual das 17-18 contas Horizon está a placa (**pendência:**
   existe hoje algum mapeamento placa→conta, ou é preciso varrer todas as
   contas a cada chamada? Se não houver mapeamento, varrer é mais lento mas
   funcional).
2. Logar na conta certa, reaproveitando a lógica de credenciais dinâmicas +
   rotação de senha da B1 (mesmo `GET /api/horizon/credentials` e mesmo
   `POST /api/horizon/credential-status`).
3. Localizar o alerta correspondente (placa + motorista + janela de tempo
   próxima ao `timestamp` recebido) e marcar como tratado na interface da
   Horizon.
4. Gravar `automation_logs` para a automação `Bot_HorizonTreatment` (id
   `f0a94e82-e3e7-4c74-bfd4-3a56df93df27`, já semeada no MedNet) —
   sucesso ou falha. Endpoint desse bot deve ser cadastrado/atualizado na
   tabela `automations` do MedNet (`endpoint`, `token`) para que o disparo
   da Trilha C2 funcione — hoje está com o placeholder
   `https://botsplaywright.duckdns.org/automacoes/bot_HorizonTreatment`.

### B4. Encadeamento automático (Bot_Maxtrack → Bot_HorizonTreatment)

Esse caminho não passa pelo MedNet (webhook externo → VPS direto). Depois
que o `Bot_Maxtrack` (B2) trata um alerta automaticamente, ele deve chamar
a lógica da B3 **internamente** (mesmo processo/workflow, reaproveitando
placa/motorista/timestamp já disponíveis no contexto da execução) — sem
round-trip HTTP externo.

</details>

---

## Pendências a confirmar antes de codar a Trilha B

1. **2Captcha** — provisionar a chave de API na VPS.
2. **`<MEDNET_API_BASE>`** — qual é o domínio de produção do backend
   Express do MedNet, para configurar no `.env` do robô.
3. **Payload real do webhook que dispara o `Bot_Maxtrack`** — confirmar
   schema com quem o envia (fora do MedNet, na origem do alerta).
4. **Mapeamento placa→conta Horizon** — existe hoje, ou o robô de
   tratamento (B3) precisa varrer as 17-18 contas a cada chamada?
5. **Formato real do export Horizon** — comparar com as colunas listadas na
   Trilha A antes de assumir 100% de compatibilidade; se não bater, é
   ajuste pontual do lado MedNet, não muda o contrato.

---

## Verificação

**Trilha A/C1/C2 (já concluídas neste repositório):**
- `curl -F "files=@export_horizon.xlsx" -H "Authorization: Bearer $HORIZON_BOT_TOKEN" <MEDNET_API_BASE>/api/horizon/ingest` com export real; conferir linhas em `driver_events` com `platform_id = 'horizon'`; reenviar o mesmo arquivo e confirmar que não duplica.
- Simular falha de login via `POST /api/horizon/credential-status` com `status: 'credential_error'`, confirmar que aparece em `/admin/integracoes/horizon`; depois enviar `workingPassword` e confirmar que `password` é atualizado e `status` volta a `ok`.
- No Monitor, com `platformId = 'maxtrack'` selecionado, tratar/descartar/reportar um alerta e confirmar (DevTools/network) que a chamada para o endpoint de `Bot_HorizonTreatment` é disparada — e que uma falha nessa chamada não impede o atendimento de ser salvo.
- `npm run lint` e `npm test` — já rodados sem regressões em 2026-07-01.

**Trilha B (quando estiver pronta, testar na VPS):**
- Simular login com senha errada → confirmar que `credential-status` marca `credential_error` e aparece no MedNet.
- Corrigir a senha (ou o robô descobrir a candidata certa) → confirmar que o status volta a `ok` e a senha é promovida.
- Rodar uma ingestão manual → conferir no MedNet (`/admin/analytics`, fonte Horizon) que os eventos aparecem.
- Registrar um atendimento MaxTrack no Monitor do MedNet → confirmar que `Bot_HorizonTreatment` recebe a chamada e trata o alerta correspondente na Horizon.
- Disparar um `Alerta NV3` sintético → confirmar que `Bot_Maxtrack` trata na MaxTrack **e** encadeia o tratamento na Horizon sem chamada HTTP extra.
