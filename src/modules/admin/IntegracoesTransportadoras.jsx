// deno-lint-ignore-file
import { useState } from 'react';
import { useCarrierAliases } from '../../hooks/useCarrierAliases.js';
import { useToast } from '../../hooks/useToast.jsx';

// /admin/integracoes/transportadoras — regra de negócio operacional (de-para).
export default function IntegracoesTransportadoras() {
  const { aliases, setAliases } = useCarrierAliases();
  const toast = useToast();

  const [aliasMonitor, setAliasMonitor] = useState('');
  const [aliasSheet, setAliasSheet]     = useState('');
  const [editingAliasKey, setEditingAliasKey] = useState(null);
  const [editAliasMonitor, setEditAliasMonitor] = useState('');
  const [editAliasSheet, setEditAliasSheet] = useState('');

  const addAlias = async () => {
    const m = aliasMonitor.trim();
    const s = aliasSheet.trim();
    if (!m || !s) return;
    await setAliases({ ...aliases, [m]: s });
    setAliasMonitor('');
    setAliasSheet('');
    toast('Mapeamento adicionado', 'success');
  };

  const removeAlias = async (key) => {
    const next = { ...aliases };
    delete next[key];
    await setAliases(next);
    toast('Mapeamento removido', 'info');
  };

  const startEditAlias = (monitor, sheet) => {
    setEditingAliasKey(monitor);
    setEditAliasMonitor(monitor);
    setEditAliasSheet(sheet);
  };

  const cancelEditAlias = () => {
    setEditingAliasKey(null);
    setEditAliasMonitor('');
    setEditAliasSheet('');
  };

  const saveEditAlias = async () => {
    const m = editAliasMonitor.trim();
    const s = editAliasSheet.trim();
    if (!m || !s) return;

    const next = { ...aliases };
    if (editingAliasKey !== m) {
      delete next[editingAliasKey];
    }
    next[m] = s;
    await setAliases(next);
    setEditingAliasKey(null);
    setEditAliasMonitor('');
    setEditAliasSheet('');
    toast('Mapeamento atualizado', 'success');
  };

  return (
    <div className="fz-in" style={{ maxWidth: 720, width: '100%' }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-replace"></i> Mapeamento de transportadoras</div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Quando o nome da transportadora no Monitor difere do nome na planilha de intervenções, cadastre o par aqui.
          O sistema aplicará a tradução automaticamente ao registrar atendimentos.
        </div>

        {Object.keys(aliases).length > 0 && (
          <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, padding: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <span style={{ flex: 1 }}>Nome no Monitor</span>
              <span style={{ width: 20 }}></span>
              <span style={{ flex: 1 }}>Nome na planilha</span>
              <span style={{ width: 64 }}></span>
            </div>
            {Object.entries(aliases).map(([monitor, sheet]) => {
              const isEditing = editingAliasKey === monitor;
              return (
                <div key={monitor} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                  {isEditing ? (
                    <>
                      <input
                        className="form-control"
                        style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
                        value={editAliasMonitor}
                        onChange={e => setEditAliasMonitor(e.target.value)}
                        placeholder="Nome no Monitor"
                        onKeyDown={e => e.key === 'Enter' && saveEditAlias()}
                      />
                      <i className="ti ti-arrow-right" style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}></i>
                      <input
                        className="form-control"
                        style={{ flex: 1, fontSize: 13, padding: '4px 8px' }}
                        value={editAliasSheet}
                        onChange={e => setEditAliasSheet(e.target.value)}
                        placeholder="Nome na planilha"
                        onKeyDown={e => e.key === 'Enter' && saveEditAlias()}
                      />
                      <button className="btn-icon" onClick={saveEditAlias} title="Salvar alteração">
                        <i className="ti ti-check" style={{ color: 'var(--success-500)' }}></i>
                      </button>
                      <button className="btn-icon" onClick={cancelEditAlias} title="Cancelar">
                        <i className="ti ti-x" style={{ color: 'var(--text-muted)' }}></i>
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13 }}>{monitor}</span>
                      <i className="ti ti-arrow-right" style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}></i>
                      <span style={{ flex: 1, fontSize: 13 }}>{sheet}</span>
                      <button className="btn-icon" onClick={() => startEditAlias(monitor, sheet)} title="Editar mapeamento">
                        <i className="ti ti-pencil" style={{ color: 'var(--accent-500)' }}></i>
                      </button>
                      <button className="btn-icon" onClick={() => removeAlias(monitor)} title="Remover mapeamento">
                        <i className="ti ti-trash" style={{ color: 'var(--danger-500)' }}></i>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="form-label" htmlFor="alias-monitor">Nome no Monitor</label>
            <input
              id="alias-monitor"
              className="form-control"
              value={aliasMonitor}
              onChange={e => setAliasMonitor(e.target.value)}
              placeholder="Ex: LSL Transportes"
              onKeyDown={e => e.key === 'Enter' && addAlias()}
            />
          </div>
          <i className="ti ti-arrow-right" style={{ marginBottom: 10, color: 'var(--text-muted)', flexShrink: 0 }}></i>
          <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
            <label className="form-label" htmlFor="alias-sheet">Nome na planilha</label>
            <input
              id="alias-sheet"
              className="form-control"
              value={aliasSheet}
              onChange={e => setAliasSheet(e.target.value)}
              placeholder="Ex: LSL 2W"
              onKeyDown={e => e.key === 'Enter' && addAlias()}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={addAlias}
            disabled={!aliasMonitor.trim() || !aliasSheet.trim()}
            style={{ flexShrink: 0 }}
          >
            <i className="ti ti-plus"></i> Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
