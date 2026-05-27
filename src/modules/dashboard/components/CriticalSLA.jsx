import React, { useState } from 'react';
import { iniciais } from '../../../utils';
import PlatformBadge from '../../PlatformBadge';

const PAGE_SIZE = 10;

// Modo gestão: SEM botões operacionais. Linhas expansíveis pra ver detalhes
// (eventos, frota, turno, última intervenção).
export function CriticalSLA({ criticos, slaLimit = 30 }) {
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(0);

  const overdue = criticos.filter(c => c.abertoMin > slaLimit).length;
  const reincidentes = criticos.filter(c => c.reincidente).length;
  const totalPages = Math.max(1, Math.ceil(criticos.length / PAGE_SIZE));
  const paginated = criticos.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const goTo = (p) => {
    setPage(p);
    setExpanded(null);
  };

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
        {paginated.map((c, idx) => {
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
                    <PlatformBadge platformId={c.platformId} />
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

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
            style={{ padding: '3px 10px' }}
          >
            <i className="ti ti-chevron-left"></i>
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 90, textAlign: 'center' }}>
            {page + 1} / {totalPages} &nbsp;·&nbsp; {criticos.length} motoristas
          </span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages - 1}
            style={{ padding: '3px 10px' }}
          >
            <i className="ti ti-chevron-right"></i>
          </button>
        </div>
      )}
    </div>
  );
}
