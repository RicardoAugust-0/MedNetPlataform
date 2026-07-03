import { useState, useEffect, useRef } from 'react';
import { useToast } from './useToast';

// Estado real de conectividade — toast só depois do primeiro evento
// (evita notificar "conexão restabelecida" no carregamento inicial).
export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  const toast = useToast();
  const fired = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      if (fired.current) toast('Conexão restabelecida.', 'success');
    };
    const handleOffline = () => {
      setOnline(false);
      if (fired.current) toast('Sem conexão com a internet. Algumas ações podem falhar.', 'error');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    fired.current = true;
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  return online;
}
