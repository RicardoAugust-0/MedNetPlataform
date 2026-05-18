import React, { useState, useEffect, useRef } from 'react';
import { iniciais } from '../../utils';

// ── Design colors ─────────────────────────────────────────────────────────────
const COLORS = {
  fadiga:       '#E24B4A',
  comportamento:'#E8A020',
  positivo:     '#2DA75A',
  posPositivo:  '#2A8DD9',
  aberto:       '#8A94A6',
};


// ─── AnimatedNumber ─────────────────────────────────────────────
export function AnimatedNumber({ value, duration = 700 }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef(null);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (raf.current) cancelAnimationFrame(raf.current);
    if (from === to) { setDisplay(to); return; }
    let start = null;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return display.toLocaleString('pt-BR');
}


// ─── KPI Card ───────────────────────────────────────────────────
export function KPI({ icon, label, value, sub, trend, trendDir, hero, accent, progress, pulse, onClick, active, compareValue, compareLabel = 'ontem', executive }) {
  // Calcula delta automaticamente quando compareValue é fornecido
  let autoTrend = trend;
  let autoTrendDir = trendDir;
  if (compareValue != null && value != null) {
    const delta = value - compareValue;
    const pct = compareValue !== 0 ? (delta / compareValue) * 100 : 0;
    const sign = delta > 0 ? '+' : '';
    autoTrend = `${sign}${pct.toFixed(0)}%`;
    autoTrendDir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  }
  const trendIcon = autoTrendDir === 'up' ? 'ti-trending-up'
                  : autoTrendDir === 'down' ? 'ti-trending-down'
                  : autoTrendDir === 'warn' ? 'ti-alert-triangle'
                  : 'ti-equal';
  return (
    <div
      className={`dg-kpi${hero ? ' is-hero' : ''}${active ? ' is-active' : ''}${executive ? ' is-exec' : ''}`}
      onClick={onClick}
      style={accent && !hero ? { borderTop: `3px solid ${accent}` } : null}
    >
      <div className="dg-kpi-head">
        <div className="dg-kpi-ic" style={!hero && accent ? { color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)` } : null}>
          <i className={`ti ${icon}`}></i>
        </div>
        <div className="dg-kpi-label">{label}</div>
        {onClick && <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', fontSize: 14, color: hero ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}></i>}
      </div>
      <div className="dg-kpi-value">
        {pulse && <span className="pulse"></span>}
        <AnimatedNumber value={value} />
      </div>
      <div className="dg-kpi-foot">
        {autoTrend && <span className={`dg-kpi-trend ${autoTrendDir}`} title={compareValue != null ? `${compareLabel}: ${compareValue}` : null}><i className={`ti ${trendIcon}`}></i>{autoTrend}{compareValue != null ? ` vs ${compareLabel}` : ''}</span>}
        <span>{sub}</span>
      </div>
      {typeof progress === 'number' && (
        <div className="dg-kpi-bar"><span style={{ width: `${progress}%`, background: accent || '#fff' }}></span></div>
      )}
    </div>
  );
}

// ─── Filter Bar ─────────────────────────────────────────────────
export function FilterBar({ filters, setFilters, tipos: TIPOS, resultados: RESULTADOS, transportadoras: TRANSPORTADORAS_RAW, equipe: EQUIPE_LISTA, periodos: PERIODOS }) {
  // Build transportadoras list with name+total+abertos for chips
  const TRANSPORTADORAS = TRANSPORTADORAS_RAW.map(t => typeof t === 'string' ? { name: t, total: 0, abertos: 0 } : t);
  const toggleSet = (key, id) => {
    const set = new Set(filters[key]);
    set.has(id) ? set.delete(id) : set.add(id);
    setFilters({ ...filters, [key]: [...set] });
  };
  // Selecionar placeholder vazio "Outras…" volta pra "todas" (não zera o filtro)
  const setEmpresa = (e) => setFilters({ ...filters, empresa: e.target.value || 'todas' });
  const toggleEmpresa = (name) =>
    setFilters({ ...filters, empresa: filters.empresa === name ? 'todas' : name });
  const setPeriodo = (id) => setFilters({ ...filters, periodo: id });
  const reset = () => setFilters({ tipo: [], resultado: [], empresa: 'todas', periodo: 'hoje', operador: 'todos' });

  const hasFilter = filters.tipo.length || filters.resultado.length || filters.empresa !== 'todas' || filters.operador !== 'todos' || filters.periodo !== 'hoje';

  return (
    <div className="dg-filters">
      <div className="dg-filter-group">
        <label><i className="ti ti-radar" style={{ fontSize: 11, marginRight: 3 }}></i>Tipo do alerta</label>
        <div className="dg-chip-row">
          {TIPOS.map(c => (
            <span
              key={c.id}
              className={`dg-chip${filters.tipo.includes(c.id) ? ' active' : ''}`}
              onClick={() => toggleSet('tipo', c.id)}
              style={filters.tipo.includes(c.id) ? { background: c.color, borderColor: c.color, boxShadow: `0 4px 12px ${c.color}40` } : null}
              title={c.hint}
            >
              <span className="dot" style={{ background: c.color }}></span>
              {c.label}
              <span className="count">{c.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="dg-filter-divider"></div>

      <div className="dg-filter-group">
        <label><i className="ti ti-checks" style={{ fontSize: 11, marginRight: 3 }}></i>Resultado</label>
        <div className="dg-chip-row">
          {RESULTADOS.map(c => (
            <span
              key={c.id}
              className={`dg-chip${filters.resultado.includes(c.id) ? ' active' : ''}`}
              onClick={() => toggleSet('resultado', c.id)}
              style={filters.resultado.includes(c.id) ? { background: c.color, borderColor: c.color, boxShadow: `0 4px 12px ${c.color}40` } : null}
              title={c.hint}
            >
              {c.id === 'pos-positivo' && <i className="ti ti-refresh" style={{ fontSize: 11 }}></i>}
              <span className="dot" style={{ background: c.color }}></span>
              {c.label}
              <span className="count">{c.count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="dg-filter-divider"></div>

      <div className="dg-filter-group" style={{ flex: '1 1 auto', minWidth: 0 }}>
        <label>Empresa</label>
        <div className="dg-chip-row" style={{ alignItems: 'center' }}>
          <span
            className={`dg-chip${filters.empresa === 'todas' ? ' active' : ''}`}
            onClick={() => setFilters({ ...filters, empresa: 'todas' })}
          >Todas</span>
          {TRANSPORTADORAS.slice(0, 6).map(t => (
            <span
              key={t.name}
              className={`dg-chip${filters.empresa === t.name ? ' active' : ''}`}
              onClick={() => toggleEmpresa(t.name)}
              title={`${t.total} alertas · ${t.abertos} em aberto · clique pra alternar`}
            >
              {t.name.split(' ')[0]}
              <span className="count">{t.total}</span>
            </span>
          ))}
          {TRANSPORTADORAS.length > 6 && (
            <select
              className="dg-select"
              value={TRANSPORTADORAS.slice(0, 6).find(t => t.name === filters.empresa) || filters.empresa === 'todas' ? '' : filters.empresa}
              onChange={setEmpresa}
              style={{ minWidth: 130 }}
            >
              <option value="">Outras…</option>
              {TRANSPORTADORAS.slice(6).map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="dg-filter-group">
        <label>Operador</label>
        <select className="dg-select" value={filters.operador} onChange={(e) => setFilters({ ...filters, operador: e.target.value })}>
          <option value="todos">Toda a equipe</option>
          {(EQUIPE_LISTA || []).map(op => <option key={op.nome} value={op.nome}>{op.nome}</option>)}
        </select>
      </div>

      <div className="dg-filter-divider"></div>

      <div className="dg-filter-group">
        <label>Período</label>
        <div className="dg-chip-row">
          {PERIODOS.map(p => (
            <span
              key={p.id}
              className={`dg-chip${filters.periodo === p.id ? ' active' : ''}`}
              onClick={() => setPeriodo(p.id)}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {hasFilter && (
        <button className="dg-filter-reset" onClick={reset}>
          <i className="ti ti-x"></i> Limpar filtros
        </button>
      )}
    </div>
  );
}

// ─── Productivity ranking ───────────────────────────────────────
// Mostra: por operador, tipo (fadiga/comportamento) × resultado (positivo/pos-positivo).
// Destaque para TAXA DE REINCIDÊNCIA (pós-positivos / total) — sinal de qualidade.
export function ProductivityRanking({ equipe }) {
  const C = COLORS;
  const enriched = equipe.map(op => {
    const t = op.tratados;
    const pos = t.fadigaPos + t.compPos;
    const pp  = t.fadigaPP + t.compPP;
    const total = pos + pp;
    const reincidencia = total > 0 ? (pp / total) * 100 : 0;
    return { ...op, total, pos, pp, reincidencia };
  }).sort((a, b) => b.total - a.total);
  const max = Math.max(...enriched.map(o => o.total), 1);
  const grand = enriched.reduce((s, o) => s + o.total, 0);
  const grandPP = enriched.reduce((s, o) => s + o.pp, 0);
  const avgReinc = grand > 0 ? (grandPP / grand) * 100 : 0;

  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'var(--success-bg)', color: 'var(--success-500)' }}><i className="ti ti-trophy"></i></div>
        <h3>Produtividade da equipe</h3>
        <span className="sub">· volume × qualidade · hoje</span>
        <div className="right">
          <span className="pillc">{grand} tratados</span>
          <span className="pillc" title="Taxa média de reincidência da equipe">
            <i className="ti ti-refresh" style={{ fontSize: 10, marginRight: 3 }}></i>
            {avgReinc.toFixed(0)}% reinc.
          </span>
        </div>
      </div>
      <div className="dg-legend">
        <span className="dg-legend-item"><span className="sw" style={{ background: C.fadiga }}></span>Fadiga</span>
        <span className="dg-legend-item"><span className="sw" style={{ background: C.comportamento }}></span>Comportamento</span>
        <span className="dg-legend-item" style={{ marginLeft: 'auto' }}>
          <i className="ti ti-refresh" style={{ fontSize: 11, color: C.posPositivo }}></i>
          <span style={{ color: 'var(--text-muted)' }}>Hachura = pós-positivo (reincidente)</span>
        </span>
      </div>
      <div className="dg-rank">
        {enriched.map((op, idx) => {
          const t = op.tratados;
          const tier = idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : '';
          const pct = (op.total / max) * 100;
          // Quality flag based on reincidência rate (tempoMedio not tracked in real data)
          const tm = op.tempoMedio;
          const tmMinutes = tm ? parseInt(tm.split('m')[0], 10) : null;
          const isHighReinc = op.reincidencia > 35;
          const isLowReinc  = op.reincidencia < 12;
          const quality = isHighReinc           ? 'fast'
                        : isLowReinc            ? 'balanced'
                        : tmMinutes != null && tmMinutes > 5 ? 'slow'
                        : 'balanced';
          const qLabel = quality === 'fast' ? 'Reinc. alta'
                       : quality === 'slow' ? 'Tempo alto'
                       : 'Equilíbrio';
          const qIcon  = quality === 'fast' ? 'ti-alert-triangle'
                       : quality === 'slow' ? 'ti-hourglass'
                       : 'ti-check';
          // Segments: fadigaPos, fadigaPP, compPos, compPP
          const segs = [
            { val: t.fadigaPos, color: C.fadiga,        pp: false },
            { val: t.fadigaPP,  color: C.fadiga,        pp: true  },
            { val: t.compPos,   color: C.comportamento, pp: false },
            { val: t.compPP,    color: C.comportamento, pp: true  },
          ];
          return (
            <div key={op.nome} className={`dg-rank-row ${tier}`}>
              <div className="dg-rank-pos">{idx + 1}</div>
              <div className="dg-rank-who">
                <div className="dg-rank-name">
                  <span className="av" style={{ background: op.avatarColor }}>{iniciais(op.nome)}</span>
                  {op.nome}
                  <span className={`dg-quality ${quality}`} title={`${op.reincidencia.toFixed(0)}% pós-positivos${op.tempoMedio ? ` · ${op.tempoMedio} médio` : ''}`}>
                    <i className={`ti ${qIcon}`}></i>
                    {qLabel}
                  </span>
                </div>
                <div className="dg-rank-meta">
                  {t.fadigaPos > 0 && <span className="seg"><span className="sw" style={{ background: C.fadiga }}></span>{t.fadigaPos} fadiga</span>}
                  {t.compPos  > 0 && <span className="seg"><span className="sw" style={{ background: C.comportamento }}></span>{t.compPos} comport.</span>}
                  {op.pp > 0 && <span className="seg" style={{ color: C.posPositivo, fontWeight: 600 }}><i className="ti ti-refresh" style={{ fontSize: 10 }}></i>{op.pp} pós-positivo</span>}
                  {op.tempoMedio && <span className="seg" style={{ color: 'var(--text-secondary)' }}><i className="ti ti-clock" style={{ fontSize: 11 }}></i>{op.tempoMedio}</span>}
                </div>
              </div>
              <div className="dg-rank-bar">
                <div className="dg-rank-stack" style={{ width: `${pct}%` }}>
                  {segs.map((s, i) => (
                    <span key={i}
                      style={{
                        width: op.total > 0 ? `${(s.val / op.total) * 100}%` : '0%',
                        background: s.pp
                          ? `repeating-linear-gradient(45deg, ${s.color} 0 4px, ${C.posPositivo} 4px 8px)`
                          : s.color,
                        opacity: s.pp ? 0.95 : 1,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="dg-rank-count">
                {op.total}
                <span className="pct">
                  <span style={{ color: op.reincidencia > 30 ? C.posPositivo : 'var(--text-muted)' }}>
                    {op.reincidencia.toFixed(0)}% pp
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Critical drivers / SLA ─────────────────────────────────────
// Modo gestão: SEM botões operacionais. Linhas expansíveis pra ver detalhes
// (eventos, frota, turno, última intervenção).
export function CriticalSLA({ criticos, slaLimit = 30 }) {
  const [expanded, setExpanded] = useState(null);
  const overdue = criticos.filter(c => c.abertoMin > slaLimit).length;
  const reincidentes = criticos.filter(c => c.reincidente).length;

  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(226, 75, 74, 0.14)', color: 'var(--danger-500)' }}><i className="ti ti-alert-triangle"></i></div>
        <h3>Críticos & SLA</h3>
        <span className="sub">· tempo desde abertura</span>
        <div className="right">
          {reincidentes > 0 && <span className="pillc" style={{ background: 'rgba(42, 141, 217, 0.18)', color: 'var(--info-500)' }}><i className="ti ti-refresh" style={{ fontSize: 11, marginRight: 4 }}></i>{reincidentes} reincidentes</span>}
          {overdue > 0 && <span className="pillc" style={{ background: 'rgba(226, 75, 74, 0.18)', color: 'var(--danger-500)' }}><i className="ti ti-clock-exclamation" style={{ fontSize: 11, marginRight: 4 }}></i>{overdue} vencidos</span>}
          <span className="pillc">{criticos.length} ativos</span>
        </div>
      </div>
      <div className="dg-critical">
        {criticos.map((c, idx) => {
          const t = c.abertoMin;
          const cls = t > slaLimit ? 'danger' : t > slaLimit * 0.7 ? 'warn' : '';
          const mm = String(Math.floor(t)).padStart(2, '0');
          const ss = String((t * 60) % 60 | 0).padStart(2, '0');
          const tipoInfo = { fadiga: { label: 'Fadiga' }, comportamento: { label: 'Comportamento' } }[c.tipo] || { label: c.tipo };
          const isExp = expanded === c.placa;
          return (
            <React.Fragment key={c.placa}>
              <div
                className={`dg-crit-row ${t > slaLimit ? 'is-overdue' : ''} ${isExp ? 'is-expanded' : ''} fade-stagger`}
                style={{ animationDelay: `${idx * 50}ms` }}
                onClick={() => setExpanded(isExp ? null : c.placa)}
              >
                <div className="dg-crit-av">{iniciais(c.nome)}</div>
                <div className="dg-crit-info">
                  <div className="dg-crit-name">
                    {c.nome}
                    <span className={`dg-crit-tag ${c.tipo}`}>{tipoInfo?.label}</span>
                    {c.reincidente && (
                      <span className="dg-crit-tag" style={{ background: 'rgba(42, 141, 217, 0.18)', color: 'var(--info-500)' }} title={`Última intervenção há ${c.ultimaIntervencao}`}>
                        <i className="ti ti-refresh" style={{ fontSize: 10 }}></i> Reincidente {c.ultimaIntervencao && `· ${c.ultimaIntervencao}`}
                      </span>
                    )}
                  </div>
                  <div className="dg-crit-meta">
                    <span>{c.placa}</span>
                    {c.frota && (<><span className="sep">·</span><span>Frota {c.frota}</span></>)}
                    <span className="sep">·</span>
                    <span>{c.transportadora}</span>
                    <span className="sep">·</span>
                    <span style={{ color: 'var(--danger-500)', fontWeight: 600 }}><i className="ti ti-flame" style={{ fontSize: 11 }}></i> {c.alertas} alertas</span>
                  </div>
                </div>
                <div className="dg-sla">
                  <span className={`dg-sla-time ${cls}`}>{mm}:{ss}</span>
                  <span className="dg-sla-label">{t > slaLimit ? 'SLA vencido' : 'em aberto'}</span>
                </div>
                <i className={`ti ti-chevron-${isExp ? 'up' : 'down'} dg-crit-chevron`}></i>
              </div>

              {isExp && c.eventos?.length > 0 && (
                <div className="dg-crit-detail">
                  <div className="dg-crit-detail-head">
                    <span className="dg-crit-detail-label"><i className="ti ti-list-details" style={{ fontSize: 11 }}></i> Linha do tempo · {c.eventos.length} alertas na fila</span>
                    <span className="dg-crit-detail-sub">Turno {c.turno} · primeiro alerta às {c.eventos[0]?.hora}</span>
                  </div>
                  <div className="dg-crit-timeline">
                    {c.eventos.map((e, i) => {
                      const sev = e.severidade || e.sev;
                      const sevColor = sev === 'Gravíssimo' ? 'var(--danger-500)' : 'var(--warning-500)';
                      return (
                        <div key={i} className="dg-crit-evt">
                          <span className="dg-crit-evt-hora">{e.hora}</span>
                          <span className="dg-crit-evt-dot" style={{ background: sevColor }}></span>
                          <span className="dg-crit-evt-tipo">{e.tipo}</span>
                          <span className="dg-crit-evt-sev" style={{ color: sevColor }}>{sev}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tech alerts ────────────────────────────────────────────────
// Alertas técnicos: câmera obstruída, perda de vídeo, sem motorista.
// Não geram intervenção mas precisam ser reportados às transportadoras.
export function TechAlerts({ tecnicos }) {
  const total = tecnicos.reduce((s, t) => s + t.count, 0);
  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(42, 141, 217, 0.14)', color: 'var(--info-500)' }}><i className="ti ti-tools"></i></div>
        <h3>Atenção técnica</h3>
        <span className="sub">· requer reporte à transportadora</span>
        <div className="right">
          <span className="pillc">{total} ocorrências</span>
        </div>
      </div>
      <div className="dg-tech">
        {tecnicos.map(t => (
          <div key={t.id} className="dg-tech-row">
            <div className="dg-tech-ic"><i className={`ti ${t.icon}`}></i></div>
            <div className="dg-tech-info">
              <div className="dg-tech-name">{t.label}</div>
              <div className="dg-tech-meta">
                {t.placas.slice(0, 3).join(' · ')}
                {t.placas.length > 3 && <span style={{ color: 'var(--text-muted)' }}> · +{t.placas.length - 3}</span>}
              </div>
            </div>
            <div className="dg-tech-count">{t.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Donut chart ─────────────────────────────────────────────────
function Donut({ items, total, size = 160, stroke = 22 }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const safeTotal = total > 0 ? total : 1;
  const segs = items.reduce((acc, it) => {
    const len = (it.count / safeTotal) * C;
    acc.list.push({ ...it, len, offset: acc.cursor });
    acc.cursor += len;
    return acc;
  }, { list: [], cursor: 0 }).list;
  return (
    <svg viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      {total > 0 && segs.map((s, i) => (
        <circle
          key={i}
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={s.color} strokeWidth={stroke}
          strokeDasharray={`${s.len} ${C - s.len}`}
          strokeDashoffset={-s.offset}
          strokeLinecap="butt"
          style={{ transition: 'stroke-dasharray 0.6s' }}
        />
      ))}
    </svg>
  );
}

// ─── Classification breakdown — duas dimensões: Tipo × Resultado ──
// Donut = TIPO (Fadiga vs Comportamento, vem da plataforma).
// Painel lateral = RESULTADO (Positivo, Pós-positivo, Em aberto) com
// destaque grande para a TAXA DE REINCIDÊNCIA — KPI de qualidade.
export function ClassificationBreakdown({ tipos, resultados }) {
  const C = COLORS;
  const totalTipo = tipos.reduce((s, c) => s + c.count, 0);
  const positivo = resultados.find(r => r.id === 'positivo')?.count || 0;
  const posPositivo = resultados.find(r => r.id === 'pos-positivo')?.count || 0;
  const aberto = resultados.find(r => r.id === 'aberto')?.count || 0;
  const tratados = positivo + posPositivo;
  const taxaReinc = tratados > 0 ? (posPositivo / tratados) * 100 : 0;

  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(158, 26, 69, 0.14)', color: 'var(--accent-500)' }}><i className="ti ti-chart-pie"></i></div>
        <h3>Tipo & Resultado</h3>
        <div className="right">
          <span className="pillc">{totalTipo} eventos</span>
        </div>
      </div>

      <div className="dg-class">
        <div className="dg-donut">
          <Donut items={tipos} total={totalTipo} />
          <div className="cap">
            <div>
              <div className="v">{totalTipo}</div>
              <div className="l">total dia</div>
            </div>
          </div>
        </div>
        <div className="dg-class-list">
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>
            Origem do alerta
          </div>
          {tipos.map(c => {
            const pct = totalTipo > 0 ? Math.round((c.count / totalTipo) * 100) : 0;
            return (
              <div key={c.id} className="dg-class-row">
                <span className="dg-class-sw" style={{ background: c.color }}></span>
                <span className="dg-class-nm">{c.label}</span>
                <span className="dg-class-vl">{c.count}</span>
                <span className="dg-class-pc">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Linha de resultado (destacada com fundo) */}
      <div style={{
        background: 'var(--surface-1)',
        borderTop: '1px solid var(--border)',
        padding: '14px 18px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 14,
        alignItems: 'stretch',
      }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
            <i className="ti ti-check" style={{ fontSize: 11, marginRight: 3 }}></i>Resultado
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div className="dg-class-row" style={{ gap: 6 }}>
              <span className="dg-class-sw" style={{ background: C.positivo }}></span>
              <span className="dg-class-nm" style={{ fontSize: 11.5 }}>Positivo</span>
              <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{positivo}</span>
            </div>
            <div className="dg-class-row" style={{ gap: 6 }}>
              <span className="dg-class-sw" style={{ background: C.posPositivo }}></span>
              <span className="dg-class-nm" style={{ fontSize: 11.5 }}>Pós-positivo <i className="ti ti-refresh" style={{ fontSize: 10, color: C.posPositivo }}></i></span>
              <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{posPositivo}</span>
            </div>
            <div className="dg-class-row" style={{ gap: 6 }}>
              <span className="dg-class-sw" style={{ background: C.aberto }}></span>
              <span className="dg-class-nm" style={{ fontSize: 11.5 }}>Em aberto</span>
              <span className="dg-class-vl" style={{ fontSize: 12.5 }}>{aberto}</span>
            </div>
          </div>
        </div>

        <div style={{
          gridColumn: 'span 2',
          borderLeft: '1px solid var(--border)',
          paddingLeft: 14,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <i className="ti ti-refresh" style={{ fontSize: 11, color: C.posPositivo }}></i>
            Taxa de reincidência
            <span style={{ marginLeft: 'auto', textTransform: 'none', fontWeight: 500, letterSpacing: 0, color: 'var(--text-muted)' }}>{posPositivo}/{tratados} tratados</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 32, fontWeight: 800, letterSpacing: '-1px',
              color: taxaReinc >= 25 ? C.posPositivo : 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}>{taxaReinc.toFixed(1)}%</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {taxaReinc >= 25 ? 'acima do esperado' : taxaReinc >= 15 ? 'dentro da faixa' : 'baixa — bom sinal'}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
            <span style={{ width: tratados > 0 ? `${(positivo/tratados)*100}%` : '0%', background: C.positivo }}></span>
            <span style={{ width: tratados > 0 ? `${(posPositivo/tratados)*100}%` : '0%', background: C.posPositivo }}></span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Pós-positivo = motorista voltou a gerar alerta APÓS intervenção já realizada. Indicador de qualidade do atendimento.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Transportadora ranking ─────────────────────────────────
export function TransportadoraRanking({ transportadoras }) {
  const max = Math.max(...transportadoras.map(t => t.total), 1);
  const totalAbertos = transportadoras.reduce((s, t) => s + t.abertos, 0);
  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(42, 141, 217, 0.14)', color: 'var(--info-500)' }}><i className="ti ti-building-community"></i></div>
        <h3>Transportadoras</h3>
        <span className="sub">· alertas no dia</span>
        <div className="right">
          <span className="pillc"><span style={{ color: 'var(--warning-500)', fontWeight: 700 }}>{totalAbertos}</span>&nbsp;em aberto</span>
        </div>
      </div>
      <div className="dg-trans">
        {transportadoras.map((t, i) => {
          const pct = (t.total / max) * 100;
          return (
            <div key={t.name} className="dg-trans-row">
              <span className="dg-trans-pos">#{i+1}</span>
              <div className="dg-trans-info">
                <div className="dg-trans-nm">{t.name}</div>
                <div className="dg-trans-bar"><span style={{ width: `${pct}%`, background: i === 0 ? 'var(--danger-500)' : i < 3 ? 'var(--warning-500)' : 'var(--accent-500)' }}></span></div>
              </div>
              <div className="dg-trans-mt">
                <span style={{ color: 'var(--warning-500)', fontWeight: 700 }}>{t.abertos}</span> aberto<br/>
                <span style={{ color: 'var(--info-500)', fontWeight: 600 }}><i className="ti ti-refresh" style={{ fontSize: 9 }}></i>{t.posPositivos}</span> reinc.
              </div>
              <span className="dg-trans-vl">{t.total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Hourly Activity ────────────────────────────────────────
export function HourlyActivity({ hourly, currentHour = 16 }) {
  const max = Math.max(...hourly.map(h => h.closed + h.open), 1);
  const totalClosed = hourly.reduce((s, h) => s + h.closed, 0);
  const totalOpen = hourly.reduce((s, h) => s + h.open, 0);
  return (
    <div className="dg-card">
      <div className="dg-card-head">
        <div className="ic" style={{ background: 'rgba(232, 160, 32, 0.14)', color: 'var(--warning-500)' }}><i className="ti ti-chart-bar"></i></div>
        <h3>Atividade por hora</h3>
        <span className="sub">· hoje</span>
        <div className="right">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span><span style={{ background: 'var(--accent-500)', width: 10, height: 10, borderRadius: 2, display: 'inline-block', marginRight: 4 }}></span>Fechados {totalClosed}</span>
            <span><span style={{ background: 'var(--warning-500)', width: 10, height: 10, borderRadius: 2, display: 'inline-block', marginRight: 4 }}></span>Em aberto {totalOpen}</span>
          </span>
        </div>
      </div>
      <div className="dg-hourly">
        <div className="dg-hourly-row">
          {hourly.map((h, i) => {
            const total = h.closed + h.open;
            const heightTotal = (total / max) * 100;
            const heightOpen = (h.open / Math.max(total, 1)) * heightTotal;
            const heightClosed = heightTotal - heightOpen;
            const hourNum = parseInt(h.h, 10);
            return (
              <div key={i} className={`dg-hour-bar ${hourNum === currentHour ? 'hour-now' : ''}`} title={`${h.h}: ${h.closed} fechados, ${h.open} abertos`}>
                <div className="dg-tip">{h.h} · {h.closed}f / {h.open}a</div>
                {h.open > 0 && <div className="seg seg-open" style={{ height: `${heightOpen}%`, minHeight: 2 }}></div>}
                {h.closed > 0 && <div className="seg seg-closed" style={{ height: `${heightClosed}%`, minHeight: 2 }}></div>}
              </div>
            );
          })}
        </div>
        <div className="dg-hour-axis">
          {hourly.map((h, i) => {
            const hr = parseInt(h.h, 10);
            // 24 barras: mostra só horas pares pra não poluir; <24 (14h) mostra todas
            const show = hourly.length < 24 || hr % 2 === 0;
            return <span key={i}>{show ? h.h.replace('h', '') : ''}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Banner ─────────────────────────────────────────
export function Banner({ tone = 'danger', icon, title, sub, action }) {
  return (
    <div className={`dg-banner ${tone === 'warn' ? 'warn' : ''}`}>
      <div className={`ic ${tone}`}><i className={`ti ${icon}`}></i></div>
      <div className="txt">
        <div className="ttl">{title}</div>
        <div className="sb">{sub}</div>
      </div>
      {action && <button className="dg-btn dg-btn-primary">{action} <i className="ti ti-arrow-right"></i></button>}
    </div>
  );
}

// ─── Section header ─────────────────────────────────
export function Section({ icon, label, right }) {
  return (
    <div className="dg-section">
      <span className="dg-section-lb"><i className={`ti ${icon}`}></i> {label}</span>
      <span className="dg-section-rule"></span>
      {right}
    </div>
  );
}
