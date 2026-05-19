import { useState, useEffect, useCallback, useMemo } from 'react';

const FILTERS_DEFAULT = { tipo: [], resultado: [], empresa: 'todas', operador: 'todos', periodo: 'hoje' };

export function useDashboardFilters(resolveAlias) {
  const [filters, setFilters] = useState(() => {
    try {
      const raw = localStorage.getItem('mn_dash_filters');
      if (!raw) return FILTERS_DEFAULT;
      const parsed = JSON.parse(raw);
      return { ...FILTERS_DEFAULT, ...parsed };
    } catch { return FILTERS_DEFAULT; }
  });

  useEffect(() => {
    try { localStorage.setItem('mn_dash_filters', JSON.stringify(filters)); } catch { /* quota */ }
  }, [filters]);

  // Helpers semânticos: filtro vazio == "mostra tudo"
  const showTipo      = useCallback((id) => filters.tipo.length === 0 || filters.tipo.includes(id), [filters.tipo]);
  const showResultado = useCallback((id) => filters.resultado.length === 0 || filters.resultado.includes(id), [filters.resultado]);
  const empresaFilterFn = useCallback(
    (transp) => filters.empresa === 'todas' || resolveAlias(transp || '') === filters.empresa,
    [filters.empresa, resolveAlias]
  );

  const helpers = useMemo(() => ({ showTipo, showResultado, empresaFilterFn }), [showTipo, showResultado, empresaFilterFn]);

  return { filters, setFilters, ...helpers };
}
