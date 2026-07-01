import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context";
import { useAtendimentos } from "../hooks/useAtendimentos";
import { useCarrierAliases } from "../hooks/useCarrierAliases";
import { useProfiles } from "../hooks/useProfiles.jsx";
import { fmtDate } from "../utils";
import PlatformBadge from "./PlatformBadge";
import { supabase, isSupabaseConfigured } from "../supabase.js";
import { buildMesesLookback } from "./dashboard/_helpers";
import {
  Banner,
  CriticalSLA,
  FilterBar,
  KPI,
  ProductivityRanking,
  Section,
  SheetInsights,
  TechAlerts,
  TransportadoraRanking,
} from "./dashboard/components";
import "./dashboard/dashboard.css";
import { EmAbertoDrill, FechadosDrill, VolumeDrill } from "./dashboard/drills";
import { useDashboardFilters } from "./dashboard/hooks/useDashboardFilters";
import { useDashboardMetrics } from "./dashboard/hooks/useDashboardMetrics";

const PERIODOS = [
  { id: "hoje", label: "Hoje" },
];

// Dashboard é uma visão única compartilhada por todos (sem preferências por usuário).
const SLA_LIMIT_MIN = 30;
const COMPARE_YESTERDAY = true;

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    drivers: driversReal,
    driversLastChangeAt,
    sheetHistory,
  } = useApp();
  const { history: atHistoryReal } = useAtendimentos();
  const { resolveAlias } = useCarrierAliases();
  const { profiles } = useProfiles();

  const drivers = driversReal;
  const atHistory = atHistoryReal;

  // ── Modo TV: esconde a sidebar pra exibição em TV/parede (persistido em localStorage)
  const [tvMode, setTvMode] = useState(() => localStorage.getItem('mn_dash_tv') === 'true');
  useEffect(() => {
    document.body.classList.toggle('dash-tv-mode', tvMode);
    localStorage.setItem('mn_dash_tv', String(tvMode));
    return () => document.body.classList.remove('dash-tv-mode');
  }, [tvMode]);

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
              try { localStorage.setItem('mn_plat_raw_total', JSON.stringify(p)); } catch { /* storage não crítico */ }
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
              try { localStorage.removeItem('mn_plat_raw_total'); } catch { /* storage não crítico */ }
            } else if (row?.value) {
              const p = row.value;
              if (p.date === new Date().toDateString()) {
                setPlatRaw(p);
                try { localStorage.setItem('mn_plat_raw_total', JSON.stringify(p)); } catch { /* storage não crítico */ }
              } else {
                setPlatRaw(null);
                try { localStorage.removeItem('mn_plat_raw_total'); } catch { /* storage não crítico */ }
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
    compareYesterday: COMPARE_YESTERDAY,
    slaLimit: SLA_LIMIT_MIN,
  });

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

  const fechadosHojeValue = platRaw ? platRaw.total : m.encerradosPlataforma;
  const fechadosHojeSource = platRaw ? `Fonte: ${platRaw.platform}` : "Fonte: plataforma";
  const operacaoResumo = `${m.totalAlertas} alertas no dia: ${m.fechados} resolvidos e ${m.emAberto} em aberto`;

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
        <div className="dg-ops-row">
          <div className="dg-card-sk" style={{ height: 220 }} />
          <div className="dg-card-sk" style={{ height: 180 }} />
          <div className="dg-card-sk" style={{ height: 260 }} />
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
    <div className="dg-mode-pleno dg-vibe-sobrio">
      {/* Saudação */}
      <div className="dg-greet">
        <div>
          <div className="dg-eyebrow">Painel operacional</div>
          <h1>Gestão à Vista</h1>
          <p className="dg-greet-summary">{operacaoResumo}</p>
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
            <span>SLA: {SLA_LIMIT_MIN} min</span>
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
          description="Resolvidos + fila aberta"
          value={m.totalAlertas}
          sub={`encerrados + em aberto · ${m.pctConcluido}% concluído`}
          source="Plataforma + planilha"
          compareValue={m.ONTEM?.total}
          progress={m.pctConcluido}
          onClick={() => setActiveKpi(activeKpi === "total" ? null : "total")}
          active={activeKpi === "total"}
          accent="var(--mednet-orange, #F26931)"
        />
        <KPI
          icon="ti-circle-check"
          label="Resolvidos hoje"
          description="Finalizados na plataforma"
          value={fechadosHojeValue}
          sub={platRaw
            ? `eventos processados · ${platRaw.platform}`
            : `${m.pctConcluidoPlataforma}% do volume · plataforma`}
          source={fechadosHojeSource}
          compareValue={m.ONTEM?.fechados}
          accent="var(--success-500)"
          progress={platRaw ? null : m.pctConcluidoPlataforma}
        />
        <KPI
          icon="ti-clock-hour-4"
          label="Em aberto agora"
          description="Motoristas aguardando ação"
          value={m.emAberto}
          sub={
            m.slaVencidos > 0
              ? `${m.slaVencidos} vencido${m.slaVencidos > 1 ? "s" : ""} · ${m.criticos.length} críticos`
              : `${m.criticos.length} em estado crítico`
          }
          source="Fila atual"
          compareValue={m.ONTEM?.emAberto}
          accent="var(--warning-500)"
          pulse={m.slaVencidos > 0}
          onClick={() => setActiveKpi(activeKpi === "aberto" ? null : "aberto")}
          active={activeKpi === "aberto"}
        />
        <KPI
          icon="ti-headset"
          label="Intervenções realizadas"
          description="Atendimentos registrados"
          value={m.intervencoesRegistradas}
          sub={`${m.sheetSolicitadasHoje} solicitadas · ${m.encerradosPlataforma} plataforma · ${m.sheetIntervencoesHoje} planilha`}
          source="Equipe + planilha"
          accent="var(--info-500, #2A8DD9)"
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
          sub={`Motoristas gravíssimos aguardando há mais de ${SLA_LIMIT_MIN} minutos.`}
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

      {/* Visão de tratamento de alertas (planilha) */}
      {m.sheetTMA && (
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
          onRefresh={() => !sheetHistory.loading && sheetHistory.load(buildMesesLookback(3))}
          syncing={sheetHistory.loading}
        />
      )}

      {/* Seção: Pulso da operação */}
      <Section icon="ti-radio" label="Pulso da operação" />

      <div className="dg-ops-row">
        <CriticalSLA criticos={m.criticos} slaLimit={SLA_LIMIT_MIN} />
        {m.tecnicos.length > 0 && (
          deferRest ? (
            <div className="dg-card-sk" style={{ height: 140 }} />
          ) : (
            <TechAlerts tecnicos={m.tecnicos} />
          )
        )}
        {deferRest ? (
          <div className="dg-card-sk" style={{ height: 320 }} />
        ) : (
          <TransportadoraRanking
            transportadoras={m.transpStats.slice(0, 6)}
          />
        )}
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
