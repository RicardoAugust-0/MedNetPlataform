// Mantido por compatibilidade. A implementação real foi migrada para
// src/platforms/sascar/parser.js. Novo código deve importar diretamente do
// registry de plataformas (src/platforms/index.js) ou do adapter desejado.
//
// @deprecated  use `getPlatform('sascar').spreadsheet.parse(file, { history })`
//              ou o registry (src/platforms) para suporte multi-plataforma.

import { getPlatform } from './platforms/index.js';

export async function parseSheetFile(file, history = []) {
  return getPlatform('sascar').spreadsheet.parse(file, { history });
}
