import { iniciais } from '../../utils';
import { sevClass, TiposBadge, ElapsedTimer } from './utils';
import PlatformBadge from '../PlatformBadge';

export default function DriverCard({ d, type, handlers, daysSince, sheetsEntry, expanded, onToggleExpand }) {
  const sev = sevClass(d);
  const sevKey = type === 'tecnicos' ? 'tech' : sev;
  const isGravissimo = d.severidade === 'Gravíssimo';
  const bucket = type === 'intervencao' ? 'intervencao' : type === 'reportar' ? 'reportar' : 'tecnico';
  const sevIcon = d.severidade === 'Gravíssimo' ? 'ti-alert-triangle' : d.severidade === 'Grave' ? 'ti-alert-circle' : 'ti-info-circle';
  const eventosDoBucket = (d.eventosDetalhados || []).filter(e => e.bucket === bucket);

  return (
    <div className={`driver-item sev-${sevKey}${isGravissimo && type === 'intervencao' ? ' is-gravissimo' : ''}`}>

      {/* Avatar */}
      <div className={`d-avatar ${sevKey}`}>
        {iniciais(d.nome)}
      </div>

      {/* Info block */}
      <div className="d-info">

        {/* Identidade: nome + plataforma + SLA */}
        <div className="d-toprow">
          <span className="d-name-text">{d.nome}</span>
          <PlatformBadge platformId={d._platformId} />
          {type !== 'tecnicos' && d.slaAgeMin > 0 && (
            <span
              className={`badge badge-${d.slaBreached ? 'danger' : 'warning'}`}
              title={d.slaBreached ? `SLA estourado: aberto há ${Math.floor(d.slaAgeMin)} minutos` : `SLA em andamento: aberto há ${Math.floor(d.slaAgeMin)} minutos`}
            >
              <i className={`ti ti-${d.slaBreached ? 'clock-exclamation' : 'clock'}`}></i>
              SLA {Math.floor(d.slaAgeMin)}m
            </span>
          )}
        </div>

        {/* Placa · Transportadora · Turno */}
        <div className="d-detail">
          <span><i className="ti ti-license"></i> {d.placa}</span>
          <span className="sep">·</span>
          <span><i className="ti ti-building"></i> {d.transportadora}</span>
          <span className="sep">·</span>
          <span>
            <i className="ti ti-sun" style={{ color: d.turno === 'diurno' ? 'var(--warning-500)' : 'var(--accent-400)' }}></i>
            {d.turno === 'diurno' ? 'Diurno' : 'Noturno'}
          </span>
        </div>

        {/* Status chips */}
        <div className="d-badges">
          {type !== 'tecnicos' && (
            <span className={`badge badge-${sev}`}>
              <i className={`ti ${sevIcon}`}></i>
              {type === 'intervencao' ? d.alertas : d.reportaveis}
              {((type === 'intervencao' ? d.alertas : d.reportaveis) === 1) ? ' evento' : ' eventos'} · {d.severidade}
            </span>
          )}

          {type === 'tecnicos' && (
            <span className="badge badge-info">
              <i className="ti ti-camera-off"></i>
              {d.tecnicos} {d.tecnicos === 1 ? 'evento' : 'eventos'} técnico(s)
            </span>
          )}

          <TiposBadge tipos={type === 'intervencao' ? d.tipos : type === 'reportar' ? d.tiposReportar : null} />

          {daysSince !== undefined && (
            <span
              className={`badge badge-${daysSince < 7 ? 'danger' : 'warning'}`}
              title={`Último atendimento: há ${daysSince} dia(s)`}
            >
              <i className="ti ti-repeat"></i>
              Reincidente {daysSince === 0 ? 'hoje' : `há ${daysSince}d`}
            </span>
          )}

          {sheetsEntry && (() => {
            const done = Boolean(sheetsEntry.realizadoPor?.trim());
            const tip  = [
              `Planilha · ${sheetsEntry.data}`,
              sheetsEntry.solicitadoPor && `Solicitado por ${sheetsEntry.solicitadoPor}`,
              done ? `Realizado por ${sheetsEntry.realizadoPor}` : 'Realização pendente',
              sheetsEntry.horaSolicitacao && `às ${sheetsEntry.horaSolicitacao}`,
            ].filter(Boolean).join(' · ');
            return (
              <span className={`badge badge-${done ? 'success' : 'warning'}`} title={tip}>
                <i className="ti ti-table-column"></i>
                Planilha · {sheetsEntry.data}
                {done ? ' · Realizado' : ' · Pendente'}
              </span>
            );
          })()}

          <ElapsedTimer since={d._loadedAt} />

          {type === 'intervencao' && d.ultimoEvento && (
            <span className="d-chip">
              <i className="ti ti-clock-hour-4"></i>
              {new Date(d.ultimoEvento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {type === 'reportar' && d.ultimoEventoReportar && (
            <span className="d-chip">
              <i className="ti ti-clock-hour-4"></i>
              {new Date(d.ultimoEventoReportar).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {/* Toggle Timeline */}
          {eventosDoBucket.length > 0 && (
            <button
              className={`d-chip d-chip-toggle${expanded ? ' active' : ''}`}
              onClick={onToggleExpand}
              title={expanded ? 'Recolher detalhes' : 'Expandir detalhes'}
            >
              <i className={`ti ti-${expanded ? 'chevron-up' : 'chevron-down'}`}></i>
              {expanded ? 'Ocultar' : `Eventos (${eventosDoBucket.length})`}
            </button>
          )}
        </div>

        {type === 'tecnicos' && d.tiposTecnico && Object.keys(d.tiposTecnico).length > 0 && (
          <div className="d-subline">
            {Object.entries(d.tiposTecnico).map(([tipo, cnt], i, arr) => (
              <span key={tipo}>{cnt} {tipo}{i < arr.length - 1 ? ' + ' : ''}</span>
            ))}
          </div>
        )}

        {type === 'intervencao' && d.reportaveis > 0 && (
          <div className="d-subline">
            + {d.reportaveis} evento(s) reportável(is): {d.tiposReportar?.join(', ')}
          </div>
        )}
      </div>

      {/* Actions block */}
      <div className="d-actions">
        {type === 'intervencao' && (
          <>
            <button className="btn btn-sm" onClick={() => handlers.openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
            <button className="btn btn-sm btn-wa" onClick={() => handlers.openWhatsappChat?.(d)} title="Conversar com o Motorista"><i className="ti ti-brand-whatsapp"></i> Motorista</button>
            <button className="btn btn-sm btn-carrier" onClick={() => handlers.openWhatsappCarrier?.(d)} title="Conversar com a Transportadora"><i className="ti ti-building"></i> Transp.</button>
            <button className="btn btn-sm btn-primary" onClick={() => handlers.attend(d)}><i className="ti ti-phone-call"></i> Inserir na planilha</button>
            <button className="btn btn-sm btn-danger btn-icon-only" title="Descartar alerta" onClick={() => handlers.deleteAlert(d, 'intervencao')}><i className="ti ti-trash"></i></button>
          </>
        )}

        {type === 'reportar' && (
          <>
            <button className="btn btn-sm" onClick={() => handlers.openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
            <button className="btn btn-sm btn-wa" onClick={() => handlers.openWhatsappChat?.(d)} title="Conversar com o Motorista"><i className="ti ti-brand-whatsapp"></i> Motorista</button>
            <button className="btn btn-sm btn-carrier" onClick={() => handlers.openWhatsappCarrier?.(d)} title="Conversar com a Transportadora"><i className="ti ti-building"></i> Transp.</button>
            <button className="btn btn-sm btn-warning" onClick={() => handlers.reportar(d)}><i className="ti ti-building"></i> Reportar e Remover</button>
            <button className="btn btn-sm btn-danger btn-icon-only" title="Descartar alerta" onClick={() => handlers.deleteAlert(d, 'reportar')}><i className="ti ti-trash"></i></button>
          </>
        )}

        {type === 'tecnicos' && (
          <button className="btn btn-sm btn-danger btn-icon-only" title="Descartar" onClick={() => handlers.deleteAlert(d, 'tecnico')}>
            <i className="ti ti-trash"></i>
          </button>
        )}
      </div>

      {/* Expanded Timeline details */}
      {expanded && eventosDoBucket.length > 0 && (
        <div className="d-timeline-expand">
          <div className="d-timeline">
            {eventosDoBucket
              .slice()
              .sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0))
              .map((e, idx) => {
                const dateStr = e.ts ? new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
                const sevColor = e.severidade === 'Gravíssimo' ? 'var(--danger-500)' : e.severidade === 'Grave' ? 'var(--warning-500)' : 'var(--text-muted)';
                return (
                  <div key={idx} className="d-timeline-row">
                    <span className="d-timeline-time">{dateStr}</span>
                    <span className="d-timeline-dot" style={{ background: sevColor }}></span>
                    <span className="d-timeline-type">{e.tipo}</span>
                    <span className="d-timeline-sev" style={{ color: sevColor, background: `color-mix(in srgb, ${sevColor} 14%, transparent)` }}>{e.severidade}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

    </div>
  );
}
