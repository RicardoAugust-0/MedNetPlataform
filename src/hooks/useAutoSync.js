import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context';

/**
 * Hook genérico de sincronização automática para qualquer plataforma com scraper.
 * @param {object} platform  - Adapter da plataforma (deve ter scraper.pull() e id)
 * @param {boolean} isEnabled - true quando o usuário tem credenciais configuradas
 * @param {string} storageKey - Prefixo único para localStorage (ex: 'maxtrack', 'sascar')
 */
export function useAutoSync({ platform, isEnabled, storageKey }) {
  const { replaceDrivers } = useApp();

  const [autoSync,        setAutoSyncState]     = useState(() => localStorage.getItem(`mn_sync_${storageKey}`) === 'true');
  const [syncIntervalMin, setSyncIntervalState] = useState(() => parseInt(localStorage.getItem(`mn_sync_min_${storageKey}`) || '5'));
  const [syncing,         setSyncing]           = useState(false);
  const [lastSyncAt,      setLastSyncAt]        = useState(null);
  const [syncError,       setSyncError]         = useState(null);
  const syncingRef = useRef(false);

  const setAutoSync = (v) => {
    const val = typeof v === 'function' ? v(autoSync) : v;
    setAutoSyncState(val);
    localStorage.setItem(`mn_sync_${storageKey}`, String(val));
  };

  const setSyncIntervalMin = (v) => {
    const val = typeof v === 'function' ? v(syncIntervalMin) : v;
    setSyncIntervalState(Math.max(2, Math.min(60, val)));
    localStorage.setItem(`mn_sync_min_${storageKey}`, String(val));
  };

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      const { drivers } = await platform.scraper.pull();
      replaceDrivers(drivers, platform.id);
      setLastSyncAt(new Date());
    } catch (err) {
      setSyncError(err.message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [replaceDrivers, platform]);

  // Mantém ref atualizada para o interval não capturar closure stale
  const doSyncRef = useRef(doSync);
  useEffect(() => { doSyncRef.current = doSync; }, [doSync]);

  useEffect(() => {
    if (!autoSync || !isEnabled) return;
    const id = setInterval(() => doSyncRef.current(), syncIntervalMin * 60 * 1000);
    return () => clearInterval(id);
  }, [autoSync, isEnabled, syncIntervalMin]);

  return {
    autoSync, setAutoSync,
    syncIntervalMin, setSyncIntervalMin,
    syncing,
    lastSyncAt,
    syncError,
    doSync,
  };
}
