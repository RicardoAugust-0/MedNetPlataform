import { createContext, useContext, useState, useCallback } from 'react';

function load(k, fb) {
  try { const v = localStorage.getItem('mn_' + k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function save(k, v) {
  try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch {}
}

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [activePanel, setActivePanelState] = useState(() => load('activePanel', 'dashboard'));
  const [drivers, setDriversState] = useState(() => { try { const v = localStorage.getItem('mn_drivers_queue'); return v ? JSON.parse(v) : []; } catch { return []; } });
  const setDrivers = useCallback((val) => { setDriversState(val); try { localStorage.setItem('mn_drivers_queue', JSON.stringify(val)); } catch {} }, []);
  const [filters,     setFilters]          = useState({ empresa:'', comportamento:'', turno:'', prioridade:'' });
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
  const setTheme       = persist(setThemeState,       'theme');
  const setDensity     = persist(setDensityState,     'density');
  const setAccent      = persist(setAccentState,      'accent');
  const setMode        = persist(setModeState,        'mode');
  const setVibe        = persist(setVibeState,        'vibe');
  const setRhythm      = persist(setRhythmState,      'rhythm');

  return (
    <Ctx.Provider value={{
      activePanel, setActivePanel,
      drivers, setDrivers,
      filters, setFilters,
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
