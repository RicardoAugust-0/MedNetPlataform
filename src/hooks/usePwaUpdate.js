import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './useToast';
import { useNotifications } from './useNotifications.jsx';

// Liga o registro do service worker a um toast visível — antes disso,
// atualizações e o modo offline aconteciam em silêncio (import sem opções
// de 'virtual:pwa-register' em main.jsx). Atualização também vai para a
// central de notificações — se o toast passar despercebido, fica registrado.
export function usePwaUpdate() {
  const toast = useToast();
  const { notify } = useNotifications();
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
    notify({
      title: 'Nova versão disponível',
      body: 'Uma atualização da plataforma está pronta.',
      kind: 'info',
      action: { label: 'Atualizar agora', fn: () => updateServiceWorker(true) },
    });
    setNeedRefresh(false);
  }, [needRefresh, setNeedRefresh, updateServiceWorker, toast, notify]);
}
