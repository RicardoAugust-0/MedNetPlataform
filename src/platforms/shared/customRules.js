import { normalize } from './normalize.js';

/**
 * Aplica regras customizadas de descarte (tabela custom_rules) sobre a lista de
 * motoristas já agregada. Substitui qualquer lógica hardcoded de plataforma.
 *
 * Cada regra tem:
 *   platform_id    — 'sascar' | 'maxtrack' | '*' (todas)
 *   transportadora — substring a casar (case-insensitive); '' = qualquer
 *   nome_evento    — substring a casar no tipo do evento; '' = qualquer
 *   acao           — 'descarte' (remove da fila) | 'alerta' | 'report'
 *   ativa          — boolean
 */
export function applyCustomRules(drivers, rules, platformId) {
  const applicable = (rules || []).filter(
    r => r.ativa && r.acao === 'descarte' && (r.platform_id === platformId || r.platform_id === '*')
  );
  if (applicable.length === 0) return { drivers, autoDescartes: [] };

  const autoDescartes = [];

  const result = drivers.map(d => {
    const tNorm = normalize(d.transportadora || '');
    let current = d;

    for (const rule of applicable) {
      const ruleCarrier = normalize(rule.transportadora || '');
      if (ruleCarrier && !tNorm.includes(ruleCarrier)) continue;

      const ruleEvento = normalize(rule.nome_evento || '');
      const toDiscard = (current.eventosDetalhados || []).filter(e =>
        !ruleEvento || normalize(e.tipo).includes(ruleEvento)
      );
      if (toDiscard.length === 0) continue;

      autoDescartes.push({
        nome: current.nome,
        placa: current.placa,
        transportadora: current.transportadora,
        count: toDiscard.length,
        motivo: `Regra customizada · ${rule.nome_evento || 'todos os eventos'} · ${rule.transportadora || 'qualquer transportadora'}`,
      });

      const remaining = (current.eventosDetalhados || []).filter(e =>
        ruleEvento ? !normalize(e.tipo).includes(ruleEvento) : false
      );

      current = {
        ...current,
        eventosDetalhados: remaining,
        alertas:      remaining.filter(e => e.bucket === 'intervencao').length,
        reportaveis:  remaining.filter(e => e.bucket === 'reportar').length,
        tecnicos:     remaining.filter(e => e.bucket === 'tecnico').length,
        tipos:        [...new Set(remaining.filter(e => e.bucket === 'intervencao').map(e => e.tipo))],
        tiposReportar:[...new Set(remaining.filter(e => e.bucket === 'reportar').map(e => e.tipo))],
      };
    }
    return current;
  }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

  return { drivers: result, autoDescartes };
}
