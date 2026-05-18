import { createContext, useContext, useState, useCallback } from 'react';
import { useDriversQueue } from './hooks/useDriversQueue';

function load(k, fb) {
  try { const v = localStorage.getItem('mn_' + k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function save(k, v) {
  try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch {}
}

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [activePanel, setActivePanelState] = useState(() => load('activePanel', 'dashboard'));
  const { drivers, loading: driversLoading, replaceAll: replaceDrivers, updateOne: updateDriver, bulkUpdate: bulkUpdateDrivers, clearAll: clearDrivers, reload: reloadDrivers } = useDriversQueue();
  const [filters,     setFilters]          = useState({ empresa:'', comportamento:'', turno:'', prioridade:'', busca:'' });
  const [platformId,  setPlatformIdState]  = useState(() => load('platformId', 'sascar'));
  const [theme,       setThemeState]       = useState(() => load('theme',    'dark'));
  const [density,     setDensityState]     = useState(() => load('density',  'normal'));
  const [accent,      setAccentState]      = useState(() => load('accent',   'vinho'));
  const [mode,        setModeState]        = useState(() => load('mode',     'pleno'));
  const [vibe,        setVibeState]        = useState(() => load('vibe',     'sobrio'));
  const [rhythm,      setRhythmState]      = useState(() => load('rhythm',   'operacional'));

  const persist = useCallback((setter, key) => (val) => {
    setter(val);
    save(key, val);
  }, []);

  const setActivePanel = persist(setActivePanelState, 'activePanel');
  const setPlatformId  = persist(setPlatformIdState,  'platformId');
  const setTheme       = persist(setThemeState,       'theme');
  const setDensity     = persist(setDensityState,     'density');
  const setAccent      = persist(setAccentState,      'accent');
  const setMode        = persist(setModeState,        'mode');
  const setVibe        = persist(setVibeState,        'vibe');
  const setRhythm      = persist(setRhythmState,      'rhythm');

  return (
    <Ctx.Provider value={{
      activePanel, setActivePanel,
      drivers, driversLoading,
      replaceDrivers, updateDriver, bulkUpdateDrivers, clearDrivers, reloadDrivers,
      filters, setFilters,
      platformId, setPlatformId,
      theme, setTheme,
      density, setDensity,
      accent, setAccent,
      mode, setMode,
      vibe, setVibe,
      rhythm, setRhythm,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useApp = () => useContext(Ctx);
