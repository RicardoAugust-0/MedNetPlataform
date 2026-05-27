// Adapter da plataforma Sascar (Michelin Smart Camera).
//
// Modo de ingestão: 'spreadsheet' (operador faz upload do relatório xlsx/csv).
// Documentação completa do contrato: ../base.js
// Lógica do parser e regras de negócio: ./parser.js
// Mapeamento de colunas e taxonomia: ./columns.js

import { TAXONOMY, DINON_CARRIERS_NORM } from './columns.js';
import { parse, detect } from './parser.js';
import { supabase, getFunctionErrorMessage } from '../../supabase.js';
import { normalize } from '../shared/normalize.js';

const isFumo = tipo => /\bfum(o|ando|ante|ar)\b/i.test(tipo);

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

      const { data, error: fnErr } = await supabase.functions.invoke('pull-sascar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (fnErr) {
        const errMsg = await getFunctionErrorMessage(fnErr);
        throw new Error(errMsg);
      }
      if (!data || data.error) {
        const err = new Error(data?.error || 'Erro Sascar');
        if (data?.code) err.code = data.code;
        throw err;
      }

      return { drivers: data.drivers || [], stats: data.stats || {} };
    },
  },

  // ── Regra Dinon: auto-descarte de eventos de fumo para transportadoras Dinon.
  // Chamado pelo Monitor após o filtro de histórico, antes de exibir a fila.
  postProcess(drivers) {
    const autoDescartes = [];
    const result = drivers.map(d => {
      const tNorm = normalize(d.transportadora || '');
      if (!DINON_CARRIERS_NORM.some(n => tNorm.includes(n))) return d;

      const fumoEvs = (d.eventosDetalhados || []).filter(e => e.bucket === 'reportar' && isFumo(e.tipo));
      if (fumoEvs.length === 0) return d;

      autoDescartes.push({
        nome: d.nome, placa: d.placa, transportadora: d.transportadora,
        count: fumoEvs.length, motivo: 'Regra Dinon · eventos de fumo',
      });
      const reportaveis      = Math.max(0, d.reportaveis - fumoEvs.length);
      const tiposReportar    = (d.tiposReportar || []).filter(t => !isFumo(t));
      const eventosDetalhados = (d.eventosDetalhados || []).filter(e => !(e.bucket === 'reportar' && isFumo(e.tipo)));
      return { ...d, reportaveis, tiposReportar, eventosDetalhados };
    }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

    return { drivers: result, autoDescartes };
  },
};

export default sascar;
