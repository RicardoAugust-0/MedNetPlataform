// Utilitários de normalização de texto compartilhados entre todas as plataformas.
// Mantenha este arquivo livre de regras específicas de plataforma — apenas helpers
// puros e estáveis.

// Normaliza strings para comparações case/diacritic-insensitive.
// Ex.: "Distração Genérica" -> "distracao generica".
export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Retorna true se a string normalizada contém todos os tokens informados.
// Útil para detectar variações de redação (ex.: "Distração Genérica" vs "Distracao generica").
export function containsAll(haystackNorm, tokens) {
  return tokens.every((t) => haystackNorm.includes(t));
}
