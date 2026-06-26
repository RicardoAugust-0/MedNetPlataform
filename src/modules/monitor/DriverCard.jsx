import { iniciais } from '../../utils';
import { sevClass, TiposBadge, ElapsedTimer } from './utils';
import PlatformBadge from '../PlatformBadge';

export default function DriverCard({ d, type, handlers, daysSince, sheetsEntry, expanded, onToggleExpand }) {
  const sev = sevClass(d);
  const isGravissimo = d.severidade === 'Gravíssimo';

  return (
    <div className={`driver-item${isGravissimo && type === 'intervencao' ? ' is-gravissimo' : ''}`}>
      
      {/* Avatar */}
      <div className={`d-avatar ${type === 'tecnicos' ? 'tech' : sev}`}>
        {iniciais(d.nome)}
      </div>

      {/* Info block */}
      <div className="d-info">
        <div className="d-name">
          <span>{d.nome}</span>
          <PlatformBadge platformId={d._platformId} />

          {type !== 'tecnicos' && (
            <>
              <span className={`badge badge-${sev}`}>
                {type === 'intervencao' ? d.alertas : d.reportaveis} 
                {((type === 'intervencao' ? d.alertas : d.reportaveis) === 1) ? ' evento' : ' eventos'}
              </span>
              <span className={`badge badge-${sev}`} style={{ fontSize: 9.5 }}>{d.severidade}</span>
            </>
          )}

          {type === 'tecnicos' && (
            <span className="badge badge-info">{d.tecnicos} {d.tecnicos === 1 ? 'evento' : 'eventos'} técnico(s)</span>
          )}

          {/* SLA Badge */}
          {type !== 'tecnicos' && d.slaAgeMin > 0 && (
            <span
              className={`badge badge-${d.slaBreached ? 'danger' : 'warning'}`}
              title={d.slaBreached ? `SLA estourado: aberto há ${Math.floor(d.slaAgeMin)} minutos` : `SLA em andamento: aberto há ${Math.floor(d.slaAgeMin)} minutos`}
              style={{ fontSize: 9.5 }}
            >
              <i className={`ti ti-${d.slaBreached ? 'clock-exclamation' : 'clock'}`} style={{ marginRight: 2 }}></i>
              SLA {Math.floor(d.slaAgeMin)}m
            </span>
          )}

          <ElapsedTimer since={d._loadedAt} />

          {/* Toggle Timeline Button */}
          {d.eventosDetalhados && d.eventosDetalhados.length > 0 && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ padding: '2px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 2, height: 18 }}
              onClick={onToggleExpand}
              title={expanded ? "Recolher detalhes" : "Expandir detalhes"}
            >
              <i className={`ti ti-${expanded ? 'layout-navbar-collapse' : 'layout-navbar-expand'}`} style={{ fontSize: 10 }}></i>
              {expanded ? 'Ocultar' : `Eventos (${(d.eventosDetalhados || []).filter(e => e.bucket === (type === 'intervencao' ? 'intervencao' : type === 'reportar' ? 'reportar' : 'tecnico')).length})`}
            </button>
          )}

          {daysSince !== undefined && (
            <span
              className={`badge badge-${daysSince < 7 ? 'danger' : 'warning'}`}
              title={`Último atendimento: há ${daysSince} dia(s)`}
              style={{ fontSize: 9.5 }}
            >
              <i className="ti ti-repeat" style={{ marginRight: 2 }}></i>
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
              <span
                className={`badge badge-${done ? 'success' : 'warning'}`}
                title={tip}
                style={{ fontSize: 9.5 }}
              >
                <i className="ti ti-table-column" style={{ marginRight: 2 }}></i>
                Planilha · {sheetsEntry.data}
                {done ? ' · Realizado' : ' · Pendente'}
              </span>
            );
          })()}

          {type === 'intervencao' && d.ultimoEvento && (
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
              <i className="ti ti-clock-hour-4" style={{ fontSize: 9, marginRight: 2 }}></i>
              {new Date(d.ultimoEvento).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {type === 'reportar' && d.ultimoEventoReportar && (
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>
              <i className="ti ti-clock-hour-4" style={{ fontSize: 9, marginRight: 2 }}></i>
              {new Date(d.ultimoEventoReportar).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        
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
        
        <TiposBadge tipos={type === 'intervencao' ? d.tipos : type === 'reportar' ? d.tiposReportar : null} />

        {type === 'tecnicos' && d.tiposTecnico && Object.keys(d.tiposTecnico).length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {Object.entries(d.tiposTecnico).map(([tipo, cnt], i, arr) => (
              <span key={tipo}>{cnt} {tipo}{i < arr.length - 1 ? ' + ' : ''}</span>
            ))}
          </div>
        )}

        {type === 'intervencao' && d.reportaveis > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            + {d.reportaveis} evento(s) reportável(is): {d.tiposReportar?.join(', ')}
          </div>
        )}
      </div>

      {/* Actions block */}
      <div className="d-actions">
        {type === 'intervencao' && (
          <>
            <button className="btn btn-sm" onClick={() => handlers.openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
            <button className="btn btn-sm" style={{ background: '#1FA855', color: '#fff', borderColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => handlers.openWhatsappChat?.(d)} title="Conversar com o Motorista"><i className="ti ti-brand-whatsapp"></i> Motorista</button>
            <button className="btn btn-sm" style={{ background: 'var(--accent-500)', color: '#fff', borderColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => handlers.openWhatsappCarrier?.(d)} title="Conversar com a Transportadora"><i className="ti ti-building"></i> Transp.</button>
            <button className="btn btn-sm btn-primary" onClick={() => handlers.attend(d)}><i className="ti ti-phone-call"></i> Inserir na planilha</button>
            <button className="btn btn-sm btn-danger btn-icon-only" title="Descartar alerta" onClick={() => handlers.deleteAlert(d, 'intervencao')}><i className="ti ti-trash"></i></button>
          </>
        )}

        {type === 'reportar' && (
          <>
            <button className="btn btn-sm" onClick={() => handlers.openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
            <button className="btn btn-sm" style={{ background: '#1FA855', color: '#fff', borderColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => handlers.openWhatsappChat?.(d)} title="Conversar com o Motorista"><i className="ti ti-brand-whatsapp"></i> Motorista</button>
            <button className="btn btn-sm" style={{ background: 'var(--accent-500)', color: '#fff', borderColor: 'transparent', display: 'inline-flex', alignItems: 'center', gap: '4px' }} onClick={() => handlers.openWhatsappCarrier?.(d)} title="Conversar com a Transportadora"><i className="ti ti-building"></i> Transp.</button>
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
      {expanded && d.eventosDetalhados && d.eventosDetalhados.length > 0 && (
        <div className="d-timeline-expand">
          <div style={{ paddingLeft: 58, display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            {(d.eventosDetalhados || [])
              .filter(e => e.bucket === (type === 'intervencao' ? 'intervencao' : type === 'reportar' ? 'reportar' : 'tecnico'))
              .slice()
              .sort((a, b) => new Date(a.ts || 0) - new Date(b.ts || 0))
              .map((e, idx) => {
                const dateStr = e.ts ? new Date(e.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
                const sevColor = e.severidade === 'Gravíssimo' ? 'var(--danger-500)' : e.severidade === 'Grave' ? 'var(--warning-500)' : 'var(--text-muted)';
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
                    <span style={{ color: 'var(--text-muted)', width: 40, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-mono)' }}>{dateStr}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sevColor }}></span>
                    <span style={{ color: 'var(--text-primary)', flex: 1 }}>{e.tipo}</span>
                    <span style={{ color: sevColor, fontWeight: 600 }}>{e.severidade}</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

    </div>
  );
}
