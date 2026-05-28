import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { useApp } from "../context";
import { useAtendimentos } from "../hooks/useAtendimentos";
import { useAutoSync } from "../hooks/useAutoSync";
import { useCarrierAliases } from "../hooks/useCarrierAliases";
import { useProfiles } from "../hooks/useProfiles.jsx";
import sascar from "../platforms/sascar/index.js";
import { applyAccent, fmtDate } from "../utils";
import PlatformBadge from "./PlatformBadge";
import { supabase, isSupabaseConfigured } from "../supabase.js";
import { buildMesesLookback } from "./dashboard/_helpers";
import {
  Banner,
  ClassificationBreakdown,
  CriticalSLA,
  FilterBar,
  HourlyActivity,
  KPI,
  ProductivityRanking,
  Section,
  TechAlerts,
  TransportadoraRanking,
} from "./dashboard/components";
import "./dashboard/dashboard.css";
import { EmAbertoDrill, FechadosDrill, VolumeDrill } from "./dashboard/drills";
import { useDashboardFilters } from "./dashboard/hooks/useDashboardFilters";
import { useDashboardMetrics } from "./dashboard/hooks/useDashboardMetrics";
import { useDashboardSettings } from "./dashboard/hooks/useDashboardSettings";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    drivers: driversReal,
    driversLastChangeAt,
    theme,
    setTheme,
    density,
    setDensity,
    accent,
    setAccent,
    sheetHistory,
  } = useApp();
  const { history: atHistoryReal } = useAtendimentos();
  const { resolveAlias } = useCarrierAliases();
  const { profiles } = useProfiles();
  const { profile: me } = useAuth();
  const isAdmin = me?.role === "admin";
  const scSync = useAutoSync({
    platform: sascar,
    isEnabled: !!me?.sascar_token,
    storageKey: "sascar",
  });

  const drivers = driversReal;
  const atHistory = atHistoryReal;

  // ── UI prefs persistidas em localStorage
  const settings = useDashboardSettings();
  const {
    slaLimit,
    setSlaLimit,
    compareYesterday,
    setCompareYesterday,
    showHourly,
    setShowHourly,
    showTransp,
    setShowTransp,
    showClassif,
    setShowClassif,
    showTech,
    setShowTech,
    tvMode,
    setTvMode,
    executiveMode,
    setExecutiveMode,
    layout,
    setLayout,
    sheetAutoSync,
    setSheetAutoSync,
    sheetSyncMin,
    setSheetSyncMin,
  } = settings;

  // ── Filtros de tela (persistidos em localStorage)
  const { filters, setFilters, showTipo, showResultado, empresaFilterFn } =
    useDashboardFilters(resolveAlias);
  const [activeKpi, setActiveKpi] = useState(null);

  // ── Total de eventos brutos da última planilha carregada (via Supabase / localStorage)
  const readPlatRawTotal = () => {
    try {
      const v = localStorage.getItem('mn_plat_raw_total');
      if (!v) return null;
      const p = JSON.parse(v);
      if (p.date !== new Date().toDateString()) return null; // dado de outro dia
      return p;
    } catch { return null; }
  };
  const [platRaw, setPlatRaw] = useState(readPlatRawTotal);

  useEffect(() => {
    // 1. Escuta mudanças locais de localStorage no mesmo navegador (outras abas)
    const onStorage = (e) => {
      if (e.key === 'mn_plat_raw_total') setPlatRaw(readPlatRawTotal());
    };
    window.addEventListener('storage', onStorage);

    // 2. Busca inicial no Supabase se configurado
    if (isSupabaseConfigured) {
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'plat_raw_total')
        .maybeSingle()
        .then(({ data }) => {
          if (data?.value) {
            const p = data.value;
            if (p.date === new Date().toDateString()) {
              setPlatRaw(p);
              try { localStorage.setItem('mn_plat_raw_total', JSON.stringify(p)); } catch {}
            }
          }
        });

      // 3. Inscrição em tempo real no Supabase para sincronizar entre dispositivos
      const channelName = `plat-raw-total-live-${crypto.randomUUID()}`;
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.plat_raw_total' },
          ({ new: row, eventType }) => {
            if (eventType === 'DELETE') {
              setPlatRaw(null);
              try { localStorage.removeItem('mn_plat_raw_total'); } catch {}
            } else if (row?.value) {
              const p = row.value;
              if (p.date === new Date().toDateString()) {
                setPlatRaw(p);
                try { localStorage.setItem('mn_plat_raw_total', JSON.stringify(p)); } catch {}
              } else {
                setPlatRaw(null);
                try { localStorage.removeItem('mn_plat_raw_total'); } catch {}
              }
            }
          }
        )
        .subscribe();

      return () => {
        window.removeEventListener('storage', onStorage);
        supabase.removeChannel(channel);
      };
    }

    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── Live SLA clock — ticks every 30 s
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const todayStr = now.toDateString();

  // ── Defer below-the-fold/heavy rendering to free main thread during LCP/FCP
  const [deferRest, setDeferRest] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setDeferRest(false), 50);
    return () => clearTimeout(t);
  }, []);

  // ── Sheet: carga inicial — só executa se ainda não foi carregada (evita reload ao trocar de aba)
  useEffect(() => {
    if (!sheetHistory.loaded) {
      sheetHistory.load(buildMesesLookback(3));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sheet: auto-refresh configurável
  const sheetLoadRef = useRef(sheetHistory.load);
  useEffect(() => {
    sheetLoadRef.current = sheetHistory.load;
  }, [sheetHistory.load]);
  useEffect(() => {
    if (!sheetAutoSync) return;
    const id = setInterval(
      () => sheetLoadRef.current(buildMesesLookback(3)),
      Math.max(2, sheetSyncMin) * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [sheetAutoSync, sheetSyncMin]);

  // ── Métricas derivadas (todos os useMemos)
  const m = useDashboardMetrics({
    drivers,
    atHistory,
    sheetHistory,
    now,
    todayStr,
    filters,
    showTipo,
    showResultado,
    empresaFilterFn,
    resolveAlias,
    profiles,
    compareYesterday,
    slaLimit,
  });

  const hour = now.getHours();
  const formattedDate = useMemo(() => fmtDate(now), [now]);

  // ── "Atualizado há Xmin" — pega o evento mais recente
  const updatedLabel = (() => {
    const tDrv = driversLastChangeAt
      ? new Date(driversLastChangeAt).getTime()
      : 0;
    const tAt = m.lastAtendimentoAt || 0;
    const tSh = sheetHistory.loadedAt
      ? new Date(sheetHistory.loadedAt).getTime()
      : 0;
    const latest = Math.max(tDrv, tAt, tSh);
    if (!latest) return "Sem dados";
    const diffMin = Math.floor((now.getTime() - latest) / 60000);
    if (diffMin < 1) return "Atualizado agora";
    if (diffMin < 60) return `Atualizado há ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Atualizado há ${diffH}h`;
    return `Atualizado há ${Math.floor(diffH / 24)}d`;
  })();

  // ── Tweaks popover
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const tweaksRef = useRef(null);
  useEffect(() => {
    if (!tweaksOpen) return;
    const onDown = (e) => {
      if (tweaksRef.current && !tweaksRef.current.contains(e.target))
        setTweaksOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [tweaksOpen]);

  if (!sheetHistory.loaded && !sheetHistory.error) {
    return (
      <div className="dg-skeleton-page">
        {/* Saudação */}
        <div className="dg-greet">
          <div>
            <h1>Gestão à Vista</h1>
            <div className="meta">
              <span>
                <i className="ti ti-calendar" style={{ fontSize: 12, marginRight: 4 }}></i>
                {formattedDate}
              </span>
              <span className="sep">·</span>
              <span className="live">Carregando dados...</span>
            </div>
          </div>
          <div className="dg-greet-actions">
            <div className="skeleton-btn skeleton-shimmer-bg" style={{ width: 90, height: 34, borderRadius: 8 }} />
            <div className="skeleton-btn skeleton-shimmer-bg" style={{ width: 110, height: 34, borderRadius: 8, marginLeft: 8 }} />
          </div>
        </div>

        {/* Filter Bar Skeleton */}
        <div className="dg-filters-sk" />

        {/* KPI Row Skeleton */}
        <div className="dg-kpi-row-sk">
          <div className="dg-kpi-sk is-hero-sk" />
          <div className="dg-kpi-sk" />
          <div className="dg-kpi-sk" />
          <div className="dg-kpi-sk" />
        </div>

        {/* Section Header Skeleton */}
        <div className="dg-section-sk" />

        {/* Grid Skeleton */}
        <div className="dg-grid-sk">
          <div className="dg-col-sk">
            <div className="dg-card-sk" style={{ height: 280 }} />
            <div className="dg-card-sk" style={{ height: 220 }} />
          </div>
          <div className="dg-col-sk">
            <div className="dg-card-sk" style={{ height: 340 }} />
            <div className="dg-card-sk" style={{ height: 320 }} />
          </div>
        </div>
      </div>
    );
  }

  if (sheetHistory.error && !sheetHistory.loaded) {
    return (
      <div className="dg-error-page" style={{ padding: '80px 20px', textAlign: 'center', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 14, margin: '20px 0' }}>
        <div style={{ fontSize: 48, color: 'var(--danger-500)', marginBottom: 16 }}>
          <i className="ti ti-alert-triangle"></i>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Erro ao carregar dados</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, maxWidth: 420, marginInline: 'auto', lineHeight: 1.5 }}>
          {sheetHistory.error}
        </p>
        <button
          className="dg-btn dg-btn-primary"
          onClick={() => sheetHistory.load(buildMesesLookback(3))}
          disabled={sheetHistory.loading}
        >
          {sheetHistory.loading ? 'Carregando...' : 'Tentar novamente'}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Saudação */}
      <div className="dg-greet">
        <div>
          <h1>Gestão à Vista</h1>
          <div className="meta">
            <span>
              <i
                className="ti ti-calendar"
                style={{ fontSize: 12, marginRight: 4 }}
              ></i>
              {formattedDate}
            </span>
            <span className="sep">·</span>
            <span className="live">{updatedLabel}</span>
            <span className="sep">·</span>
            <span>SLA: {slaLimit} min</span>
            {(m.platformCounts.maxtrack > 0 || m.platformCounts.sascar > 0) && (
              <>
                <span className="sep">·</span>
                <span
                  style={{
                    display: "inline-flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  {m.platformCounts.maxtrack > 0 && (
                    <PlatformBadge
                      platformId="maxtrack"
                      count={m.platformCounts.maxtrack}
                    />
                  )}
                  {m.platformCounts.sascar > 0 && (
                    <PlatformBadge
                      platformId="sascar"
                      count={m.platformCounts.sascar}
                    />
                  )}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="dg-greet-actions">
          <div className="dg-tweaks-wrap" ref={tweaksRef}>
            <button
              className={`dg-btn dg-btn-ghost${tweaksOpen ? " is-active" : ""}`}
              title="Ajustes do painel"
              onClick={() => setTweaksOpen((v) => !v)}
            >
              <i className="ti ti-adjustments-alt"></i>
            </button>
            {tweaksOpen && (
              <div
                className="dg-tweaks-pop"
                role="dialog"
                aria-label="Ajustes do painel"
              >
                <div className="dg-tweaks-head">
                  <span>
                    <i className="ti ti-adjustments-alt"></i> Ajustes do painel
                  </span>
                  <button
                    className="dg-tweaks-x"
                    onClick={() => setTweaksOpen(false)}
                    title="Fechar"
                  >
                    <i className="ti ti-x"></i>
                  </button>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">SLA (min)</label>
                  <div className="dg-tweaks-sla">
                    <button
                      onClick={() => setSlaLimit((v) => Math.max(5, v - 5))}
                      title="-5"
                    >
                      <i className="ti ti-minus"></i>
                    </button>
                    <input
                      type="number"
                      min="5"
                      max="240"
                      step="5"
                      value={slaLimit}
                      onChange={(e) =>
                        setSlaLimit(
                          Math.max(
                            5,
                            Math.min(240, Number(e.target.value) || 30),
                          ),
                        )
                      }
                    />
                    <button
                      onClick={() => setSlaLimit((v) => Math.min(240, v + 5))}
                      title="+5"
                    >
                      <i className="ti ti-plus"></i>
                    </button>
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Atualização automática</label>
                  {!!me?.sascar_token && (
                    <div style={{ marginBottom: 6 }}>
                      <div className="dg-tweaks-toggles">
                        <button
                          className={`dg-tweaks-toggle${scSync.autoSync ? " on" : ""}`}
                          onClick={() => scSync.setAutoSync((v) => !v)}
                        >
                          <span className="knob"></span>
                          <span className="txt">
                            Buscar Sascar automaticamente
                          </span>
                        </button>
                      </div>
                      {scSync.autoSync && (
                        <div className="dg-tweaks-sla" style={{ marginTop: 6 }}>
                          <button
                            onClick={() =>
                              scSync.setSyncIntervalMin((v) =>
                                Math.max(2, v - 1),
                              )
                            }
                            title="-1 min"
                          >
                            <i className="ti ti-minus"></i>
                          </button>
                          <input
                            type="number"
                            min="2"
                            max="60"
                            step="1"
                            value={scSync.syncIntervalMin}
                            onChange={(e) =>
                              scSync.setSyncIntervalMin(
                                Number(e.target.value) || 5,
                              )
                            }
                          />
                          <button
                            onClick={() =>
                              scSync.setSyncIntervalMin((v) =>
                                Math.min(60, v + 1),
                              )
                            }
                            title="+1 min"
                          >
                            <i className="ti ti-plus"></i>
                          </button>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--text-muted)",
                              marginLeft: 4,
                            }}
                          >
                            min
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    <div className="dg-tweaks-toggles">
                      <button
                        className={`dg-tweaks-toggle${sheetAutoSync ? " on" : ""}`}
                        onClick={() => setSheetAutoSync((v) => !v)}
                      >
                        <span className="knob"></span>
                        <span className="txt">
                          Buscar planilha automaticamente
                        </span>
                      </button>
                    </div>
                    {sheetAutoSync && (
                      <div className="dg-tweaks-sla" style={{ marginTop: 6 }}>
                        <button
                          onClick={() =>
                            setSheetSyncMin((v) => Math.max(2, v - 1))
                          }
                          title="-1 min"
                        >
                          <i className="ti ti-minus"></i>
                        </button>
                        <input
                          type="number"
                          min="2"
                          max="60"
                          step="1"
                          value={sheetSyncMin}
                          onChange={(e) =>
                            setSheetSyncMin(
                              Math.max(
                                2,
                                Math.min(60, Number(e.target.value) || 10),
                              ),
                            )
                          }
                        />
                        <button
                          onClick={() =>
                            setSheetSyncMin((v) => Math.min(60, v + 1))
                          }
                          title="+1 min"
                        >
                          <i className="ti ti-plus"></i>
                        </button>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            marginLeft: 4,
                          }}
                        >
                          min
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Apresentação</label>
                  <div className="dg-tweaks-toggles">
                    <button
                      className={`dg-tweaks-toggle${compareYesterday ? " on" : ""}`}
                      onClick={() => setCompareYesterday((v) => !v)}
                    >
                      <span className="knob"></span>
                      <span className="txt">Comparar com ontem</span>
                    </button>
                    <button
                      className={`dg-tweaks-toggle${executiveMode ? " on" : ""}`}
                      onClick={() => setExecutiveMode((v) => !v)}
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
                      { v: "balanced", l: "Balanceado" },
                      { v: "cinema", l: "Cinema" },
                      { v: "compact", l: "Compacto" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={`dg-tweaks-seg-btn${layout === o.v ? " on" : ""}`}
                        onClick={() => setLayout(o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Seções visíveis</label>
                  <div className="dg-tweaks-chips">
                    <button
                      className={`dg-tweaks-chip${showHourly ? " on" : ""}`}
                      onClick={() => setShowHourly((v) => !v)}
                    >
                      <i className="ti ti-chart-bar"></i> Atividade por hora
                    </button>
                    <button
                      className={`dg-tweaks-chip${showClassif ? " on" : ""}`}
                      onClick={() => setShowClassif((v) => !v)}
                    >
                      <i className="ti ti-chart-pie"></i> Tipo & Resultado
                    </button>
                    <button
                      className={`dg-tweaks-chip${showTech ? " on" : ""}`}
                      onClick={() => setShowTech((v) => !v)}
                    >
                      <i className="ti ti-tools"></i> Atenção técnica
                    </button>
                    <button
                      className={`dg-tweaks-chip${showTransp ? " on" : ""}`}
                      onClick={() => setShowTransp((v) => !v)}
                    >
                      <i className="ti ti-building-community"></i>{" "}
                      Transportadoras
                    </button>
                  </div>
                </div>

                <div className="dg-tweaks-grp">
                  <label className="dg-tweaks-lb">Aparência</label>
                  <div className="dg-tweaks-seg" style={{ marginBottom: 6 }}>
                    {[
                      { v: "light", l: "Claro", i: "ti-sun" },
                      { v: "dark", l: "Escuro", i: "ti-moon" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={`dg-tweaks-seg-btn${theme === o.v ? " on" : ""}`}
                        onClick={() => setTheme(o.v)}
                      >
                        <i className={`ti ${o.i}`}></i> {o.l}
                      </button>
                    ))}
                  </div>
                  <div className="dg-tweaks-seg" style={{ marginBottom: 6 }}>
                    {[
                      { v: "compact", l: "Compacta" },
                      { v: "normal", l: "Normal" },
                      { v: "cozy", l: "Espaçada" },
                    ].map((o) => (
                      <button
                        key={o.v}
                        className={`dg-tweaks-seg-btn${density === o.v ? " on" : ""}`}
                        onClick={() => setDensity(o.v)}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                  <div className="dg-tweaks-swatches">
                    {[
                      { id: "vinho", color: "#9E1A45" },
                      { id: "roxo", color: "#7C5CFF" },
                      { id: "azul", color: "#3F76C2" },
                      { id: "verde", color: "#2DA75A" },
                      { id: "ambar", color: "#E8A020" },
                      { id: "rosa", color: "#E2548E" },
                    ].map((a) => (
                      <button
                        key={a.id}
                        className={`dg-tweaks-sw${accent === a.id ? " on" : ""}`}
                        style={{ background: a.color }}
                        title={a.id}
                        onClick={() => {
                          setAccent(a.id);
                          applyAccent(a.id);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <div className="dg-tweaks-foot">
                    <button
                      className="dg-tweaks-link"
                      onClick={() => {
                        setTweaksOpen(false);
                        navigate("/admin");
                      }}
                      title="Unificar nomes diferentes da mesma transportadora"
                    >
                      <i className="ti ti-arrows-shuffle"></i>
                      Configurar aliases de transportadora
                      <i
                        className="ti ti-arrow-right"
                        style={{ marginLeft: "auto" }}
                      ></i>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          {!!me?.sascar_token && scSync.autoSync && (
            <button
              className={`dg-btn dg-btn-ghost${scSync.syncError ? " dg-sync-error" : ""}`}
              title={
                scSync.syncError ||
                (scSync.lastSyncAt
                  ? `Sascar — último sync: ${scSync.lastSyncAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : "Sascar — aguardando primeiro sync")
              }
              onClick={() => !scSync.syncing && scSync.doSync()}
              disabled={scSync.syncing}
            >
              <i
                className={`ti ti-refresh${scSync.syncing ? " dg-spin" : ""}`}
              ></i>
              {" Sascar "}
              {scSync.syncing
                ? "…"
                : scSync.lastSyncAt
                  ? scSync.lastSyncAt.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Auto"}
            </button>
          )}
          {sheetAutoSync && (
            <button
              className={`dg-btn dg-btn-ghost${sheetHistory.error ? " dg-sync-error" : ""}`}
              title={
                sheetHistory.error ||
                (sheetHistory.loadedAt
                  ? `Planilha — última leitura: ${new Date(sheetHistory.loadedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : "Planilha — aguardando primeira leitura")
              }
              onClick={() =>
                !sheetHistory.loading &&
                sheetHistory.load(buildMesesLookback(3))
              }
              disabled={sheetHistory.loading}
            >
              <i
                className={`ti ti-refresh${sheetHistory.loading ? " dg-spin" : ""}`}
              ></i>
              {" Planilha "}
              {sheetHistory.loading
                ? "…"
                : sheetHistory.loadedAt
                  ? new Date(sheetHistory.loadedAt).toLocaleTimeString(
                      "pt-BR",
                      { hour: "2-digit", minute: "2-digit" },
                    )
                  : "Auto"}
            </button>
          )}
          <button
            className="dg-btn dg-btn-ghost"
            title={tvMode ? "Mostrar menu" : "Modo TV"}
            onClick={() => setTvMode((v) => !v)}
          >
            <i
              className={`ti ${tvMode ? "ti-layout-sidebar-right-expand" : "ti-layout-sidebar-left-collapse"}`}
            ></i>
          </button>
          <button
            className="dg-btn dg-btn-primary"
            onClick={() => navigate("/monitor/intervencao")}
          >
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
          onClick={() => setActiveKpi(activeKpi === "total" ? null : "total")}
          active={activeKpi === "total"}
          accent="#F26931"
        />
        <KPI
          icon="ti-circle-check"
          label="Fechados hoje"
          value={platRaw ? platRaw.total : m.encerradosPlataforma}
          sub={platRaw
            ? `eventos processados · ${platRaw.platform}`
            : `${m.pctConcluidoPlataforma}% do volume · plataforma`}
          compareValue={m.ONTEM?.fechados}
          accent="var(--success-500)"
          progress={platRaw ? null : m.pctConcluidoPlataforma}
        />
        <KPI
          icon="ti-clock-hour-4"
          label="Em aberto agora"
          value={m.emAberto}
          sub={
            m.slaVencidos > 0
              ? `${m.slaVencidos} vencido${m.slaVencidos > 1 ? "s" : ""} · ${m.criticos.length} críticos`
              : `${m.criticos.length} em estado crítico`
          }
          compareValue={m.ONTEM?.emAberto}
          accent="var(--warning-500)"
          pulse={m.slaVencidos > 0}
          onClick={() => setActiveKpi(activeKpi === "aberto" ? null : "aberto")}
          active={activeKpi === "aberto"}
        />
        <KPI
          icon="ti-headset"
          label="Intervenções realizadas"
          value={m.intervencoesRegistradas}
          sub={`${m.sheetSolicitadasHoje} solicitadas · ${m.encerradosPlataforma} plataforma · ${m.sheetIntervencoesHoje} planilha`}
          accent="#2A8DD9"
          onClick={() =>
            setActiveKpi(activeKpi === "intervencoes" ? null : "intervencoes")
          }
          active={activeKpi === "intervencoes"}
        />
      </div>

      {/* Banner SLA vencido */}
      {m.slaVencidos > 0 && (
        <Banner
          tone="danger"
          icon="ti-clock-exclamation"
          title={`${m.slaVencidos} alerta${m.slaVencidos > 1 ? "s" : ""} com SLA vencido — requer atenção imediata`}
          sub={`Motoristas gravíssimos aguardando há mais de ${slaLimit} minutos.`}
        />
      )}

      {/* Drill panels */}
      {activeKpi === "total" && (
        <VolumeDrill
          TIPOS={m.volumeTipos}
          RESULTADOS={m.volumeResultados}
          transpStats={m.transpStats}
        />
      )}
      {activeKpi === "aberto" && (
        <EmAbertoDrill
          criticos={m.criticos}
          slaVencidos={m.slaVencidos}
          emAberto={m.emAberto}
          TIPOS={m.emAbertoTipos}
          driversAtivos={m.driversAtivos}
          transpStats={m.transpStats}
        />
      )}
      {activeKpi === "intervencoes" && (
        <FechadosDrill
          positivo={m.positivo}
          posPositivo={m.posPositivo}
          fechados={m.fechados}
          taxaReinc={m.taxaReinc}
          pctConcluido={m.pctConcluido}
          equipe={m.equipe}
        />
      )}

      {/* Seção: Pulso da operação */}
      <Section icon="ti-radio" label="Pulso da operação" />

      <div className={`dg-grid dg-layout-${layout}`}>
        {/* Coluna principal — críticos + atividade horária */}
        <div className="dg-col">
          <CriticalSLA criticos={m.criticos} slaLimit={slaLimit} />
          {showHourly && !executiveMode && (
            deferRest ? (
              <div className="dg-card-sk" style={{ height: 220 }} />
            ) : (
              <HourlyActivity hourly={m.HOURLY} currentHour={hour} />
            )
          )}
        </div>

        {/* Coluna lateral — classificação + alertas técnicos + transportadoras */}
        <div className="dg-col">
          {showClassif && (
            deferRest ? (
              <div className="dg-card-sk" style={{ height: 340 }} />
            ) : (
              <ClassificationBreakdown
                tipos={m.TIPOS}
                resultados={m.RESULTADOS}
              />
            )
          )}
          {showTech && !executiveMode && m.tecnicos.length > 0 && (
            deferRest ? (
              <div className="dg-card-sk" style={{ height: 140 }} />
            ) : (
              <TechAlerts tecnicos={m.tecnicos} />
            )
          )}
          {showTransp && !executiveMode && (
            deferRest ? (
              <div className="dg-card-sk" style={{ height: 320 }} />
            ) : (
              <TransportadoraRanking
                transportadoras={m.transpStats.slice(0, 6)}
              />
            )
          )}
        </div>
      </div>

      {/* Seção: Produtividade */}
      <Section icon="ti-users" label="Produtividade da equipe" />
      {deferRest ? (
        <div className="dg-card-sk" style={{ height: 240 }} />
      ) : (
        <ProductivityRanking equipe={m.equipe} />
      )}

      {/* Spacer final */}
      <div style={{ height: 32 }}></div>
    </div>
  );
}
