import { useMemo } from 'react';
import { useAtendimentos } from './useAtendimentos';

// Feed de atividade ao vivo do Dashboard: NÃO abre canal Realtime próprio nem
// tabela nova — reaproveita `useAtendimentos().history`, que já é mantido
// atualizado em tempo real (INSERT/DELETE) por outras telas. Aqui só
// derivamos uma lista curta e cronológica pra exibição.
const TIPO_VERBO = {
  intervencao: 'tratou um alerta de',
  reportar: 'reportou',
  descarte: 'descartou um alerta de',
  limpeza: 'limpou o registro de',
};

const TIPO_ICON = {
  intervencao: 'ti-shield-check',
  reportar: 'ti-flag',
  descarte: 'ti-trash-x',
  limpeza: 'ti-eraser',
};

function relativeTime(iso) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return `há ${Math.round(diffH / 24)}d`;
}

export function useActivityFeed({ platRaw, limit = 15 } = {}) {
  const { history } = useAtendimentos();

  const items = useMemo(() => {
    return history.slice(0, limit).map((a) => ({
      id: a.id,
      icon: TIPO_ICON[a.tipo] || 'ti-point',
      text: `${a.operador || 'Alguém'} ${TIPO_VERBO[a.tipo] || 'atualizou'} ${a.motorista || 'um motorista'}`,
      when: relativeTime(a.created_at),
    }));
  }, [history, limit]);

  const lastImport = useMemo(() => {
    if (!platRaw || platRaw.date !== new Date().toDateString()) return null;
    return { platform: platRaw.platform, total: platRaw.total };
  }, [platRaw]);

  return { items, lastImport };
}
