import { useState, useEffect } from 'react';

// Preferências de UI do Dashboard persistidas em localStorage.
// Centraliza ~20 useStates + useEffects que estavam inflando o componente principal.

function readBool(key, defaultTrue = true) {
  const v = localStorage.getItem(key);
  return defaultTrue ? v !== 'false' : v === 'true';
}

export function useDashboardSettings() {
  const [slaLimit,        setSlaLimit]        = useState(() => Number(localStorage.getItem('mn_dash_sla') || 30));
  const [compareYesterday, setCompareYesterday] = useState(() => readBool('mn_dash_compare', true));
  const [showHourly,      setShowHourly]      = useState(() => readBool('mn_dash_hourly',  true));
  const [showTransp,      setShowTransp]      = useState(() => readBool('mn_dash_transp',  true));
  const [showClassif,     setShowClassif]     = useState(() => readBool('mn_dash_classif', true));
  const [showTech,        setShowTech]        = useState(() => readBool('mn_dash_tech',    true));
  const [tvMode,          setTvMode]          = useState(() => readBool('mn_dash_tv',      false));
  const [executiveMode,   setExecutiveMode]   = useState(() => readBool('mn_dash_exec',    false));
  const [layout,          setLayout]          = useState(() => localStorage.getItem('mn_dash_layout') || 'balanced');
  const [showSheet,       setShowSheet]       = useState(() => readBool('mn_dash_sheet',   true));
  const [sheetAutoSync,   setSheetAutoSync]   = useState(() => readBool('mn_dash_sheet_autosync', false));
  const [sheetSyncMin,    setSheetSyncMin]    = useState(() => parseInt(localStorage.getItem('mn_dash_sheet_sync_min') || '10', 10));
  const [mode,            setMode]            = useState(() => localStorage.getItem('mn_dash_mode') || 'pleno');
  const [vibe,            setVibe]            = useState(() => localStorage.getItem('mn_dash_vibe') || 'sobrio');

  useEffect(() => { localStorage.setItem('mn_dash_sla',     String(slaLimit));            }, [slaLimit]);
  useEffect(() => { localStorage.setItem('mn_dash_compare', String(compareYesterday));    }, [compareYesterday]);
  useEffect(() => { localStorage.setItem('mn_dash_hourly',  String(showHourly));          }, [showHourly]);
  useEffect(() => { localStorage.setItem('mn_dash_transp',  String(showTransp));          }, [showTransp]);
  useEffect(() => { localStorage.setItem('mn_dash_classif', String(showClassif));         }, [showClassif]);
  useEffect(() => { localStorage.setItem('mn_dash_tech',    String(showTech));            }, [showTech]);
  useEffect(() => { localStorage.setItem('mn_dash_exec',    String(executiveMode));       }, [executiveMode]);
  useEffect(() => { localStorage.setItem('mn_dash_layout',  layout);                       }, [layout]);
  useEffect(() => { localStorage.setItem('mn_dash_sheet',   String(showSheet));           }, [showSheet]);
  useEffect(() => { localStorage.setItem('mn_dash_sheet_autosync', String(sheetAutoSync)); }, [sheetAutoSync]);
  useEffect(() => { localStorage.setItem('mn_dash_sheet_sync_min', String(sheetSyncMin));  }, [sheetSyncMin]);
  useEffect(() => { localStorage.setItem('mn_dash_mode', mode); }, [mode]);
  useEffect(() => { localStorage.setItem('mn_dash_vibe', vibe); }, [vibe]);

  // Executive mode: aplica classe no <body> pra CSS controlar tamanhos
  useEffect(() => {
    document.body.classList.toggle('dash-exec-mode', executiveMode);
    return () => document.body.classList.remove('dash-exec-mode');
  }, [executiveMode]);

  // TV mode: toggle sidebar via body class
  useEffect(() => {
    document.body.classList.toggle('dash-tv-mode', tvMode);
    localStorage.setItem('mn_dash_tv', String(tvMode));
    return () => document.body.classList.remove('dash-tv-mode');
  }, [tvMode]);

  return {
    slaLimit, setSlaLimit,
    compareYesterday, setCompareYesterday,
    showHourly,  setShowHourly,
    showTransp,  setShowTransp,
    showClassif, setShowClassif,
    showTech,    setShowTech,
    tvMode,      setTvMode,
    executiveMode, setExecutiveMode,
    layout,      setLayout,
    showSheet,   setShowSheet,
    sheetAutoSync, setSheetAutoSync,
    sheetSyncMin,  setSheetSyncMin,
    mode,          setMode,
    vibe,          setVibe,
  };
}
