// Adapter da plataforma Maxtrack.
//
// Modo de ingestão: 'scraper' — a Edge Function `pull-maxtrack` autentica
// no portal Maxtrack e devolve os eventos do dia no formato canônico.
// Documentação do contrato: ../base.js

import { supabase } from '../../supabase.js';
import { TAXONOMY } from './columns.js';
import { parseApiResponse } from './parser.js';

const maxtrack = {
  // ── Metadata ──
  id:          'maxtrack',
  name:        'Maxtrack',
  label:       'Maxtrack (Telemetria + IA)',
  sistema:     'MAXTRACK',
  portalUrl:   'https://go.maxtrack.com.br/#event/Event',
  description: 'Telemetria veicular Maxtrack com análise de fadiga por IA. Dados puxados automaticamente via integração.',
  status:      'active',
  inputType:   'scraper',

  // ── Capacidades ──
  taxonomy:    TAXONOMY,
  severidades: ['Gravíssimo', 'Grave', 'Normal'],

  // ── Modos não usados ──
  spreadsheet: null,
  api:         null,

  // ── Modo scraper ──
  scraper: {
    async pull() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pull-maxtrack`,
        {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erro ao buscar dados Maxtrack: HTTP ${res.status}`);
      }

      const apiData = await res.json();
      return parseApiResponse(apiData);
    },
  },
};

export default maxtrack;
