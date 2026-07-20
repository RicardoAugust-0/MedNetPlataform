import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useOpenAlerts } from './hooks/useOpenAlerts';
import { useSheetHistory } from './hooks/useSheetHistory';

function load(k, fb) {
  try { const v = localStorage.getItem('mn_' + k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function save(k, v) {
  try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch { /* storage não crítico */ }
}

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const { pathname } = useLocation();
  const openAlertsEnabled = pathname === '/'
    || pathname === '/dashboard'
    || pathname.startsWith('/dashboard/')
    || pathname === '/monitor'
    || pathname.startsWith('/monitor/');
  const [platformId,  setPlatformIdState]  = useState(() => load('platformId', 'sascar'));
  const { drivers, loading: driversLoading, loadedAt: driversLoadedAt, reload: reloadDrivers, lastImportedAt } = useOpenAlerts({ enabled: openAlertsEnabled });
  const sheetHistory = useSheetHistory();
  const [filters,     setFilters]          = useState({ empresa:'', comportamento:'', turno:'', prioridade:'', busca:'' });
  const [theme,       setThemeState]       = useState(() => load('theme',    'dark'));
  const [density,     setDensityState]     = useState(() => load('density',  'normal'));
  const [accent,      setAccentState]      = useState(() => load('accent',   'vinho'));
  const [mode,        setModeState]        = useState(() => load('mode',     'pleno'));
  const [vibe,        setVibeState]        = useState(() => load('vibe',     'sobrio'));
  const [rhythm,      setRhythmState]      = useState(() => load('rhythm',   'operacional'));
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(() => load('sidebarCollapsed', false));
  // Drawer mobile (<900px) — estado transiente, não persiste entre sessões.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Setters memoizados — referência estável evita re-render dos consumers.
  const setPlatformId  = useCallback((v) => { setPlatformIdState(v);  save('platformId',  v); }, []);
  const setTheme       = useCallback((v) => { setThemeState(v);       save('theme',       v); }, []);
  const setDensity     = useCallback((v) => { setDensityState(v);     save('density',     v); }, []);
  const setAccent      = useCallback((v) => { setAccentState(v);      save('accent',      v); }, []);
  const setMode        = useCallback((v) => { setModeState(v);        save('mode',        v); }, []);
  const setVibe        = useCallback((v) => { setVibeState(v);        save('vibe',        v); }, []);
  const setRhythm      = useCallback((v) => { setRhythmState(v);      save('rhythm',      v); }, []);
  const setSidebarCollapsed = useCallback((v) => { setSidebarCollapsedState(v); save('sidebarCollapsed', v); }, []);

  // Sem useMemo no value, todo consumer de useApp() re-renderiza a cada render do Provider.
  const value = useMemo(() => ({
    drivers, driversLoading, driversLoadedAt, reloadDrivers, lastImportedAt,
    filters, setFilters,
    platformId, setPlatformId,
    theme, setTheme,
    density, setDensity,
    accent, setAccent,
    mode, setMode,
    vibe, setVibe,
    rhythm, setRhythm,
    sidebarCollapsed, setSidebarCollapsed,
    mobileNavOpen, setMobileNavOpen,
    sheetHistory,
  }), [
    drivers, driversLoading, driversLoadedAt, reloadDrivers, lastImportedAt,
    filters, setFilters,
    platformId, setPlatformId,
    theme, setTheme,
    density, setDensity,
    accent, setAccent,
    mode, setMode,
    vibe, setVibe,
    rhythm, setRhythm,
    sidebarCollapsed, setSidebarCollapsed,
    mobileNavOpen, setMobileNavOpen,
    sheetHistory,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => useContext(Ctx);
