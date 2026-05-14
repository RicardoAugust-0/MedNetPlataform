// Adapter da plataforma Sascar (Michelin Smart Camera).
//
// Modo de ingestão: 'spreadsheet' (operador faz upload do relatório xlsx/csv).
// Documentação completa do contrato: ../base.js
// Lógica do parser e regras de negócio: ./parser.js
// Mapeamento de colunas e taxonomia: ./columns.js

import { TAXONOMY } from './columns.js';
import { parse, detect } from './parser.js';
import { supabase } from '../../supabase.js';

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

  api: null,

  // ── Modo scraper (busca automática via bookmarklet + Edge Function) ──
  // Requer token configurado em Meu Perfil → Integrações → Sascar.
  scraper: {
    async pull() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pull-sascar`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        },
      );

      const data = await res.json();
      if (!res.ok) {
        const err = new Error(data.error || `Erro Sascar: HTTP ${res.status}`);
        if (data.code) err.code = data.code;
        throw err;
      }

      return { drivers: data.drivers || [], stats: data.stats || {} };
    },
  },
};

export default sascar;
