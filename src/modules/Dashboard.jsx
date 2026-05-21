import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useCarrierAliases } from '../hooks/useCarrierAliases';
import { useProfiles } from '../hooks/useProfiles.jsx';
import { useSheetHistory } from '../hooks/useSheetHistory.js';
import { fmtDate, applyAccent } from '../utils';
import './dashboard/dashboard.css';
import { useAutoSync } from '../hooks/useAutoSync';
import maxtrack from '../platforms/maxtrack/index.js';
import sascar from '../platforms/sascar/index.js';
import PlatformBadge from './PlatformBadge';
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
  SheetInsights,
} from './dashboard/components';
import { buildMesesLookback } from './dashboard/_helpers';
import { useDashboardSettings } from './dashboard/hooks/useDashboardSettings';
import { useDashboardFilters } from './dashboard/hooks/useDashboardFilters';
import { useDashboardMetrics } from './dashboard/hooks/useDashboardMetrics';
import {
  VolumeDrill, FechadosDrill, EmAbertoDrill,
} from './dashboard/drills';
import { useMaxtrackClosed } from '../hooks/useMaxtrackClosed';

const PERIODOS = [
  { id: 'hoje',  label: 'Hoje'  },
  { id: 'turno', label: 'Turno' },
];

export default function Dashboard() {
  const { drivers: driversReal, driversLastChangeAt, setActivePanel, theme, setTheme, density, setDensity, accent, setAccent } = useApp();
  const { history: atHistoryReal } = useAtendimentos();
  const { resolveAlias } = useCarrierAliases();
  const { profiles } = useProfiles();
  const { profile: me } = useAuth();
  const isAdmin = me?.role === 'admin';
  const mxSync = useAutoSync({ platform: maxtrack, isEnabled: !!me?.maxtrack_email, storageKey: 'maxtrack' });
  const scSync = useAutoSync({ platform: sascar,   isEnabled: !!me?.sascar_token,   storageKey: 'sascar'   });
  const sheetHistory = useSheetHistory();
  const maxtrackClosed = useMaxtrackClosed();
  const hasMaxtrack = !!me?.maxtrack_email;

  const drivers   = driversReal;
  const atHistory = atHistoryReal;

  // ── UI prefs persistidas em localStorage
  const settings = useDashboardSettings();
  const {
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
  } = settings;

  // ── Filtros de tela (persistidos em localStorage)
  const { filters, setFilters, showTipo, showResultado, empresaFilterFn } = useDashboardFilters(resolveAlias);
  const [activeKpi, setActiveKpi] = useState(null);

  // ── Live SLA clock — ticks every 30 s
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const todayStr = now.toDateString();

  // ── Sheet: carga inicial (4 meses pra cobrir janela de reincidência 90d)
  useEffect(() => {
    sheetHistory.load(buildMesesLookback(3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sheet: auto-refresh configurável
  const sheetLoadRef = useRef(sheetHistory.load);
  useEffect(() => { sheetLoadRef.current = sheetHistory.load; }, [sheetHistory.load]);
  useEffect(() => {
    if (!sheetAutoSync) return;
    const id = setInterval(() => sheetLoadRef.current(buildMesesLookback(3)), Math.max(2, sheetSyncMin) * 60 * 1000);
    return () => clearInterval(id);
  }, [sheetAutoSync, sheetSyncMin]);

  // ── Auto-fetch Maxtrack closed events on mount
  useEffect(() => {
    if (hasMaxtrack) maxtrackClosed.buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Métricas derivadas (todos os useMemos)
  const m = useDashboardMetrics({
    drivers, atHistory, sheetHistory,
    now, todayStr,
    filters, showTipo, showResultado, empresaFilterFn,
    resolveAlias, profiles,
    compareYesterday, slaLimit,
    maxtrackClosedCount: maxtrackClosed.events.length,
    hasMaxtrack,
  });

  const hour = now.getHours();

  // ── "Atualizado há Xmin" — pega o evento mais recente
  const updatedLabel = (() => {
    const tDrv = driversLastChangeAt ? new Date(driversLastChangeAt).getTime() : 0;
    const tAt  = m.lastAtendimentoAt || 0;
    const tSh  = sheetHistory.loadedAt ? new Date(sheetHistory.loadedAt).getTime() : 0;
    const latest = Math.max(tDrv, tAt, tSh);
    if (!latest) return 'Sem dados';
    const diffMin = Math.floor((now.getTime() - latest) / 60000);
    if (diffMin < 1)  return 'Atualizado agora';
    if (diffMin < 60) return `Atualizado há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `Atualizado há ${diffH}h`;
    return `Atualizado há ${Math.floor(diffH / 24)}d`;
  })();

  // ── Tweaks popover
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
            {(m.platformCounts.maxtrack > 0 || m.platformCounts.sascar > 0) && (
              <>
                <span className="sep">·</span>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {m.platformCounts.maxtrack > 0 && <PlatformBadge platformId="maxtrack" count={m.platformCounts.maxtrack} />}
                  {m.platformCounts.sascar   > 0 && <PlatformBadge platformId="sascar"   count={m.platformCounts.sascar} />}
                </span>
              </>
            )}
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
                  <label className="dg-tweaks-lb">Atualização automática</label>
                  {[
                    { label: 'Maxtrack', enabled: !!me?.maxtrack_email, sync: mxSync },
                    { label: 'Sascar',   enabled: !!me?.sascar_token,   sync: scSync },
                  ].filter(p => p.enabled).map(({ label, sync }) => (
                    <div key={label} style={{ marginBottom: 6 }}>
                      <div className="dg-tweaks-toggles">
                        <button
                          className={`dg-tweaks-toggle${sync.autoSync ? ' on' : ''}`}
                          onClick={() => sync.setAutoSync(v => !v)}
                        >
                          <span className="knob"></span>
                          <span className="txt">Buscar {label} automaticamente</span>
                        </button>
                      </div>
                      {sync.autoSync && (
                        <div className="dg-tweaks-sla" style={{ marginTop: 6 }}>
                          <button onClick={() => sync.setSyncIntervalMin(v => Math.max(2, v - 1))} title="-1 min"><i className="ti ti-minus"></i></button>
                          <input
                            type="number" min="2" max="60" step="1"
                            value={sync.syncIntervalMin}
                            onChange={(e) => sync.setSyncIntervalMin(Number(e.target.value) || 5)}
                          />
                          <button onClick={() => sync.setSyncIntervalMin(v => Math.min(60, v + 1))} title="+1 min"><i className="ti ti-plus"></i></button>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>min</span>
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ marginBottom: 6 }}>
                    <div className="dg-tweaks-toggles">
                      <button
                        className={`dg-tweaks-toggle${sheetAutoSync ? ' on' : ''}`}
                        onClick={() => setSheetAutoSync(v => !v)}
                      >
                        <span className="knob"></span>
                        <span className="txt">Buscar planilha automaticamente</span>
                      </button>
                    </div>
                    {sheetAutoSync && (
                      <div className="dg-tweaks-sla" style={{ marginTop: 6 }}>
                        <button onClick={() => setSheetSyncMin(v => Math.max(2, v - 1))} title="-1 min"><i className="ti ti-minus"></i></button>
                        <input
                          type="number" min="2" max="60" step="1"
                          value={sheetSyncMin}
                          onChange={(e) => setSheetSyncMin(Math.max(2, Math.min(60, Number(e.target.value) || 10)))}
                        />
                        <button onClick={() => setSheetSyncMin(v => Math.min(60, v + 1))} title="+1 min"><i className="ti ti-plus"></i></button>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>min</span>
                      </div>
                    )}
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
                    <button className={`dg-tweaks-chip${showSheet   ? ' on' : ''}`} onClick={() => setShowSheet(v   => !v)}><i className="ti ti-table"></i> Planilha</button>
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
          {[
            { label: 'Maxtrack', enabled: !!me?.maxtrack_email, sync: mxSync },
            { label: 'Sascar',   enabled: !!me?.sascar_token,   sync: scSync },
          ].filter(p => p.enabled && p.sync.autoSync).map(({ label, sync }) => (
            <button
              key={label}
              className={`dg-btn dg-btn-ghost${sync.syncError ? ' dg-sync-error' : ''}`}
              title={sync.syncError || (sync.lastSyncAt ? `${label} — último sync: ${sync.lastSyncAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : `${label} — aguardando primeiro sync`)}
              onClick={() => !sync.syncing && sync.doSync()}
              disabled={sync.syncing}
            >
              <i className={`ti ti-refresh${sync.syncing ? ' dg-spin' : ''}`}></i>
              {` ${label} `}
              {sync.syncing
                ? '…'
                : sync.lastSyncAt
                  ? sync.lastSyncAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  : 'Auto'}
            </button>
          ))}
          {sheetAutoSync && (
            <button
              className={`dg-btn dg-btn-ghost${sheetHistory.error ? ' dg-sync-error' : ''}`}
              title={sheetHistory.error || (sheetHistory.loadedAt ? `Planilha — última leitura: ${new Date(sheetHistory.loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Planilha — aguardando primeira leitura')}
              onClick={() => !sheetHistory.loading && sheetHistory.load(buildMesesLookback(3))}
              disabled={sheetHistory.loading}
            >
              <i className={`ti ti-refresh${sheetHistory.loading ? ' dg-spin' : ''}`}></i>
              {' Planilha '}
              {sheetHistory.loading
                ? '…'
                : sheetHistory.loadedAt
                  ? new Date(sheetHistory.loadedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                  : 'Auto'}
            </button>
          )}
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
        tipos={m.TIPOS}
        resultados={m.RESULTADOS}
        transportadoras={m.transpForFilter}
        equipe={m.operadoresForFilter}
        periodos={PERIODOS}
      />

      {/* Banner SLA vencido */}
      {m.slaVencidos > 0 && (
        <Banner
          tone="danger"
          icon="ti-clock-exclamation"
          title={`${m.slaVencidos} alerta${m.slaVencidos > 1 ? 's' : ''} com SLA vencido — requer atenção imediata`}
          sub={`Motoristas gravíssimos aguardando há mais de ${slaLimit} minutos.`}
        />
      )}

      {/* KPIs */}
      <div className="dg-kpi-row">
        <KPI
          hero
          icon="ti-layers-subtract"
          label="Volume do dia"
          value={m.totalAlertas}
          sub={`encerrados + em aberto · ${m.pctConcluido}% concluído`}
          compareValue={m.ONTEM?.total}
          progress={m.pctConcluido}
          onClick={() => setActiveKpi(activeKpi === 'total' ? null : 'total')}
          active={activeKpi === 'total'}
          accent="#F26931"
        />
        <KPI
          icon="ti-circle-check"
          label="Fechados hoje"
          value={m.encerradosPlataforma}
          sub={hasMaxtrack && maxtrackClosed.loading ? 'carregando…' : `${m.pctConcluido}% do volume`}
          compareValue={m.ONTEM?.fechados}
          accent="var(--success-500)"
          progress={m.pctConcluido}
        />
        <KPI
          icon="ti-clock-hour-4"
          label="Em aberto agora"
          value={m.emAberto}
          sub={m.slaVencidos > 0
            ? `${m.slaVencidos} vencido${m.slaVencidos > 1 ? 's' : ''} · ${m.criticos.length} críticos`
            : `${m.criticos.length} em estado crítico`}
          compareValue={m.ONTEM?.emAberto}
          accent="var(--warning-500)"
          pulse={m.slaVencidos > 0}
          onClick={() => setActiveKpi(activeKpi === 'aberto' ? null : 'aberto')}
          active={activeKpi === 'aberto'}
        />
        <KPI
          icon="ti-headset"
          label="Intervenções"
          value={m.intervencoesRegistradas}
          sub={`${m.fechados} registradas · ${m.sheetIntervencoesHoje} planilha`}
          accent="#2A8DD9"
          onClick={() => setActiveKpi(activeKpi === 'intervencoes' ? null : 'intervencoes')}
          active={activeKpi === 'intervencoes'}
        />
      </div>

      {/* Drill panels */}
      {activeKpi === 'total'        && <VolumeDrill   TIPOS={m.TIPOS} RESULTADOS={m.RESULTADOS} transpStats={m.transpStats} />}
      {activeKpi === 'aberto'       && <EmAbertoDrill criticos={m.criticos} slaVencidos={m.slaVencidos} emAberto={m.emAberto} TIPOS={m.TIPOS} driversAtivos={m.driversAtivos} transpStats={m.transpStats} />}
      {activeKpi === 'intervencoes' && <FechadosDrill positivo={m.positivo} posPositivo={m.posPositivo} fechados={m.fechados} taxaReinc={m.taxaReinc} pctConcluido={m.pctConcluido} equipe={m.equipe} />}

      {/* Seção: Pulso da operação */}
      <Section icon="ti-radio" label="Pulso da operação" />

      <div className={`dg-grid dg-layout-${layout}`}>
        {/* Coluna principal — críticos + atividade horária */}
        <div className="dg-col">
          <CriticalSLA criticos={m.criticos} slaLimit={slaLimit} />
          {showHourly && !executiveMode && <HourlyActivity hourly={m.HOURLY} currentHour={hour} />}
        </div>

        {/* Coluna lateral — classificação + alertas técnicos + transportadoras */}
        <div className="dg-col">
          {showClassif && <ClassificationBreakdown tipos={m.TIPOS} resultados={m.RESULTADOS} />}
          {showTech && !executiveMode && m.tecnicos.length > 0 && <TechAlerts tecnicos={m.tecnicos} />}
          {showTransp && !executiveMode && <TransportadoraRanking transportadoras={m.transpStats.slice(0, 6)} />}
        </div>
      </div>

      {/* Seção: Planilha de intervenções */}
      {showSheet && !executiveMode && (
        <>
          <Section icon="ti-table" label="Planilha de intervenções" />
          <SheetInsights
            tmaMin={m.sheetTMA.avg}
            tmaSampleSize={m.sheetTMA.n}
            criticidade={m.sheetCriticidade}
            classificacao={m.sheetClassificacao}
            pendencias={m.sheetPendencias}
            totalHoje={m.sheetRowsPeriodo.length}
            loading={sheetHistory.loading}
            error={sheetHistory.error}
            ageMin={m.sheetAgeMin}
            syncing={sheetHistory.loading}
            onRefresh={() => sheetHistory.load(buildMesesLookback(3))}
          />
        </>
      )}

      {/* Seção: Produtividade */}
      <Section icon="ti-users" label="Produtividade da equipe" />
      <ProductivityRanking equipe={m.equipe} />

      {/* Spacer final */}
      <div style={{ height: 32 }}></div>
    </div>
  );
}
