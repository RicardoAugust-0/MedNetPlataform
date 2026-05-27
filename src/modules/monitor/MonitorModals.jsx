import { useState } from 'react';
import { createPortal } from 'react-dom';

const DISCARD_REASONS = [
  'Falso positivo',
  'Motorista já contatado',
  'Câmera com falha técnica',
  'Evento fora do padrão de análise',
  'Outro',
];

export default function MonitorModals({
  templateModal,
  setTemplateModal,
  templates,
  applyTemplate,
  onNavigateToTemplates,
  dossieDriver,
  setDossieDriver,
  dossieLoading,
  dossieData,
  discardModal,
  setDiscardModal,
  onDiscardConfirm,
}) {
  const [reason, setReason] = useState(DISCARD_REASONS[0]);

  return (
    <>
      {/* Template Modal */}
      {templateModal && createPortal(
        <div className="modal-overlay open" onClick={() => setTemplateModal(null)}>
          <div className="modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)' }}>
                  <i className="ti ti-message-2" style={{ marginRight:8, color:'var(--accent-500)' }}></i>
                  Contato WhatsApp
                </div>
                <div style={{ fontSize:13, color:'var(--text-muted)' }}>{templateModal.driver?.nome}</div>
              </div>
              <button className="btn-icon" onClick={() => setTemplateModal(null)}><i className="ti ti-x"></i></button>
            </div>

            {templateModal.text !== null ? (
              <>
                <div className="form-group">
                  <label className="form-label">Modelo</label>
                  <select
                    className="form-control"
                    value={templateModal.templateId || ''}
                    onChange={e => {
                      const t = templates.find(x => x.id === e.target.value);
                      if (t) {
                        setTemplateModal(prev => ({
                          ...prev,
                          templateId: t.id,
                          text: applyTemplate(t.text, prev.driver)
                        }));
                      }
                    }}
                  >
                    {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">Mensagem (Editável)</label>
                  <textarea
                    value={templateModal.text || ''}
                    onChange={e => setTemplateModal(prev => ({ ...prev, text: e.target.value }))}
                    className="form-control"
                    style={{ minHeight: 160 }}
                  />
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
                  <button className="btn" onClick={() => setTemplateModal(null)}>Fechar</button>
                  <button className="btn btn-primary" onClick={() => { navigator.clipboard?.writeText(templateModal.text); setTemplateModal(null); }}>
                    <i className="ti ti-copy"></i> Copiar e fechar
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <i className="ti ti-message-off"></i>
                Nenhum template de contato cadastrado.
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-sm btn-ghost" style={{ textDecoration:'underline' }}
                    onClick={() => { setTemplateModal(null); onNavigateToTemplates?.(); }}>
                    Criar um agora
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Dossiê Modal */}
      {dossieDriver && createPortal(
        <div className="modal-overlay open" onClick={() => setDossieDriver(null)}>
          <div className="modal" style={{ width: 500, padding: 24 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <i className="ti ti-steering-wheel" style={{ marginRight: 8, color: 'var(--accent-500)' }}></i>
                  Dossiê do Motorista
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{dossieDriver}</div>
              </div>
              <button className="btn-icon" onClick={() => setDossieDriver(null)}>
                <i className="ti ti-x"></i>
              </button>
            </div>

            {dossieLoading ? (
              <div className="empty-state" style={{ minHeight: 200 }}><i className="ti ti-loader-2 ti-spin"></i> Buscando histórico...</div>
            ) : dossieData.length === 0 ? (
              <div className="empty-state" style={{ minHeight: 200 }}><i className="ti ti-history"></i> Nenhum evento encontrado para este motorista.</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto', paddingRight: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {dossieData.map(item => (
                    <div key={item.id} style={{ display: 'flex', gap: 12, borderLeft: `2px solid var(--${item.tipo === 'intervencao' ? 'danger' : item.tipo === 'reportar' ? 'warning' : 'border-md'})`, paddingLeft: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          <span className={`badge badge-${item.tipo === 'intervencao' ? 'danger' : item.tipo === 'reportar' ? 'warning' : 'info'}`} style={{ marginRight: 8, fontSize: 9.5 }}>{item.tipo.toUpperCase()}</span>
                          {new Date(item.created_at).toLocaleDateString('pt-BR')} às {item.hora}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {item.obs}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                          Operador: {item.operador}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Discard Reason Modal */}
      {discardModal && createPortal(
        <div className="modal-overlay open" onClick={() => setDiscardModal(null)}>
          <div className="modal" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <i className="ti ti-trash" style={{ marginRight: 8, color: 'var(--danger-500)' }}></i>
                  Descartar alerta
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{discardModal.driver.nome}</div>
              </div>
              <button className="btn-icon" onClick={() => setDiscardModal(null)}><i className="ti ti-x"></i></button>
            </div>
            <div className="form-group">
              <label className="form-label">Motivo do descarte</label>
              <select className="form-control" value={reason} onChange={e => setReason(e.target.value)}>
                {DISCARD_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn" onClick={() => setDiscardModal(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => { onDiscardConfirm(discardModal.driver, discardModal.tipo, reason); setReason(DISCARD_REASONS[0]); }}
              >
                <i className="ti ti-trash"></i> Descartar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
