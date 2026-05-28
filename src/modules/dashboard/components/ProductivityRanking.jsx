import { useState } from 'react';
import { iniciais } from '../../../utils';
import { COLORS } from './_shared';

export function ProductivityRanking({ equipe }) {
  const [showAll, setShowAll] = useState(false);
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
  const visibleEquipe = showAll ? enriched : enriched.slice(0, 10);

  return (
    <div className="dg-card dg-card-productivity">
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
        {enriched.length === 0 ? (
          <div style={{ display: 'grid', placeItems: 'center', height: 120, color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhum atendimento realizado hoje
          </div>
        ) : (
          visibleEquipe.map((op, idx) => {
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
            const qIcon  = quality === 'fast' ? 'ti-refresh'
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
          })
        )}
      </div>

      {enriched.length > 10 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
          <button
            className="dg-btn dg-btn-ghost"
            onClick={() => setShowAll(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12.5 }}
          >
            {showAll ? (
              <>
                Ver menos <i className="ti ti-chevron-up"></i>
              </>
            ) : (
              <>
                Ver todos os {enriched.length} operadores <i className="ti ti-chevron-down"></i>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
