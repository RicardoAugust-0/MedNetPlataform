// Registry de plataformas de monitoramento.
//
// Para adicionar uma nova plataforma:
//   1. Crie src/platforms/<id>/ seguindo o contrato em ./base.js
//      (use src/platforms/_template/ como ponto de partida)
//   2. Importe o adapter aqui e adicione-o ao array PLATFORMS
//   3. Pronto — o Monitor exibe automaticamente a opção no seletor
//
// O guia detalhado está em docs/PLATFORMS.md.

import sascar   from './sascar/index.js';
import maxtrack from './maxtrack/index.js';

// Lista ordenada das plataformas disponíveis na UI.
// 'active'  → exibida e selecionável no Monitor
// 'beta'    → exibida com tag "beta", selecionável
// 'planned' → exibida desabilitada, apenas informativa
export const PLATFORMS = [
  sascar,
  maxtrack,
  // futuro: autotrack,
  // futuro: autotrack,
  // futuro: trimble,
  // futuro: cobli,
  // futuro: horizon,
];

// Devolve a lista filtrada por status (default: active + beta).
export function listPlatforms({ includePlanned = false } = {}) {
  return PLATFORMS.filter((p) => includePlanned || p.status !== 'planned');
}

// Busca um adapter pelo id. Lança erro se não encontrado.
export function getPlatform(id) {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`Plataforma desconhecida: "${id}"`);
  return p;
}

// Adapter padrão (primeiro 'active'). Usado quando nenhum foi escolhido ainda.
export function getDefaultPlatform() {
  return PLATFORMS.find((p) => p.status === 'active') || PLATFORMS[0];
}

// Tenta detectar a plataforma a partir de uma planilha já lida.
// `candidate` = { fileName, headers: string[] }
// Devolve o adapter com maior score (mínimo configurável). null se nada bate.
export function detectPlatform(candidate, { minScore = 0.5 } = {}) {
  let best = null;
  let bestScore = 0;
  for (const p of listPlatforms()) {
    const detect = p.spreadsheet?.detect;
    if (typeof detect !== 'function') continue;
    const score = detect(candidate) || 0;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= minScore ? best : null;
}
