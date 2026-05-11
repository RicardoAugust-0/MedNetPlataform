// TEMPLATE: ponto de partida para adicionar uma nova plataforma.
//
// Copie esta pasta para src/platforms/<id>/, ajuste os valores, implemente
// o(s) bloco(s) de ingestão (spreadsheet, api, scraper) e registre o adapter
// em src/platforms/index.js.
//
// Veja o guia completo: docs/PLATFORMS.md
// Contrato: ../base.js

// import { normalize } from '../shared/normalize.js';
// import { parseSpeed, parseEventDate, parseTurno, maxSeveridade } from '../shared/parsers.js';
// import { buildClearMap, isAfterClear } from '../shared/history.js';

const TEMPLATE_ADAPTER = {
  // ── Metadata ──
  id:          'template',                     // slug único kebab-case (ex: 'maxtrack')
  name:        'Template',                     // nome curto
  label:       'Template (exemplo)',           // descrição longa
  sistema:     'TEMPLATE',                     // valor enviado p/ Google Sheets (uppercase)
  portalUrl:   null,                           // URL do portal (ou null)
  description: 'Template para criação de novos adapters.',
  status:      'planned',                      // 'planned' enquanto não implementado

  // ── Modo de ingestão ──
  // 'spreadsheet' | 'api' | 'scraper'
  inputType:   'spreadsheet',

  // ── Taxonomia de eventos (filtros do Monitor) ──
  taxonomy: {
    intervencao: [],   // ex: ['Sonolência', 'Bocejo']
    reportar:    [],   // ex: ['Distração', 'Celular']
    tecnico:     [],   // ex: ['Câmera obstruída']
  },

  // Escala de severidade desta plataforma (max → min).
  severidades: ['Gravíssimo', 'Grave', 'Normal'],

  // ── Bloco modo planilha ──
  spreadsheet: {
    accept:      '.xlsx,.xls,.csv',
    uploadTitle: 'Solte aqui o relatório da plataforma',
    uploadHint:  '.xlsx · .xls · .csv',

    // Score 0..1 de quão certo estamos que esta planilha é nossa.
    detect(/* { fileName, headers } */) {
      // Exemplo: validar presença de headers obrigatórios.
      // const norm = headers.map(normalize);
      // return norm.includes('placa') && norm.includes('evento') ? 0.9 : 0;
      return 0;
    },

    // Parser principal. Recebe (file, { history }) e devolve { drivers, stats }.
    // Veja src/platforms/sascar/parser.js para exemplo completo.
    async parse(/* file, { history } */) {
      throw new Error('Template não implementado. Copie e ajuste para sua plataforma.');
    },
  },

  // ── Bloco modo API (alternativa a spreadsheet) ──
  // api: {
  //   pollIntervalMs: 60_000,
  //   async pull({ history }) {
  //     // 1. Buscar eventos da API (use Edge Function para guardar credenciais)
  //     // 2. Aplicar buildClearMap(history) para filtrar pré-atendidos
  //     // 3. Devolver { drivers, stats } no formato canônico
  //     throw new Error('API pull não implementado.');
  //   },
  // },

  // ── Bloco modo scraper (alternativa) ──
  // scraper: {
  //   endpoint: '/functions/v1/scrape-template',
  //   async pull({ history }) {
  //     const res = await fetch(this.endpoint, { method: 'POST', body: JSON.stringify({ since: '...' }) });
  //     return await res.json();
  //   },
  // },
};

export default TEMPLATE_ADAPTER;
