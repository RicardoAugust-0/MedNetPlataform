// Adapter da plataforma Sascar (Michelin Smart Camera).
//
// Modo de ingestão: 'spreadsheet' (operador faz upload do relatório xlsx/csv).
// Documentação completa do contrato: ../base.js
// Lógica do parser e regras de negócio: ./parser.js
// Mapeamento de colunas e taxonomia: ./columns.js

import { TAXONOMY } from './columns.js';
import { parse, detect } from './parser.js';

const sascar = {
  // ── Metadata ──
  id:          'sascar',
  name:        'Sascar',
  label:       'Sascar (Michelin Smart Camera)',
  sistema:     'SASCAR',
  portalUrl:   'https://www.smartcamera.michelin.com/login/pc/login',
  description: 'Câmeras embarcadas Smart Camera (Michelin). Análise via relatório "Detalhes de evento" exportado em xlsx/csv.',
  status:      'active',
  inputType:   'spreadsheet',

  // ── Capacidades ──
  taxonomy:     TAXONOMY,
  severidades:  ['Gravíssimo', 'Grave', 'Normal'],

  // ── Modo planilha ──
  spreadsheet: {
    accept:      '.xlsx,.xls,.csv',
    uploadTitle: 'Solte aqui o relatório de detalhes de evento do Sascar',
    uploadHint:  '.xlsx · .xls · .csv  ·  Falsos positivos removidos automaticamente',
    detect,
    parse,
  },

  // ── Modos futuros (api/scraper) ──
  // Sascar não expõe API pública hoje; se ficar disponível, popular aqui.
  api:     null,
  scraper: null,
};

export default sascar;
