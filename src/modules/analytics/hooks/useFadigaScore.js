import { useMemo } from 'react';

// SLAs já usados no drill-down de tempo de resposta (ver FadigaKPIsDrill.jsx).
const SLA_TRATATIVA_MIN = 5;
const SLA_FINALIZACAO_MIN = 15;

// Pesos da composição (somam 1): severidade pesa mais porque é o que mais
// importa pro objetivo do painel (fadiga real, não ruído de planilha).
const W_SEVERIDADE = 0.4;
const W_FALSO = 0.25;
const W_TEMPO = 0.35;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Score único 0-100: "quão bem controlada está a fadiga" no período — combina
// severidade dos alertas, taxa de falso positivo e tempo de resposta vs SLA.
// 100% cliente, sem RPC nova: os 3 ingredientes já vêm no `d` que o Analytics
// já busca (mensal_crit.series, kpis.pct_falso, kpis.t_ini_mediana/t_fin_mediana).
export function computeFadigaScore(d) {
  if (!d || !d.kpis || !d.mensal_crit || !d.kpis.total) return null;

  const series = d.mensal_crit.series || {};
  const sum = (arr) => (arr || []).reduce((a, b) => a + b, 0);
  const gravissimo = sum(series['Gravíssimo']);
  const grave = sum(series['Grave']);
  const medio = sum(series['Médio']);
  const totalSev = gravissimo + grave + medio;
  if (!totalSev) return null;

  const sevPenalty = ((gravissimo + grave) / totalSev) * 100;
  const falsoPenalty = d.kpis.pct_falso ?? 0;

  const { t_ini_mediana: tIni, t_fin_mediana: tFin } = d.kpis;
  const excessos = [];
  if (tIni != null) excessos.push(clamp01((tIni - SLA_TRATATIVA_MIN) / SLA_TRATATIVA_MIN));
  if (tFin != null) excessos.push(clamp01((tFin - SLA_FINALIZACAO_MIN) / SLA_FINALIZACAO_MIN));
  const tempoPenalty = excessos.length
    ? (excessos.reduce((a, b) => a + b, 0) / excessos.length) * 100
    : 0;

  const raw = 100 - (W_SEVERIDADE * sevPenalty + W_FALSO * falsoPenalty + W_TEMPO * tempoPenalty);
  const score = Math.round(Math.max(0, Math.min(100, raw)));

  return { score, sevPenalty: Math.round(sevPenalty), falsoPenalty: Math.round(falsoPenalty), tempoPenalty: Math.round(tempoPenalty) };
}

export function useFadigaScore(d) {
  return useMemo(() => computeFadigaScore(d), [d]);
}
