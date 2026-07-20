import { useEffect, useRef } from 'react';
import { useApp } from '../context.jsx';
import { useNotifications } from './useNotifications.jsx';

// Resumo diário determinístico — SEM IA, sem n8n, sem cron novo. Mesmo
// precedente arquitetural do ReminderNotifier (src/App.jsx): roda uma vez por
// sessão/dia, guardado por uma flag em localStorage, montado globalmente.
// Os números vêm de `drivers` (já carregado e mantido em tempo real por
// useOpenAlerts via useApp() — não abre uma segunda fonte/fetch).
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useDailyBriefing() {
  const { drivers, driversLoading, driversLoadedAt } = useApp();
  const { notify } = useNotifications();
  const firedRef = useRef(false);

  useEffect(() => {
    if (driversLoading || !driversLoadedAt || firedRef.current) return;

    const storageKey = `mn_briefing_seen_${todayKey()}`;
    if (localStorage.getItem(storageKey)) {
      firedRef.current = true;
      return;
    }

    const total = drivers.length;
    const comIntervencao = drivers.filter((d) => d.alertas > 0).length;
    const soReportar = drivers.filter((d) => d.alertas === 0 && d.reportaveis > 0).length;
    const criticos = drivers.filter((d) => d.severidade === 'Gravíssimo').length;

    const body = total === 0
      ? 'Nenhum alerta em aberto no momento — dia tranquilo por enquanto.'
      : [
          `${total} motorista(s) em aberto`,
          comIntervencao > 0 && `${comIntervencao} com intervenção pendente`,
          criticos > 0 && `${criticos} em nível Gravíssimo`,
          soReportar > 0 && `${soReportar} só para reportar`,
        ].filter(Boolean).join(' · ');

    notify({
      title: 'Resumo do dia',
      body,
      kind: criticos > 0 ? 'warning' : 'info',
      link: '/monitor/intervencao',
    });

    localStorage.setItem(storageKey, '1');
    firedRef.current = true;
  }, [drivers, driversLoading, driversLoadedAt, notify]);
}
