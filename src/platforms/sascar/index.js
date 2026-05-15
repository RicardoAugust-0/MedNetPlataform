// Adapter da plataforma Sascar (Michelin Smart Camera).
//
// Modo de ingestão: 'spreadsheet' (operador faz upload do relatório xlsx/csv).
// Documentação completa do contrato: ../base.js
// Lógica do parser e regras de negócio: ./parser.js
// Mapeamento de colunas e taxonomia: ./columns.js

import { TAXONOMY } from './columns.js';
import { parse, detect } from './parser.js';
import { supabase } from '../../supabase.js';
import { buildClearMap, isAfterClear } from '../shared/history.js';

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
    async pull({ history = [] } = {}) {
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

      const rawDrivers = data.drivers || [];
      const rawStats   = data.stats   || {};

      // Filtra eventos já atendidos com base no histórico de 90 dias.
      // Compara o último evento de cada bucket com o último atendimento registrado
      // para a mesma placa — se todos os eventos são anteriores ao atendimento,
      // o bucket é zerado (mesmo comportamento do parser de planilha).
      const clearMap = buildClearMap(history);
      let filtradosPorHistorico = 0;

      const drivers = rawDrivers.map(d => {
        const clear = clearMap[d.placa] || {};
        const uE  = d.ultimoEvento         ? new Date(d.ultimoEvento)         : null;
        const uER = d.ultimoEventoReportar  ? new Date(d.ultimoEventoReportar) : null;

        let { alertas, tipos, ultimoEvento, reportaveis, tiposReportar, ultimoEventoReportar } = d;
        let eventosDetalhados = (d.eventosDetalhados || []).map(e => ({
          ...e, ts: e.ts ? new Date(e.ts) : null,
        }));

        if (!isAfterClear(uE, clear.lastIntervencao)) {
          filtradosPorHistorico += alertas;
          alertas = 0; tipos = []; ultimoEvento = null;
          eventosDetalhados = eventosDetalhados.filter(e => e.bucket !== 'intervencao');
        }
        if (!isAfterClear(uER, clear.lastReportar)) {
          filtradosPorHistorico += reportaveis;
          reportaveis = 0; tiposReportar = []; ultimoEventoReportar = null;
          eventosDetalhados = eventosDetalhados.filter(e => e.bucket !== 'reportar');
        }

        return { ...d, alertas, tipos, ultimoEvento, reportaveis, tiposReportar, ultimoEventoReportar, eventosDetalhados };
      }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

      const stats = {
        ...rawStats,
        total:           drivers.length,
        comIntervencao:  drivers.filter(d => d.alertas > 0).length,
        soReportar:      drivers.filter(d => d.alertas === 0 && d.reportaveis > 0).length,
        soTecnico:       drivers.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0).length,
        filtradosPorHistorico,
      };

      return { drivers, stats };
    },
  },
};

export default sascar;
