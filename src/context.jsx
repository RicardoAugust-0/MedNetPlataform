import { createContext, useContext, useState, useCallback } from 'react';
import {
  TEMPLATES_DEFAULT, LINKS_DEFAULT, WS_PAGES_DEFAULT,
  NOTES_DEFAULT, REMINDERS_DEFAULT,
} from './data';

function load(k, fb) {
  try { const v = localStorage.getItem('mn_' + k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}
function save(k, v) {
  try { localStorage.setItem('mn_' + k, JSON.stringify(v)); } catch {}
}

const Ctx = createContext(null);

export function AppProvider({ children }) {
  const [activePanel, setActivePanelState] = useState(() => load('activePanel', 'dashboard'));
  const [templates,   setTemplatesState]   = useState(() => load('templates',   TEMPLATES_DEFAULT));
  const [links,       setLinksState]       = useState(() => load('links',       LINKS_DEFAULT));
  const [wsPages,     setWsPagesState]     = useState(() => load('wsPages',     WS_PAGES_DEFAULT));
  const [wsNextId,    setWsNextId]         = useState(() => load('wsNextId',    11));
  const [notes,       setNotesState]       = useState(() => load('notes',       NOTES_DEFAULT));
  const [reminders,   setRemindersState]   = useState(() => load('reminders',   REMINDERS_DEFAULT));
  const [tplNextId,   setTplNextId]        = useState(() => load('tplNextId',   9));
  const [lnkNextId,   setLnkNextId]        = useState(() => load('lnkNextId',   9));
  const [noteNextId,  setNoteNextId]       = useState(() => load('noteNextId',  4));
  const [remNextId,   setRemNextId]        = useState(() => load('remNextId',   6));
  const [drivers,     setDrivers]          = useState([]);
  const [filters,     setFilters]          = useState({ empresa:'', comportamento:'', turno:'', prioridade:'' });
  const [excluirTecnicos, setExcluirTecnicos] = useState(() => load('excluirTecnicos', false));
  const [theme,       setThemeState]       = useState(() => load('theme',       'light'));
  const [density,     setDensityState]     = useState(() => load('density',     'normal'));
  const [accent,      setAccentState]      = useState(() => load('accent',      'roxo'));
  const [mode,        setModeState]        = useState(() => load('mode',        'pleno'));
  const [vibe,        setVibeState]        = useState(() => load('vibe',        'sobrio'));
  const [rhythm,      setRhythmState]      = useState(() => load('rhythm',      'operacional'));

  const persist = useCallback((setter, key) => (val) => {
    setter(val);
    save(key, val);
  }, []);

  const setActivePanel = persist(setActivePanelState, 'activePanel');
  const setTemplates   = persist(setTemplatesState,   'templates');
  const setLinks       = persist(setLinksState,       'links');
  const setWsPages     = persist(setWsPagesState,     'wsPages');
  const setNotes       = persist(setNotesState,       'notes');
  const setReminders   = persist(setRemindersState,   'reminders');
  const setTheme       = persist(setThemeState,       'theme');
  const setDensity     = persist(setDensityState,     'density');
  const setAccent      = persist(setAccentState,      'accent');
  const setMode        = persist(setModeState,        'mode');
  const setVibe        = persist(setVibeState,        'vibe');
  const setRhythm      = persist(setRhythmState,      'rhythm');

  const persistExcluirTecnicos = (v) => { setExcluirTecnicos(v); save('excluirTecnicos', v); };

  return (
    <Ctx.Provider value={{
      activePanel, setActivePanel,
      templates, setTemplates, tplNextId, setTplNextId,
      links, setLinks, lnkNextId, setLnkNextId,
      wsPages, setWsPages, wsNextId, setWsNextId,
      notes, setNotes, noteNextId, setNoteNextId,
      reminders, setReminders, remNextId, setRemNextId,
      drivers, setDrivers,
      filters, setFilters,
      excluirTecnicos, setExcluirTecnicos: persistExcluirTecnicos,
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
