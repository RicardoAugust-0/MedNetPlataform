import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import maxtrack from '../platforms/maxtrack/index.js';

export function useMaxtrackAutoSync() {
  const { platformId, replaceDrivers } = useApp();
  const { profile: me } = useAuth();

  const isEnabled = platformId === 'maxtrack' && !!me?.maxtrack_email;

  const [autoSync,        setAutoSyncState]       = useState(() => localStorage.getItem('mn_dash_autosync') === 'true');
  const [syncIntervalMin, setSyncIntervalState]   = useState(() => parseInt(localStorage.getItem('mn_dash_sync_min') || '5'));
  const [syncing,         setSyncing]             = useState(false);
  const [lastSyncAt,      setLastSyncAt]          = useState(null);
  const [syncError,       setSyncError]           = useState(null);
  const syncingRef = useRef(false);

  const setAutoSync = (v) => {
    const val = typeof v === 'function' ? v(autoSync) : v;
    setAutoSyncState(val);
    localStorage.setItem('mn_dash_autosync', String(val));
  };

  const setSyncIntervalMin = (v) => {
    const val = typeof v === 'function' ? v(syncIntervalMin) : v;
    setSyncIntervalState(Math.max(2, Math.min(60, val)));
    localStorage.setItem('mn_dash_sync_min', String(val));
  };

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncError(null);
    try {
      const { drivers } = await maxtrack.scraper.pull();
      replaceDrivers(drivers, 'maxtrack');
      setLastSyncAt(new Date());
    } catch (err) {
      setSyncError(err.message);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [replaceDrivers]);

  // Mantém ref atualizada para o interval não capturar closure stale
  const doSyncRef = useRef(doSync);
  useEffect(() => { doSyncRef.current = doSync; }, [doSync]);

  useEffect(() => {
    if (!autoSync || !isEnabled) return;
    const id = setInterval(() => doSyncRef.current(), syncIntervalMin * 60 * 1000);
    return () => clearInterval(id);
  }, [autoSync, isEnabled, syncIntervalMin]);

  return {
    isEnabled,
    autoSync, setAutoSync,
    syncIntervalMin, setSyncIntervalMin,
    syncing,
    lastSyncAt,
    syncError,
    doSync,
  };
}
