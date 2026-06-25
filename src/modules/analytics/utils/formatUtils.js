/**
 * Formata uma chave de mês no formato "YYYY-MM" para exibição amigável ("Mês de Ano").
 * @param {string} mk - Chave do mês (ex: "2026-06" ou "all").
 * @returns {string} Mês formatado por extenso.
 */
export const formatMonthKey = (mk) => {
  if (!mk || mk === 'all') return 'Todos os meses';
  const [y, m] = mk.split('-');
  const MESES_COMPLETOS = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  return `${MESES_COMPLETOS[parseInt(m) - 1]} de ${y}`;
};
