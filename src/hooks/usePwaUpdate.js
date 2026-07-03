import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './useToast';

// Liga o registro do service worker a um toast visível — antes disso,
// atualizações e o modo offline aconteciam em silêncio (import sem opções
// de 'virtual:pwa-register' em main.jsx).
export function usePwaUpdate() {
  const toast = useToast();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!offlineReady) return;
    toast('App pronto para uso offline.', 'success');
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady, toast]);

  useEffect(() => {
    if (!needRefresh) return;
    toast('Nova versão disponível.', 'info', {
      label: 'Atualizar',
      fn: () => updateServiceWorker(true),
    });
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, updateServiceWorker, toast]);
}
