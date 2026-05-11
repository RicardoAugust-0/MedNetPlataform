import { iniciais } from '../../utils';
import { sevClass, TiposBadge, ElapsedTimer } from './utils';

export default function DriverCard({ d, type, handlers }) {
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

          <ElapsedTimer since={d._loadedAt} />
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
        
        <TiposBadge tipos={type === 'intervencao' ? d.tipos : d.tiposReportar} />
        
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
            <button className="btn btn-sm" onClick={() => handlers.openDossie(d.nome)}><i className="ti ti-history"></i> Histórico</button>
            <button className="btn btn-sm" onClick={() => handlers.openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
            <button className="btn btn-sm btn-primary" onClick={() => handlers.attend(d)}><i className="ti ti-phone-call"></i> Inserir na planilha</button>
            <button className="btn btn-sm btn-danger btn-icon-only" title="Descartar alerta" onClick={() => handlers.deleteAlert(d, 'intervencao')}><i className="ti ti-trash"></i></button>
          </>
        )}

        {type === 'reportar' && (
          <>
            <button className="btn btn-sm" onClick={() => handlers.openDossie(d.nome)}><i className="ti ti-history"></i> Histórico</button>
            <button className="btn btn-sm" onClick={() => handlers.openTemplate(d)}><i className="ti ti-message-2"></i> Template</button>
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

    </div>
  );
}
