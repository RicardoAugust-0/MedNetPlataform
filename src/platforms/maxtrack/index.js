// Adapter da plataforma Maxtrack.
//
// Modo de ingestão: 'spreadsheet' — o operador exporta o relatório no portal
// Maxtrack e faz upload manual (xlsx/csv).
// Documentação do contrato: ../base.js

import { TAXONOMY } from './columns.js';
import { detect, parse } from './parser.js';

const maxtrack = {
  // ── Metadata ──
  id:          'maxtrack',
  name:        'Maxtrack',
  label:       'Maxtrack (Telemetria + IA)',
  sistema:     'MAXTRACK',
  portalUrl:   'https://go.maxtrack.com.br/#event/Event',
  description: 'Telemetria veicular Maxtrack com análise de fadiga por IA.',
  status:      'active',
  inputType:   'spreadsheet',

  // ── Capacidades ──
  taxonomy:    TAXONOMY,
  severidades: ['Gravíssimo', 'Grave', 'Normal'],

  // ── Regras de Negócio ──
  rules: {
    slaLimitMin: 30,
    criticalAlertsCount: 8,
    minMovingSpeedKmh: 10,
  },


  // ── Modo planilha ──
  spreadsheet: {
    accept:      ['.xlsx', '.xls', '.csv'],
    uploadTitle: 'Relatório Maxtrack',
    uploadHint:  'Exporte o relatório do portal Maxtrack e carregue aqui (.xlsx, .csv)',
    detect,
    parse,
  },

  // ── Modos não usados ──
  api:     null,
  scraper: null,
};

export default maxtrack;
