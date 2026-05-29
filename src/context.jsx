import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useDriversQueue } from './hooks/useDriversQueue';
import { useSheetHistory } from './hooks/useSheetHistory';

function load(k, fb) {
  try { const v = localStorage.getItem('mn_' + k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function save(k, v) {
  try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch { /* storage não crítico */ }
}

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const { drivers, loading: driversLoading, lastChangeAt: driversLastChangeAt, replaceAll: replaceDrivers, updateOne: updateDriver, bulkUpdate: bulkUpdateDrivers, clearAll: clearDrivers, reload: reloadDrivers } = useDriversQueue();
  const sheetHistory = useSheetHistory();
  const [filters,     setFilters]          = useState({ empresa:'', comportamento:'', turno:'', prioridade:'', busca:'' });
  const [platformId,  setPlatformIdState]  = useState(() => load('platformId', 'sascar'));
  const [theme,       setThemeState]       = useState(() => load('theme',    'dark'));
  const [density,     setDensityState]     = useState(() => load('density',  'normal'));
  const [accent,      setAccentState]      = useState(() => load('accent',   'vinho'));
  const [mode,        setModeState]        = useState(() => load('mode',     'pleno'));
  const [vibe,        setVibeState]        = useState(() => load('vibe',     'sobrio'));
  const [rhythm,      setRhythmState]      = useState(() => load('rhythm',   'operacional'));

  // Setters memoizados — referência estável evita re-render dos consumers.
  const setPlatformId  = useCallback((v) => { setPlatformIdState(v);  save('platformId',  v); }, []);
  const setTheme       = useCallback((v) => { setThemeState(v);       save('theme',       v); }, []);
  const setDensity     = useCallback((v) => { setDensityState(v);     save('density',     v); }, []);
  const setAccent      = useCallback((v) => { setAccentState(v);      save('accent',      v); }, []);
  const setMode        = useCallback((v) => { setModeState(v);        save('mode',        v); }, []);
  const setVibe        = useCallback((v) => { setVibeState(v);        save('vibe',        v); }, []);
  const setRhythm      = useCallback((v) => { setRhythmState(v);      save('rhythm',      v); }, []);

  // Sem useMemo no value, todo consumer de useApp() re-renderiza a cada render do Provider.
  const value = useMemo(() => ({
    drivers, driversLoading, driversLastChangeAt,
    replaceDrivers, updateDriver, bulkUpdateDrivers, clearDrivers, reloadDrivers,
    filters, setFilters,
    platformId, setPlatformId,
    theme, setTheme,
    density, setDensity,
    accent, setAccent,
    mode, setMode,
    vibe, setVibe,
    rhythm, setRhythm,
    sheetHistory,
  }), [
    drivers, driversLoading, driversLastChangeAt,
    replaceDrivers, updateDriver, bulkUpdateDrivers, clearDrivers, reloadDrivers,
    filters, setFilters,
    platformId, setPlatformId,
    theme, setTheme,
    density, setDensity,
    accent, setAccent,
    mode, setMode,
    vibe, setVibe,
    rhythm, setRhythm,
    sheetHistory,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => useContext(Ctx);
