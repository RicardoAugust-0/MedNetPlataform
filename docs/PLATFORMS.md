# Guia · Adicionar uma nova plataforma de monitoramento

Este guia explica como integrar uma nova plataforma (Maxtrack, Autotrack,
Trimble, etc.) ao Monitor da MedNet. Para o panorama geral do projeto, veja
[PROJECT.md](./PROJECT.md).

---

## 1. Visão geral

O Monitor é desacoplado da plataforma de origem. Toda a lógica específica de
um sistema (Sascar, Maxtrack, …) fica em `src/platforms/<id>/`. A UI consulta
um **registry** (`src/platforms/index.js`) para descobrir as plataformas e
despachar parse/pull, sem precisar conhecer nenhum detalhe.

### 1.1. Modos de ingestão suportados

| Modo | Quando usar | Quem implementa |
|---|---|---|
| `spreadsheet` | A plataforma exporta um relatório que o operador faz upload (xlsx/csv). | O adapter expõe `spreadsheet.parse(file, ctx)`. |
| `api` | A plataforma tem API REST com credenciais. | O adapter expõe `api.pull(ctx)` — chamado em polling. |
| `scraper` | Sem API; é preciso scrapear o portal. | O adapter expõe `scraper.pull(ctx)` que chama uma Edge Function dedicada. |

Sascar é `spreadsheet` (modo padrão) e também suporta `scraper` via bookmarklet
(modo beta). Maxtrack provavelmente será `api` (se houver credenciais) ou `scraper`.

### 1.2. Sascar — modo duplo (spreadsheet + scraper)

A Sascar é a única plataforma atualmente com dois modos de ingestão disponíveis:

| Modo | Como funciona | Quando usar |
|---|---|---|
| `spreadsheet` | Operador exporta o relatório no portal e faz upload manual (xlsx/csv). | Sempre disponível; não requer configuração extra. |
| `scraper` (beta) | O MedNet busca os alertas automaticamente usando o `AUTH_TOKEN` do portal Sascar. O operador clica o **bookmarklet** uma vez por turno para enviar o token. | Quando o operador quer eliminar o upload manual. |

#### Por que bookmarklet e não login automático?

O portal Sascar exige **CAPTCHA server-side** no endpoint de login
(`/gateway/base-server-service/api/v1/user/login`). Isso torna inviável
qualquer automação de credenciais. A solução é ler o `AUTH_TOKEN` que o portal
já armazena em `localStorage` após o operador fazer login manualmente, e
enviá-lo ao MedNet com um único clique em um favorito do navegador (bookmarklet).

#### Fluxo resumido do modo scraper

1. Operador faz login no portal Sascar normalmente (usuário + senha + CAPTCHA).
2. Clica o bookmarklet salvo na barra de favoritos — o token é capturado e
   enviado à Edge Function `sascar-token` do MedNet.
3. O MedNet renova o token automaticamente via
   `/gateway/base-server-service/api/v1/user/refresh` enquanto houver atividade.
4. Se o token expirar (idle > 30 min), um banner no MedNet solicita um novo
   clique no bookmarklet.

O bookmarklet é exibido em **Meu Perfil → Integrações → Sascar** dentro do
MedNet, pronto para arrastar até a barra de favoritos.

#### Mapeamento de tipos de alarme (Sascar API)

| `alarmType` | Evento (pt-BR) | Categoria MedNet |
|---|---|---|
| `56001` | Bocejo | INTERVENÇÃO |
| `56003` | Olho Fechado | INTERVENÇÃO |
| `56016` | Distração | INTERVENÇÃO |
| `0` | Video Loss | TÉCNICO |
| outros | — | REPORTAR |

> Os mapeamentos acima são a melhor estimativa atual e devem ser validados com
> dados reais de produção antes de promover o modo scraper para `'active'`.

---

## 2. Anatomia de um adapter

```js
// src/platforms/<id>/index.js
import { TAXONOMY } from './columns.js';
import { parse, detect } from './parser.js';

export default {
  // ── Metadata ──
  id:          'maxtrack',                        // slug único kebab-case
  name:        'Maxtrack',                        // exibido na UI
  label:       'Maxtrack (Telemetria)',           // descrição longa
  sistema:     'MAXTRACK',                        // enviado p/ Google Sheets
  portalUrl:   'https://...',                     // ou null
  description: 'Telemetria veicular Maxtrack.',
  status:      'active',                          // 'active' | 'beta' | 'planned'

  // ── Modo ──
  inputType:   'spreadsheet',                     // 'spreadsheet' | 'api' | 'scraper'

  // ── Taxonomia (alimenta o filtro de eventos) ──
  taxonomy: {
    intervencao: ['Sonolência', 'Bocejo'],
    reportar:    ['Distração', 'Celular'],
    tecnico:     ['Câmera obstruída'],
  },

  // ── Escala de severidade (max → min) ──
  severidades: ['Gravíssimo', 'Grave', 'Normal'],

  // ── UM dos três blocos abaixo ──
  spreadsheet: { accept, uploadTitle, uploadHint, detect, parse },
  api:         null,
  scraper:     null,
};
```

📄 **Contrato detalhado:** `src/platforms/base.js`

---

## 3. Passo a passo (modo spreadsheet — caso mais comum)

### 3.1. Copie o template

```bash
cp -r src/platforms/_template src/platforms/maxtrack
```

### 3.2. Ajuste o metadata em `src/platforms/maxtrack/index.js`

- Troque `id`, `name`, `label`, `sistema`, `portalUrl`, `description`.
- Defina `status: 'beta'` enquanto valida; mude para `'active'` quando estiver ok.

### 3.3. Crie o mapa de colunas (`columns.js`)

```js
export const COLUMNS = {
  status:         'Status',
  placa:          'Placa',
  motorista:      'Condutor',          // pode variar!
  transportadora: 'Empresa',
  frota:          'Frota',
  evento:         'Evento',
  categoria:      'Tipo',
  severidade:     'Criticidade',
  hora:           'Data/Hora',
};

export const INTERVENCAO_EVENTOS = ['Bocejo', 'Sonolência'];
export const TECNICO_EVENTOS     = ['Câmera obstruída'];
// ...

export const TAXONOMY = {
  intervencao: ['Bocejo', 'Sonolência'],
  reportar:    ['Distração', 'Celular'],
  tecnico:     ['Câmera obstruída'],
};
```

### 3.4. Implemente o parser (`parser.js`)

Use os helpers compartilhados:

```js
import { normalize } from '../shared/normalize.js';
import { parseSpeed, parseEventDate, parseTurno, maxSeveridade } from '../shared/parsers.js';
import { buildClearMap, isAfterClear } from '../shared/history.js';
import { COLUMNS, INTERVENCAO_EVENTOS, /* ... */ TAXONOMY } from './columns.js';

export function detect({ fileName = '', headers = [] } = {}) {
  const norm = headers.map(normalize);
  const required = [COLUMNS.placa, COLUMNS.evento, COLUMNS.hora].map(normalize);
  const score = required.filter((r) => norm.includes(r)).length / required.length;
  return /maxtrack/i.test(fileName) ? Math.max(score, 0.8) : score;
}

export async function parse(file, { history = [] } = {}) {
  const XLSX = await import('xlsx');
  const clearMap = buildClearMap(history);
  // ... lê o arquivo, agrupa por placa, classifica eventos, aplica filtros ...
  return { drivers, stats };
}
```

📄 **Veja o exemplo de referência:** `src/platforms/sascar/parser.js` (totalmente comentado).

### 3.5. Registre no registry

`src/platforms/index.js`:

```js
import sascar   from './sascar/index.js';
import maxtrack from './maxtrack/index.js';

export const PLATFORMS = [sascar, maxtrack];
```

Pronto. O Monitor passa a exibir o seletor de plataforma automaticamente.

---

## 4. Passo a passo (modo API)

Quando a plataforma tem API REST:

```js
// src/platforms/maxtrack/index.js
export default {
  id:        'maxtrack',
  name:      'Maxtrack',
  sistema:   'MAXTRACK',
  inputType: 'api',
  // ...
  api: {
    pollIntervalMs: 60_000,
    async pull({ history }) {
      // 1. Buscar via fetch — use Edge Function se houver credenciais sensíveis
      const res = await fetch('/functions/v1/pull-maxtrack', { method: 'POST' });
      const raw = await res.json();

      // 2. Aplicar filtro de histórico (mesmo pipeline da Sascar)
      const clearMap = buildClearMap(history);

      // 3. Devolver no formato canônico
      return { drivers: /* ... */, stats: /* ... */ };
    },
  },
};
```

> 💡 Edge Function recomendada para guardar credenciais (token API) longe do browser.
> Veja `supabase/functions/append-sheet/index.ts` como exemplo de Edge Function autenticada.

A UI ainda precisa de pequena adaptação para chamar `api.pull` em vez do
upload manual — abrir uma issue se chegar a este ponto.

---

## 5. Passo a passo (modo scraper)

Quando não há API, scraping server-side via Edge Function:

```js
// src/platforms/horizon/index.js
export default {
  id:        'horizon',
  inputType: 'scraper',
  scraper: {
    endpoint: '/functions/v1/scrape-horizon',
    async pull({ history }) {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}${this.endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ since: '...' }),
      });
      return await res.json();    // { drivers, stats }
    },
  },
};
```

A Edge Function correspondente deve:
1. Autenticar a request (JWT do operador).
2. Logar no portal usando credenciais de service account (Supabase secrets).
3. Scrapear / extrair os dados, devolvendo o formato canônico.

---

## 6. Formato canônico de saída

Independente do modo, o parser/puller devolve:

### `drivers: Array<Driver>`

```ts
{
  nome:                 string;          // ou placa se anônimo
  placa:                string;
  transportadora:       string;
  frota:                string;
  turno:                'diurno' | 'noturno';
  alertas:              number;          // eventos p/ intervir
  tipos:                string[];        // tipos únicos de evento (intervenção)
  ultimoEvento:         Date | null;
  reportaveis:          number;          // eventos p/ reportar
  tiposReportar:        string[];
  ultimoEventoReportar: Date | null;
  tecnicos:             number;          // eventos técnicos
  tiposTecnico:         Record<string, number>;
  severidade:           'Gravíssimo' | 'Grave' | 'Normal';
  intervencoes:         number;          // legado, manter 0
}
```

### `stats: Stats`

```ts
{
  total:                  number;
  comIntervencao:         number;
  soReportar:             number;
  soTecnico:              number;
  totalEventos:           number;
  falsosPositivos:        number;
  filtradosPorVelocidade: number;
  filtradosPorHistorico:  number;
  autoDescartes: Array<{
    nome: string;
    placa: string;
    transportadora: string;
    count: number;
    motivo: string;        // ex: 'Regra Dinon · eventos de fumo'
  }>;
}
```

> Use `emptyDriver()` / `emptyStats()` de `src/platforms/base.js` para começar
> com defaults consistentes.

---

## 7. Helpers compartilhados

Reutilize estes módulos para evitar reinventar a roda:

| Helper | Importar de | Faz |
|---|---|---|
| `normalize(str)` | `shared/normalize.js` | Lowercase + sem diacríticos + trim |
| `containsAll(strNorm, tokens)` | `shared/normalize.js` | Match de múltiplos tokens |
| `parseSpeed(value)` | `shared/parsers.js` | Aceita number/string, devolve km/h ou null |
| `parseEventDate(value)` | `shared/parsers.js` | Date, número Excel, ou string PT-BR |
| `parseTurno(value)` | `shared/parsers.js` | Devolve `'diurno'`/`'noturno'` |
| `maxSeveridade([...])` | `shared/parsers.js` | Devolve a maior severidade da lista |
| `buildClearMap(history)` | `shared/history.js` | Constrói índice de "última ação" por placa |
| `isAfterClear(date, clearAt)` | `shared/history.js` | `true` se o evento veio depois |
| `emptyDriver()` / `emptyStats()` | `base.js` | Objetos canônicos zerados |

---

## 8. Checklist final

Antes de marcar a plataforma como `status: 'active'`:

- [ ] `npm run build` passa sem erros.
- [ ] `npm run lint` não introduz erros novos no diff.
- [ ] Upload de planilha real funciona — gravidade, severidade, turno, contagens.
- [ ] Filtros (turno, severidade, transportadora, evento) operam.
- [ ] Ações (atender, reportar, descartar) registram corretamente em `atendimentos`.
- [ ] Append em Google Sheets envia o `sistema` correto.
- [ ] Auto-descartes (se houver regra específica) registram silenciosamente.
- [ ] Histórico (aba histórico) mostra os atendimentos com tipo correto.
- [ ] Filtro de pré-atendimento funciona (eventos antigos descartados).

---

## 9. Convenções

- **Sem dependências entre adapters.** Cada `platforms/<id>/` é self-contained,
  só importa de `platforms/shared/` e `platforms/base.js`.
- **Sem hard-coding de plataforma no Monitor.** Se aparecer "Sascar" novamente
  no código fora da pasta `sascar/`, é bug.
- **Regras genéricas → `shared/`.** Se outra plataforma vai precisar da mesma
  lógica (ex.: filtro por velocidade, taxonomia de fumo), promova para `shared/`.
- **Comentários em PT-BR.** O time é brasileiro; mantenha consistência.

---

## 10. Onde está cada coisa

```
src/platforms/
├── base.js                 # Contrato + emptyDriver/emptyStats
├── index.js                # Registry: PLATFORMS, getPlatform, detectPlatform
├── shared/
│   ├── normalize.js        # normalize, containsAll
│   ├── parsers.js          # parseSpeed, parseEventDate, parseTurno, maxSeveridade
│   └── history.js          # buildClearMap, isAfterClear
├── sascar/                 # Adapter de referência
│   ├── index.js            # Metadata + bloco spreadsheet
│   ├── columns.js          # Mapa de colunas e taxonomia
│   └── parser.js           # Parser totalmente comentado
└── _template/              # Esqueleto para copiar
    └── index.js
```

Boas integrações.
