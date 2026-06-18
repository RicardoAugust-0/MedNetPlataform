// Adapter da plataforma OmniLink.
//
// Modo de ingestão: 'spreadsheet' — o operador exporta o relatório no portal
// OmniLink e faz o upload manual (xlsx/xls/csv).

import { TAXONOMY } from './columns.js';
import { detect, parse } from './parser.js';

const omnilink = {
  // ── Metadata ──
  id:          'omnilink',
  name:        'OmniLink',
  label:       'OmniLink (Telemetria + Fadiga)',
  sistema:     'OMNILINK',
  portalUrl:   null,
  description: 'Telemetria veicular OmniLink com alertas de comportamento de motorista.',
  status:      'active',
  inputType:   'spreadsheet',

  // ── Capacidades ──
  taxonomy:    TAXONOMY,
  severidades: ['Gravíssimo', 'Grave', 'Normal'],

  // ── Modo planilha ──
  spreadsheet: {
    accept:      ['.xlsx', '.xls', '.csv'],
    uploadTitle: 'Relatório OmniLink',
    uploadHint:  'Carregue o relatório exportado do portal OmniLink (.xlsx, .csv)',
    detect,
    parse,
  },

  // ── Modos não usados ──
  api:     null,
  scraper: null,
};

export default omnilink;
