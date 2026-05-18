import { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useCarrierAliases } from '../hooks/useCarrierAliases';
import { useProfiles } from '../hooks/useProfiles.jsx';
import { fmtDate, applyAccent } from '../utils';
import './dashboard/dashboard.css';
import {
  KPI,
  FilterBar,
  ProductivityRanking,
  CriticalSLA,
  TechAlerts,
  ClassificationBreakdown,
  TransportadoraRanking,
  HourlyActivity,
  Banner,
  Section,
} from './dashboard/components';

// ─── DEV MOCKS ────────────────────────────────────────────────────────────────
// Stripped automatically by Vite in production (import.meta.env.DEV = false).
const _now = new Date();
const _iso = (m = 0) => new Date(_now.getTime() - m * 60000).toISOString();

const _MOTS = [
  { n: 'Carlos Eduardo Santos',    p: 'ABC-1234', t: 'Transportes Brasil Ltda'  },
  { n: 'Marcos Paulo Lima',         p: 'DEF-5678', t: 'LogBrasil Ltda'           },
  { n: 'José Antônio Ferreira',     p: 'GHI-9012', t: 'Transportes Brasil Ltda'  },
  { n: 'Roberto Silva Souza',       p: 'JKL-3456', t: 'Fast Cargo Express'        },
  { n: 'Anderson Rodrigues Costa',  p: 'MNO-7890', t: 'LogBrasil Ltda'            },
  { n: 'Leandro Costa Pinto',       p: 'PQR-1234', t: 'NorteLogística SA'         },
  { n: 'Fábio Nascimento Silva',    p: 'STU-5555', t: 'Sul Express Ltda'          },
  { n: 'Ricardo Barbosa Lima',      p: 'VWX-9999', t: 'Atlântica Cargo'           },
  { n: 'Thiago Pereira Gomes',      p: 'YZA-1357', t: 'Prime Logística'           },
  { n: 'Diego Ferreira Santos',     p: 'BCD-2468', t: 'RodriBrasil'               },
];

const _TRANSP = [
  'Transportes Brasil Ltda', 'LogBrasil Ltda', 'Fast Cargo Express',
  'NorteLogística SA', 'Sul Express Ltda', 'Atlântica Cargo', 'Prime Logística', 'RodriBrasil',
];

const _TIPOS_A = ['Bocejo', 'Olho fechado', 'Sonolência', 'Distração Genérica'];

const _OP_DIST = [
  { nome: 'Ana Oliveira', i: 8,  d: 85, r: 24 },
  { nome: 'João Mendes',  i: 6,  d: 72, r: 20 },
  { nome: 'Maria Santos', i: 5,  d: 61, r: 16 },
  { nome: 'Pedro Alves',  i: 4,  d: 50, r: 13 },
  { nome: 'Carla Reis',   i: 3,  d: 38, r: 10 },
  { nome: 'Lucas Moura',  i: 2,  d: 28, r:  8 },
];

function _buildHistory() {
  const out = [];
  let seq = 0;
  _OP_DIST.forEach(({ nome, i: iv, d: dc, r: rp }) => {
    [['intervencao', iv], ['descarte', dc], ['reportar', rp]].forEach(([tipo, count]) => {
      for (let k = 0; k < count; k++) {
        const m      = _MOTS[seq % _MOTS.length];
        const minAgo = (seq * 1.1) % 479;
        const hh     = String(8 + (minAgo / 60 | 0)).padStart(2, '0');
        const mm     = String((seq * 7) % 60).padStart(2, '0');
        out.push({
          id: `h${++seq}`, motorista: m.n, placa: m.p, transportadora: m.t,
          operador: nome, tipo, obs: '', hora: `${hh}:${mm}`, created_at: _iso(minAgo),
        });
      }
    });
  });
  return out;
}

function _buildDrivers() {
  const named = [
    { nome: 'Carlos Eduardo Santos',    placa: 'ABC-1234', t: 'Transportes Brasil Ltda', a: 9, tipos: ['Bocejo', 'Olho fechado'],  sev: 'Gravíssimo', minAgo: 48 },
    { nome: 'Marcos Paulo Lima',         placa: 'DEF-5678', t: 'LogBrasil Ltda',          a: 8, tipos: ['Sonolência'],              sev: 'Gravíssimo', minAgo: 35 },
    { nome: 'José Antônio Ferreira',     placa: 'GHI-9012', t: 'Transportes Brasil Ltda', a: 7, tipos: ['Bocejo'],                  sev: 'Gravíssimo', minAgo: 22 },
    { nome: 'Fábio Nascimento Silva',    placa: 'STU-5555', t: 'Sul Express Ltda',         a: 7, tipos: ['Olho fechado'],            sev: 'Gravíssimo', minAgo: 18 },
    { nome: 'Ricardo Barbosa Lima',      placa: 'VWX-9999', t: 'Atlântica Cargo',          a: 6, tipos: ['Sonolência'],              sev: 'Grave',      minAgo: 14 },
    { nome: 'Roberto Silva Souza',       placa: 'JKL-3456', t: 'Fast Cargo Express',       a: 6, tipos: ['Distração Genérica'],     sev: 'Grave',      minAgo: 11 },
    { nome: 'Anderson Rodrigues Costa',  placa: 'MNO-7890', t: 'LogBrasil Ltda',           a: 5, tipos: ['Bocejo'],                  sev: 'Grave',      minAgo: 8  },
    { nome: 'Thiago Pereira Gomes',      placa: 'YZA-1357', t: 'Prime Logística',          a: 5, tipos: ['Sonolência'],              sev: 'Grave',      minAgo: 5  },
  ];
  const rest = Array.from({ length: 60 }, (_, i) => ({
    nome:  `Motorista ${i + 9}`,
    placa: `Z${String.fromCharCode(65 + i % 26)}X-${String((i * 137 + 1000) % 9000 + 1000).slice(-4)}`,
    t:     _TRANSP[i % _TRANSP.length],
    a:     Math.max(1, 4 - (i / 15 | 0)),
    tipos: [_TIPOS_A[i % 4]],
    sev:   'Normal',
    minAgo: (i * 3) % 60,
  }));

  return [...named, ...rest].map((d, idx) => ({
    nome:           d.nome,
    placa:          d.placa,
    transportadora: d.t,
    frota:          `F${String(idx + 1).padStart(3, '0')}`,
    turno:          idx % 3 === 0 ? 'noturno' : 'diurno',
    alertas:        d.a,
    tipos:          d.tipos,
    ultimoEvento:   _iso(d.minAgo || 0),
    reportaveis:    Math.max(0, d.a - 2),
    tiposReportar:  d.a > 2 ? ['Distração'] : [],
    ultimoEventoReportar: d.a > 2 ? _iso(d.minAgo || 0) : null,
    tecnicos:       0,
    tiposTecnico:   {},
    eventosDetalhados: d.tipos ? d.tipos.map((t, ei) => ({
      hora:       `${String(9 + ei).padStart(2,'0')}:${String(ei * 12).padStart(2,'0')}`,
      tipo:       t,
      severidade: d.sev || 'Normal',
    })) : [],
    severidade:     d.sev || 'Normal',
  }));
}

const MOCK_DRIVERS = import.meta.env.DEV ? _buildDrivers() : [];
const MOCK_HISTORY = import.meta.env.DEV ? _buildHistory() : [];
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { drivers: driversReal, driversLastChangeAt, setActivePanel, theme, setTheme, density, setDensity, accent, setAccent } = useApp();
  const { history: atHistoryReal } = useAtendimentos();
  const { resolveAlias } = useCarrierAliases();
  const { profiles } = useProfiles();
  const { profile: me } = useAuth();
  const isAdmin = me?.role === 'admin';

  const drivers   = import.meta.env.DEV && driversReal.length   === 0 ? MOCK_DRIVERS : driversReal;
  const atHistory = import.meta.env.DEV && atHistoryReal.length === 0 ? MOCK_HISTORY : atHistoryReal;

  // ── Persistent UI tweaks (localStorage) ────────────────────────────────────
  const [slaLimit, setSlaLimit]                 = useState(() => Number(localStorage.getItem('mn_dash_sla') || 30));
  const [compareYesterday, setCompareYesterday] = useState(() => localStorage.getItem('mn_dash_compare') !== 'false');
  const [showHourly,  setShowHourly]            = useState(() => localStorage.getItem('mn_dash_hourly')  !== 'false');
  const [showTransp,  setShowTransp]            = useState(() => localStorage.getItem('mn_dash_transp')  !== 'false');
  const [showClassif, setShowClassif]           = useState(() => localStorage.getItem('mn_dash_classif') !== 'false');
  const [showTech,    setShowTech]              = useState(() => localStorage.getItem('mn_dash_tech')    !== 'false');
  const [tvMode,      setTvMode]                = useState(() => localStorage.getItem('mn_dash_tv')      === 'true');
  const [executiveMode, setExecutiveMode]       = useState(() => localStorage.getItem('mn_dash_exec')    === 'true');
  const [layout, setLayout]                     = useState(() => localStorage.getItem('mn_dash_layout')  || 'balanced');

  useEffect(() => { localStorage.setItem('mn_dash_sla',     String(slaLimit));         }, [slaLimit]);
  useEffect(() => { localStorage.setItem('mn_dash_compare', String(compareYesterday)); }, [compareYesterday]);
  useEffect(() => { localStorage.setItem('mn_dash_hourly',  String(showHourly));       }, [showHourly]);
  useEffect(() => { localStorage.setItem('mn_dash_transp',  String(showTransp));       }, [showTransp]);
  useEffect(() => { localStorage.setItem('mn_dash_classif', String(showClassif));      }, [showClassif]);
  useEffect(() => { localStorage.setItem('mn_dash_tech',    String(showTech));         }, [showTech]);
  useEffect(() => { localStorage.setItem('mn_dash_exec',    String(executiveMode));    }, [executiveMode]);
  useEffect(() => { localStorage.setItem('mn_dash_layout',  layout);                   }, [layout]);

  // Executive mode body class (CSS controla tamanhos)
  useEffect(() => {
    document.body.classList.toggle('dash-exec-mode', executiveMode);
    return () => document.body.classList.remove('dash-exec-mode');
  }, [executiveMode]);

  // ── TV mode: toggle sidebar via body class ──────────────────────────────────
  useEffect(() => {
    document.body.classList.toggle('dash-tv-mode', tvMode);
    localStorage.setItem('mn_dash_tv', tvMode);
    return () => document.body.classList.remove('dash-tv-mode');
  }, [tvMode]);

  // ── Live SLA clock — ticks every 30 s ──────────────────────────────────────
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const todayStr = now.toDateString();

  // ── Filtros de tela (persistidos em localStorage) ──────────────────────────
  const FILTERS_DEFAULT = { tipo: [], resultado: [], empresa: 'todas', operador: 'todos', periodo: 'hoje' };
  const [filters, setFilters] = useState(() => {
    try {
      const raw = localStorage.getItem('mn_dash_filters');
      if (!raw) return FILTERS_DEFAULT;
      const parsed = JSON.parse(raw);
      return { ...FILTERS_DEFAULT, ...parsed };
    } catch { return FILTERS_DEFAULT; }
  });
  useEffect(() => {
    try { localStorage.setItem('mn_dash_filters', JSON.stringify(filters)); } catch { /* quota */ }
  }, [filters]);
  const [activeKpi, setActiveKpi] = useState(null);

  // ── Janela de período: hoje (00h-now) vs turno atual (diurno 06-18 / noturno 18-06)
  const periodoWindow = useMemo(() => {
    if (filters.periodo === 'turno') {
      const isDiurno = now.getHours() >= 6 && now.getHours() < 18;
      const start = new Date(now);
      if (isDiurno) {
        start.setHours(6, 0, 0, 0);
      } else {
        // turno noturno: começou às 18h (de ontem se hora<6, ou hoje se hora>=18)
        if (now.getHours() < 6) start.setDate(start.getDate() - 1);
        start.setHours(18, 0, 0, 0);
      }
      return { start, end: new Date(now) };
    }
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { start, end: new Date(now) };
  }, [filters.periodo, now]);

  // Helpers semânticos do filtro tipo
  const showTipo = (id) => filters.tipo.length === 0 || filters.tipo.includes(id);
  const showResultado = (id) => filters.resultado.length === 0 || filters.resultado.includes(id);
  const empresaFilterFn = (transp) => filters.empresa === 'todas' || resolveAlias(transp || '') === filters.empresa;

  // ── Atendimentos no período (com filtros: periodo + empresa + operador + tipo)
  const atendimentosNoPeriodo = useMemo(() => {
    return atHistory.filter(a => {
      const d = new Date(a.created_at);
      if (d < periodoWindow.start || d > periodoWindow.end) return false;
      if (filters.operador !== 'todos' && a.operador !== filters.operador) return false;
      if (!empresaFilterFn(a.transportadora)) return false;
      // tipo mapping: intervencao→fadiga, reportar→comportamento, outros não classificados
      if (filters.tipo.length > 0) {
        if (a.tipo === 'intervencao' && !showTipo('fadiga')) return false;
        if (a.tipo === 'reportar' && !showTipo('comportamento')) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atHistory, periodoWindow, filters.operador, filters.empresa, filters.tipo, resolveAlias]);

  // Alias mantido pra compatibilidade com código existente que dizia "atendimentosHoje"
  const atendimentosHoje = atendimentosNoPeriodo;

  // ── Base de drivers com filtros (empresa + tipo). Operador/período/resultado
  // não fazem sentido pra fila de motoristas (snapshot atual, sem operador atribuído)
  const driversFiltered = useMemo(() => {
    return drivers.filter(d => {
      if (!empresaFilterFn(d.transportadora)) return false;
      if (filters.tipo.length > 0) {
        const isFadiga    = (d.alertas || 0) > 0;
        const isComport   = (d.reportaveis || 0) > 0 && !isFadiga;
        if (isFadiga && !showTipo('fadiga')) return false;
        if (isComport && !showTipo('comportamento')) return false;
        if (!isFadiga && !isComport) return false; // só técnico → fora se filtro de tipo ativo
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, filters.empresa, filters.tipo, resolveAlias]);

  // ── Motoristas com alertas (intervenção OU reportar) ──────────────────────
  // Técnico fica em card separado (não conta como "em aberto" do gestor)
  const driversAtivos = useMemo(
    () => driversFiltered.filter(d => (d.alertas || 0) > 0 || (d.reportaveis || 0) > 0),
    [driversFiltered]
  );
  // Subconjunto com intervenção (fadiga) — base pra críticos
  const driversIntervencao = useMemo(
    () => driversFiltered.filter(d => (d.alertas || 0) > 0),
    [driversFiltered]
  );

  // ── Placas com intervenção nos últimos 30 dias (excl. hoje) ────────────────
  const placasPrevia30d = useMemo(() => {
    const cutoff = new Date(now.getTime() - 30 * 86400000);
    return new Set(
      atHistory
        .filter(a =>
          a.tipo === 'intervencao' &&
          new Date(a.created_at) > cutoff &&
          new Date(a.created_at).toDateString() !== todayStr
        )
        .map(a => a.placa)
        .filter(Boolean)
    );
  }, [atHistory, now, todayStr]);

  // ── KPIs base ───────────────────────────────────────────────────────────────
  // Atendimentos "produtivos" do dia: intervenção + reportar (descarte e limpeza
  // não contam como "fechados" pro KPI de produtividade da operação)
  // Filtro resultado: positivo = placa não-reincidente / pos-positivo = reincidente / aberto = drivers
  const intervHoje = useMemo(
    () => atendimentosHoje.filter(a => {
      if (a.tipo !== 'intervencao') return false;
      const isPP = a.placa && placasPrevia30d.has(a.placa);
      if (isPP && !showResultado('pos-positivo')) return false;
      if (!isPP && !showResultado('positivo'))    return false;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atendimentosHoje, placasPrevia30d, filters.resultado]
  );
  const fechadosHoje = useMemo(
    () => atendimentosHoje.filter(a => {
      if (a.tipo !== 'intervencao' && a.tipo !== 'reportar') return false;
      const isPP = a.placa && placasPrevia30d.has(a.placa);
      if (isPP && !showResultado('pos-positivo')) return false;
      if (!isPP && !showResultado('positivo'))    return false;
      return true;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atendimentosHoje, placasPrevia30d, filters.resultado]
  );

  const posPositivo = useMemo(
    () => intervHoje.filter(a => a.placa && placasPrevia30d.has(a.placa)).length,
    [intervHoje, placasPrevia30d]
  );

  const positivo    = intervHoje.length - posPositivo;
  const fechados    = fechadosHoje.length;
  // Filtro resultado: 'aberto' liga/desliga a contagem de em-aberto
  const emAberto    = showResultado('aberto') ? driversAtivos.length : 0;
  const totalAlertas = fechados + emAberto;
  const pctConcluido = totalAlertas > 0 ? Math.round((fechados / totalAlertas) * 100) : 0;
  // Reincidência permanece sobre intervenção (fadiga) — não faz sentido pra reportar
  const taxaReinc    = intervHoje.length > 0 ? (posPositivo / intervHoje.length) * 100 : 0;

  // ── Comparação com ontem (escopada aos mesmos filtros pra delta fazer sentido)
  const ONTEM = useMemo(() => {
    if (!compareYesterday) return null;
    const yStr = new Date(now.getTime() - 86400000).toDateString();
    // Mesmos filtros operador/empresa/tipo aplicados a ontem
    const yAtsAll = atHistory.filter(a => {
      if (new Date(a.created_at).toDateString() !== yStr) return false;
      if (filters.operador !== 'todos' && a.operador !== filters.operador) return false;
      if (!empresaFilterFn(a.transportadora)) return false;
      if (filters.tipo.length > 0) {
        if (a.tipo === 'intervencao' && !showTipo('fadiga')) return false;
        if (a.tipo === 'reportar' && !showTipo('comportamento')) return false;
      }
      return true;
    });
    const yInterv   = yAtsAll.filter(a => a.tipo === 'intervencao');
    const yFechados = yAtsAll.filter(a => a.tipo === 'intervencao' || a.tipo === 'reportar');
    const cutoffY = new Date(now.getTime() - 31 * 86400000);
    const placasPreviaY = new Set(
      atHistory
        .filter(a =>
          a.tipo === 'intervencao' &&
          new Date(a.created_at) > cutoffY &&
          new Date(a.created_at).toDateString() !== yStr
        )
        .map(a => a.placa)
        .filter(Boolean)
    );
    const ppY = yInterv.filter(a => a.placa && placasPreviaY.has(a.placa)).length;
    const yPlacasEvts    = new Set(yAtsAll.filter(a => a.placa).map(a => a.placa));
    const yPlacasFechado = new Set(yFechados.map(a => a.placa).filter(Boolean));
    const emAbertoY      = [...yPlacasEvts].filter(p => !yPlacasFechado.has(p)).length;
    return { total: yFechados.length + emAbertoY, fechados: yFechados.length, posPositivo: ppY, emAberto: emAbertoY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atHistory, compareYesterday, now, filters.operador, filters.empresa, filters.tipo, resolveAlias]);

  // ── Motoristas críticos com SLA ────────────────────────────────────────────
  // Limiares por plataforma (docs PROJECT.md §5.14): Sascar ≥5, Maxtrack ≥8
  const criticThreshold = (platformId) => platformId === 'maxtrack' ? 8 : 5;
  const criticos = useMemo(() => {
    const tiposFadiga = ['Bocejo', 'Olho fechado', 'Sonolência', 'Fadiga'];
    return driversIntervencao
      .filter(d => (d.alertas || 0) >= criticThreshold(d._platformId))
      .map(d => {
        const abertoMin  = d.ultimoEvento ? (now - new Date(d.ultimoEvento)) / 60000 : 0;
        const hasFadiga  = d.tipos?.some(t =>
          tiposFadiga.some(f => t.toLowerCase().includes(f.toLowerCase()))
        );
        const tipo       = hasFadiga ? 'fadiga' : 'comportamento';
        const reincidente = d.placa && placasPrevia30d.has(d.placa);
        const lastInterv = atHistory
          .filter(a =>
            a.tipo === 'intervencao' &&
            a.placa === d.placa &&
            new Date(a.created_at).toDateString() !== todayStr
          )
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const ultimaIntervencao = lastInterv
          ? `${Math.floor((now - new Date(lastInterv.created_at)) / 86400000)}d`
          : null;
        return {
          nome: d.nome,
          placa: d.placa,
          transportadora: resolveAlias(d.transportadora),
          frota: d.frota,
          turno: d.turno,
          alertas: d.alertas,
          tipo,
          reincidente,
          abertoMin,
          ultimaIntervencao,
          eventos: d.eventosDetalhados || [],
        };
      })
      .sort((a, b) => b.abertoMin - a.abertoMin);
  }, [driversIntervencao, atHistory, placasPrevia30d, now, todayStr, resolveAlias]);

  const slaVencidos = criticos.filter(c => c.abertoMin > slaLimit).length;

  // ── Tipos (em aberto) ───────────────────────────────────────────────────────
  const TIPOS = useMemo(() => {
    const tiposFadiga = ['Bocejo', 'Olho fechado', 'Sonolência', 'Fadiga'];
    const fadigaCount = driversAtivos.filter(d =>
      d.tipos?.some(t => tiposFadiga.some(f => t.toLowerCase().includes(f.toLowerCase())))
    ).length;
    const comportCount = driversAtivos.length - fadigaCount;
    return [
      { id: 'fadiga',        label: 'Fadiga',        color: '#E24B4A', count: fadigaCount + positivo, hint: 'Bocejo · Olho fechado · Sonolência' },
      { id: 'comportamento', label: 'Comportamento', color: '#E8A020', count: comportCount,            hint: 'Distração · Comportamento' },
    ];
  }, [driversAtivos, positivo]);

  const RESULTADOS = [
    { id: 'positivo',     label: 'Positivo',      color: '#2DA75A', count: positivo,    hint: 'Intervenção confirmada'         },
    { id: 'pos-positivo', label: 'Pós-positivo',  color: '#2A8DD9', count: posPositivo, hint: 'Reincidiu após intervenção'     },
    { id: 'aberto',       label: 'Em aberto',     color: '#8A94A6', count: emAberto,    hint: 'Aguardando tratamento'          },
  ];

  // ── Transportadoras ─────────────────────────────────────────────────────────
  const transpStats = useMemo(() => {
    const map = new Map();

    driversAtivos.forEach(d => {
      if (!d.transportadora) return;
      const name = resolveAlias(d.transportadora);
      const e = map.get(name) || { name, total: 0, abertos: 0, posPositivos: 0, motoristas: 0 };
      e.abertos++;
      e.motoristas++;
      e.total += (d.alertas || 0) + (d.reportaveis || 0);
      if (d.placa && placasPrevia30d.has(d.placa)) e.posPositivos++;
      map.set(name, e);
    });

    atendimentosHoje
      .filter(a => (a.tipo === 'intervencao' || a.tipo === 'reportar') && a.transportadora)
      .forEach(a => {
        const name = resolveAlias(a.transportadora);
        const e = map.get(name) || { name, total: 0, abertos: 0, posPositivos: 0, motoristas: 0 };
        e.total++;
        if (a.placa && placasPrevia30d.has(a.placa)) e.posPositivos++;
        map.set(name, e);
      });

    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [driversAtivos, atendimentosHoje, placasPrevia30d, resolveAlias]);

  // Transportadoras pros chips do filtro — base UNFILTERED (usuário precisa
  // poder trocar entre empresas). Objetos com {name,total,abertos} pra chip
  // mostrar count real, ordenadas por volume.
  const transpForFilter = useMemo(() => {
    const map = new Map();
    drivers.forEach(d => {
      const name = resolveAlias(d.transportadora);
      if (!name) return;
      const e = map.get(name) || { name, total: 0, abertos: 0 };
      e.total += (d.alertas || 0) + (d.reportaveis || 0);
      if ((d.alertas || 0) > 0 || (d.reportaveis || 0) > 0) e.abertos++;
      map.set(name, e);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [drivers, resolveAlias]);

  // Lista de operadores pro dropdown — equipe atual (profiles), não histórico.
  // Atendimentos antigos podem ter operadores que saíram; filtrar por profiles ativos.
  const operadoresForFilter = useMemo(() => {
    const team = (profiles || [])
      .filter(p => p.role === 'operador' || p.role === 'admin')
      .map(p => ({ nome: p.nome }))
      .filter(p => p.nome);
    return team.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [profiles]);

  // ── Atividade por hora (24h — operação 24/7, turno diurno 06-18 / noturno 18-06)
  const HOURLY = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => {
      const closed = atendimentosHoje.filter(
        a => (a.tipo === 'intervencao' || a.tipo === 'reportar') &&
             new Date(a.created_at).getHours() === h
      ).length;
      const open = driversAtivos.filter(
        d => d.ultimoEvento && new Date(d.ultimoEvento).getHours() === h
      ).length;
      return { h: `${String(h).padStart(2, '0')}h`, closed, open };
    });
  }, [atendimentosHoje, driversAtivos]);

  // ── Alertas técnicos ────────────────────────────────────────────────────────
  const tecnicos = useMemo(() => {
    const techIcons = {
      'Câmera obstruída': 'ti-camera-off',
      'Perda de vídeo':   'ti-video-off',
      'Sem motorista':    'ti-user-off',
    };
    const techMap = {};
    // Técnico é bucket separado: aplica só filtro de empresa (não tipo/operador)
    const baseTech = drivers.filter(d => d.tecnicos > 0 && empresaFilterFn(d.transportadora));
    baseTech.forEach(d => {
      Object.keys(d.tiposTecnico || {}).forEach(tipo => {
        if (!techMap[tipo]) {
          techMap[tipo] = { id: tipo, label: tipo, count: 0, icon: techIcons[tipo] || 'ti-tools', placas: [] };
        }
        techMap[tipo].count += d.tiposTecnico[tipo] || 0;
        if (d.placa) techMap[tipo].placas.push(d.placa);
      });
    });
    return Object.values(techMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, filters.empresa, resolveAlias]);

  // ── Produtividade da equipe ─────────────────────────────────────────────────
  const equipe = useMemo(() => {
    const opMap = {};
    atendimentosHoje.forEach(a => {
      if (!a.operador || a.tipo === 'limpeza') return;
      if (!opMap[a.operador]) opMap[a.operador] = { nome: a.operador, interv: 0, pp: 0, reportes: 0 };
      if (a.tipo === 'intervencao') {
        opMap[a.operador].interv++;
        if (a.placa && placasPrevia30d.has(a.placa)) opMap[a.operador].pp++;
      } else if (a.tipo === 'reportar') {
        opMap[a.operador].reportes++;
      }
    });
    const colors = ['#9E1A45', '#2A8DD9', '#2DA75A', '#E8A020', '#7A1235', '#C24A6A'];
    return Object.values(opMap)
      .map((op, idx) => ({
        nome:         op.nome,
        cargo:        '',
        avatarColor:  colors[idx % colors.length],
        tratados:     { fadigaPos: op.interv - op.pp, fadigaPP: op.pp, compPos: op.reportes, compPP: 0 },
        tempoMedio:   null,
      }))
      .sort((a, b) => {
        const ta = a.tratados.fadigaPos + a.tratados.fadigaPP + a.tratados.compPos;
        const tb = b.tratados.fadigaPos + b.tratados.fadigaPP + b.tratados.compPos;
        return tb - ta;
      });
  }, [atendimentosHoje, placasPrevia30d]);

  // criticos/equipe/transpStats já vêm filtrados da camada base (filters.tipo/empresa/operador)
  // resultado aplicado on top na seção de KPIs/derivados. Aliases pra UI:
  const filteredCriticos = criticos;
  const filteredEquipe   = equipe;
  const filteredTransp   = transpStats;

  // ── Dados auxiliares de UI ──────────────────────────────────────────────────
  const PERIODOS = [
    { id: 'hoje',  label: 'Hoje'  },
    { id: 'turno', label: 'Turno' },
  ];

  const hour = now.getHours();

  // ── "Atualizado há Xmin" — pega o evento mais recente (driver change OU atendimento)
  const lastAtendimentoAt = useMemo(() => {
    if (!atHistory.length) return null;
    return atHistory.reduce((max, a) => {
      const t = new Date(a.created_at).getTime();
      return t > max ? t : max;
    }, 0);
  }, [atHistory]);
  const updatedLabel = useMemo(() => {
    const tDrv = driversLastChangeAt ? new Date(driversLastChangeAt).getTime() : 0;
    const tAt  = lastAtendimentoAt || 0;
    const latest = Math.max(tDrv, tAt);
    if (!latest) return 'Sem dados';
    const diffMin = Math.floor((now.getTime() - latest) / 60000);
    if (diffMin < 1)  return 'Atualizado agora';
    if (diffMin < 60) return `Atualizado há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `Atualizado há ${diffH}h`;
    return `Atualizado há ${Math.floor(diffH / 24)}d`;
  }, [driversLastChangeAt, lastAtendimentoAt, now]);

  // ── Tweaks popover ─────────────────────────────────────────────────────────
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const tweaksRef = useRef(null);
  useEffect(() => {
    if (!tweaksOpen) return;
    const onDown = (e) => {
      if (tweaksRef.current && !tweaksRef.current.contains(e.target)) setTweaksOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [tweaksOpen]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Saudação */}
      <div className="dg-greet">
        <div>
          <h1>Gestão à Vista</h1>
          <div className="meta">
            <span>
              <i className="ti ti-calendar" style={{ fontSize: 12, marginRight: 4 }}></i>
              {fmtDate()}
            </span>
            <span className="sep">·</span>
            <span className="live">{updatedLabel}</span>
            <span className="sep">·</span>
            <span>SLA: {slaLimit} min</span>
          </div>
        </div>
        <div className="dg-greet-actions">
          <div className="dg-tweaks-wrap" ref={tweaksRef}>
            <button
              className={`dg-btn dg-btn-ghost${tweaksOpen ? ' is-active' : ''}`}
              title="Ajustes do painel"
              onClick={() => setTweaksOpen(v => !v)}
            >
              <i className="ti ti-adjustments-alt"></i>
            </button>
            {tweaksOpen && (
              <div className="dg-tweaks-pop" role="dialog" aria-label="Ajustes do painel">
                <div className="dg-tweaks-head">
                  <span><i className="ti ti-adjustments-alt"></i> Ajustes do painel</span>
                  <button className="dg-tweaks-x" onClick={() => setTweaksOpen(false)} title="Fechar"><i className="ti ti-x"></i></button>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">SLA (min)</label>
                  <div className="dg-tweaks-sla">
                    <button onClick={() => setSlaLimit(v => Math.max(5, v - 5))} title="-5"><i className="ti ti-minus"></i></button>
                    <input
                      type="number" min="5" max="240" step="5"
                      value={slaLimit}
                      onChange={(e) => setSlaLimit(Math.max(5, Math.min(240, Number(e.target.value) || 30)))}
                    />
                    <button onClick={() => setSlaLimit(v => Math.min(240, v + 5))} title="+5"><i className="ti ti-plus"></i></button>
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Apresentação</label>
                  <div className="dg-tweaks-toggles">
                    <button
                      className={`dg-tweaks-toggle${compareYesterday ? ' on' : ''}`}
                      onClick={() => setCompareYesterday(v => !v)}
                    >
                      <span className="knob"></span>
                      <span className="txt">Comparar com ontem</span>
                    </button>
                    <button
                      className={`dg-tweaks-toggle${executiveMode ? ' on' : ''}`}
                      onClick={() => setExecutiveMode(v => !v)}
                    >
                      <span className="knob"></span>
                      <span className="txt">Modo executivo</span>
                    </button>
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Layout</label>
                  <div className="dg-tweaks-seg">
                    {[
                      { v: 'balanced', l: 'Balanceado' },
                      { v: 'cinema',   l: 'Cinema' },
                      { v: 'compact',  l: 'Compacto' },
                    ].map(o => (
                      <button
                        key={o.v}
                        className={`dg-tweaks-seg-btn${layout === o.v ? ' on' : ''}`}
                        onClick={() => setLayout(o.v)}
                      >{o.l}</button>
                    ))}
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Seções visíveis</label>
                  <div className="dg-tweaks-chips">
                    <button className={`dg-tweaks-chip${showHourly  ? ' on' : ''}`} onClick={() => setShowHourly(v  => !v)}><i className="ti ti-chart-bar"></i> Atividade por hora</button>
                    <button className={`dg-tweaks-chip${showClassif ? ' on' : ''}`} onClick={() => setShowClassif(v => !v)}><i className="ti ti-chart-pie"></i> Tipo & Resultado</button>
                    <button className={`dg-tweaks-chip${showTech    ? ' on' : ''}`} onClick={() => setShowTech(v    => !v)}><i className="ti ti-tools"></i> Atenção técnica</button>
                    <button className={`dg-tweaks-chip${showTransp  ? ' on' : ''}`} onClick={() => setShowTransp(v  => !v)}><i className="ti ti-building-community"></i> Transportadoras</button>
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Aparência</label>
                  <div className="dg-tweaks-seg" style={{ marginBottom: 6 }}>
                    {[
                      { v: 'light', l: 'Claro',  i: 'ti-sun'  },
                      { v: 'dark',  l: 'Escuro', i: 'ti-moon' },
                    ].map(o => (
                      <button
                        key={o.v}
                        className={`dg-tweaks-seg-btn${theme === o.v ? ' on' : ''}`}
                        onClick={() => setTheme(o.v)}
                      ><i className={`ti ${o.i}`}></i> {o.l}</button>
                    ))}
                  </div>
                  <div className="dg-tweaks-seg" style={{ marginBottom: 6 }}>
                    {[
                      { v: 'compact', l: 'Compacta' },
                      { v: 'normal',  l: 'Normal'   },
                      { v: 'cozy',    l: 'Espaçada' },
                    ].map(o => (
                      <button
                        key={o.v}
                        className={`dg-tweaks-seg-btn${density === o.v ? ' on' : ''}`}
                        onClick={() => setDensity(o.v)}
                      >{o.l}</button>
                    ))}
                  </div>
                  <div className="dg-tweaks-swatches">
                    {[
                      { id: 'vinho', color: '#9E1A45' },
                      { id: 'roxo',  color: '#7C5CFF' },
                      { id: 'azul',  color: '#3F76C2' },
                      { id: 'verde', color: '#2DA75A' },
                      { id: 'ambar', color: '#E8A020' },
                      { id: 'rosa',  color: '#E2548E' },
                    ].map(a => (
                      <button
                        key={a.id}
                        className={`dg-tweaks-sw${accent === a.id ? ' on' : ''}`}
                        style={{ background: a.color }}
                        title={a.id}
                        onClick={() => { setAccent(a.id); applyAccent(a.id); }}
                      />
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <div className="dg-tweaks-foot">
                    <button
                      className="dg-tweaks-link"
                      onClick={() => { setTweaksOpen(false); setActivePanel('admin'); }}
                      title="Unificar nomes diferentes da mesma transportadora"
                    >
                      <i className="ti ti-arrows-shuffle"></i>
                      Configurar aliases de transportadora
                      <i className="ti ti-arrow-right" style={{ marginLeft: 'auto' }}></i>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            className="dg-btn dg-btn-ghost"
            title={tvMode ? 'Mostrar menu' : 'Modo TV'}
            onClick={() => setTvMode(v => !v)}
          >
            <i className={`ti ${tvMode ? 'ti-layout-sidebar-right-expand' : 'ti-layout-sidebar-left-collapse'}`}></i>
          </button>
          <button className="dg-btn dg-btn-primary" onClick={() => setActivePanel('monitor')}>
            <i className="ti ti-truck-delivery"></i> Abrir Monitor
          </button>
        </div>
      </div>

      {/* Filtros */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        tipos={TIPOS}
        resultados={RESULTADOS}
        transportadoras={transpForFilter}
        equipe={operadoresForFilter}
        periodos={PERIODOS}
      />

      {/* Banner SLA vencido */}
      {slaVencidos > 0 && (
        <Banner
          tone="danger"
          icon="ti-clock-exclamation"
          title={`${slaVencidos} alerta${slaVencidos > 1 ? 's' : ''} com SLA vencido — requer atenção imediata`}
          sub={`Motoristas gravíssimos aguardando há mais de ${slaLimit} minutos.`}
        />
      )}

      {/* KPIs */}
      <div className="dg-kpi-row">
        <KPI
          hero
          icon="ti-layers-subtract"
          label="Volume do dia"
          value={totalAlertas}
          sub={`tratados + em aberto · ${pctConcluido}% concluído`}
          compareValue={ONTEM?.total}
          progress={pctConcluido}
          onClick={() => setActiveKpi(activeKpi === 'total' ? null : 'total')}
          active={activeKpi === 'total'}
          accent="#F26931"
        />
        <KPI
          icon="ti-circle-check"
          label="Fechados hoje"
          value={fechados}
          sub={`${pctConcluido}% do volume`}
          compareValue={ONTEM?.fechados}
          accent="var(--success-500)"
          progress={pctConcluido}
          onClick={() => setActiveKpi(activeKpi === 'fechados' ? null : 'fechados')}
          active={activeKpi === 'fechados'}
        />
        <KPI
          icon="ti-clock-hour-4"
          label="Em aberto agora"
          value={emAberto}
          sub={slaVencidos > 0
            ? `${slaVencidos} vencido${slaVencidos > 1 ? 's' : ''} · ${filteredCriticos.length} críticos`
            : `${filteredCriticos.length} em estado crítico`}
          compareValue={ONTEM?.emAberto}
          accent="var(--warning-500)"
          pulse={slaVencidos > 0}
          onClick={() => setActiveKpi(activeKpi === 'aberto' ? null : 'aberto')}
          active={activeKpi === 'aberto'}
        />
        <KPI
          icon="ti-refresh"
          label="Reincidência"
          value={posPositivo}
          sub={`${taxaReinc.toFixed(1)}% dos tratados voltaram`}
          compareValue={ONTEM?.posPositivo}
          accent="#2A8DD9"
          onClick={() => setActiveKpi(activeKpi === 'reinc' ? null : 'reinc')}
          active={activeKpi === 'reinc'}
        />
      </div>

      {/* Drill panel — Volume do dia */}
      {activeKpi === 'total' && (
        <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid #F26931' }}>
          <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
            <div className="dg-drill-col">
              <h4>Por tipo (origem)</h4>
              {TIPOS.map(c => (
                <div key={c.id} className="dg-drill-line">
                  <span>
                    <span style={{ display: 'inline-block', width: 9, height: 9, background: c.color, borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                    {c.label}
                  </span>
                  <span className="v" style={{ color: c.color }}>{c.count}</span>
                </div>
              ))}
            </div>
            <div className="dg-drill-col">
              <h4>Por resultado</h4>
              {RESULTADOS.map(c => (
                <div key={c.id} className="dg-drill-line">
                  <span>
                    <span style={{ display: 'inline-block', width: 9, height: 9, background: c.color, borderRadius: 2, marginRight: 8, verticalAlign: 'middle' }}></span>
                    {c.label}
                  </span>
                  <span className="v" style={{ color: c.color }}>{c.count}</span>
                </div>
              ))}
            </div>
            <div className="dg-drill-col">
              <h4>Top 4 transportadoras</h4>
              {transpStats.slice(0, 4).map(t => (
                <div key={t.name} className="dg-drill-line">
                  <span>{t.name}</span>
                  <span className="v">{t.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drill panel — Fechados */}
      {activeKpi === 'fechados' && (
        <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid var(--success-500)' }}>
          <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
            <div className="dg-drill-col">
              <h4>Intervenções</h4>
              <div className="dg-drill-line">
                <span>Positivos</span>
                <span className="v" style={{ color: '#2DA75A' }}>{positivo}</span>
              </div>
              <div className="dg-drill-line">
                <span>Pós-positivos</span>
                <span className="v" style={{ color: '#2A8DD9' }}>{posPositivo}</span>
              </div>
              <div className="dg-drill-line">
                <span>Total</span>
                <span className="v">{fechados}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Reincidência</h4>
              <div className="dg-drill-line">
                <span>Taxa</span>
                <span className="v" style={{ color: posPositivo > 0 ? '#2A8DD9' : 'var(--success-500)' }}>
                  {taxaReinc.toFixed(1)}%
                </span>
              </div>
              <div className="dg-drill-line">
                <span>Concluído</span>
                <span className="v">{pctConcluido}%</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Por operador (top 4)</h4>
              {equipe.slice(0, 4).map(op => {
                const t = op.tratados.fadigaPos + op.tratados.fadigaPP + op.tratados.compPos;
                return (
                  <div key={op.nome} className="dg-drill-line">
                    <span>{op.nome.split(' ')[0]}</span>
                    <span className="v">{t}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Drill panel — Em aberto */}
      {activeKpi === 'aberto' && (
        <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid var(--warning-500)' }}>
          <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
            <div className="dg-drill-col">
              <h4>Por severidade</h4>
              <div className="dg-drill-line">
                <span>Críticos</span>
                <span className="v" style={{ color: 'var(--danger-500)' }}>{criticos.length}</span>
              </div>
              <div className="dg-drill-line">
                <span>SLA vencido</span>
                <span className="v" style={{ color: slaVencidos > 0 ? 'var(--danger-500)' : 'var(--text-muted)' }}>{slaVencidos}</span>
              </div>
              <div className="dg-drill-line">
                <span>Total em aberto</span>
                <span className="v">{emAberto}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Por tipo</h4>
              {TIPOS.map(c => (
                <div key={c.id} className="dg-drill-line">
                  <span>{c.label}</span>
                  <span className="v" style={{ color: c.color }}>{driversAtivos.filter(d =>
                    c.id === 'fadiga'
                      ? d.tipos?.some(t => ['Bocejo','Olho fechado','Sonolência','Fadiga'].some(f => t.toLowerCase().includes(f.toLowerCase())))
                      : !d.tipos?.some(t => ['Bocejo','Olho fechado','Sonolência','Fadiga'].some(f => t.toLowerCase().includes(f.toLowerCase())))
                  ).length}</span>
                </div>
              ))}
            </div>
            <div className="dg-drill-col">
              <h4>Top transportadoras</h4>
              {transpStats.slice(0, 4).map(t => (
                <div key={t.name} className="dg-drill-line">
                  <span>{t.name.length > 20 ? t.name.slice(0, 18) + '…' : t.name}</span>
                  <span className="v">{t.abertos}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Drill panel — Reincidência */}
      {activeKpi === 'reinc' && (
        <div className="dg-card" style={{ marginBottom: 16, borderTop: '3px solid #2A8DD9' }}>
          <div className="dg-drill" style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
            <div className="dg-drill-col">
              <h4>Resumo</h4>
              <div className="dg-drill-line">
                <span>Pós-positivos hoje</span>
                <span className="v" style={{ color: '#2A8DD9' }}>{posPositivo}</span>
              </div>
              <div className="dg-drill-line">
                <span>Taxa de reinc.</span>
                <span className="v">{taxaReinc.toFixed(1)}%</span>
              </div>
              <div className="dg-drill-line">
                <span>Janela de referência</span>
                <span className="v">30d</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Motoristas reincidentes</h4>
              {criticos.filter(c => c.reincidente).slice(0, 4).map(c => (
                <div key={c.placa} className="dg-drill-line">
                  <span>{c.nome.split(' ')[0]}</span>
                  <span className="v" style={{ color: '#2A8DD9' }}>{c.placa}</span>
                </div>
              ))}
              {criticos.filter(c => c.reincidente).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 6 }}>
                  Nenhum reincidente crítico no momento
                </div>
              )}
            </div>
            <div className="dg-drill-col">
              <h4>Ontem</h4>
              {ONTEM ? (
                <>
                  <div className="dg-drill-line">
                    <span>Intervenções</span>
                    <span className="v">{ONTEM.fechados}</span>
                  </div>
                  <div className="dg-drill-line">
                    <span>Pós-positivos</span>
                    <span className="v" style={{ color: '#2A8DD9' }}>{ONTEM.posPositivo}</span>
                  </div>
                  <div className="dg-drill-line">
                    <span>Taxa</span>
                    <span className="v">{ONTEM.fechados > 0 ? ((ONTEM.posPositivo / ONTEM.fechados) * 100).toFixed(1) : '0.0'}%</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingTop: 6 }}>Comparação desativada</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seção: Pulso da operação */}
      <Section icon="ti-radio" label="Pulso da operação" />

      <div className={`dg-grid dg-layout-${layout}`}>
        {/* Coluna principal — críticos + atividade horária */}
        <div className="dg-col">
          <CriticalSLA criticos={filteredCriticos} slaLimit={slaLimit} />
          {showHourly && !executiveMode && <HourlyActivity hourly={HOURLY} currentHour={hour} />}
        </div>

        {/* Coluna lateral — classificação + alertas técnicos + transportadoras */}
        <div className="dg-col">
          {showClassif && <ClassificationBreakdown tipos={TIPOS} resultados={RESULTADOS} />}
          {showTech && !executiveMode && tecnicos.length > 0 && <TechAlerts tecnicos={tecnicos} />}
          {showTransp && !executiveMode && <TransportadoraRanking transportadoras={filteredTransp.slice(0, 6)} />}
        </div>
      </div>

      {/* Seção: Produtividade */}
      <Section icon="ti-users" label="Produtividade da equipe" />
      <ProductivityRanking equipe={filteredEquipe} />

      {/* Spacer final */}
      <div style={{ height: 32 }}></div>
    </div>
  );
}
