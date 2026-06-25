// deno-lint-ignore-file
import { useState, useEffect } from 'react';
import { useMaintenance } from '../../hooks/useMaintenance.jsx';
import { useToast } from '../../hooks/useToast.jsx';

// /admin/sistema/manutencao — trava/libera a plataforma para operadores.
export default function SistemaManutencao() {
  const { maintenance, setMaintenance } = useMaintenance();
  const toast = useToast();
  const [maintMsg, setMaintMsg] = useState(maintenance.message || '');
  const [savingMaint, setSavingMaint] = useState(false);

  // Sincroniza o input quando a mensagem chega do servidor (load inicial ou
  // realtime update vindo de outro admin).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMaintMsg(maintenance.message || ''); }, [maintenance.message]);

  const msgDirty = maintMsg !== (maintenance.message || '');

  const toggleMaintenance = async () => {
    const next = !maintenance.enabled;
    setSavingMaint(true);
    try {
      await setMaintenance({ enabled: next, message: maintMsg });
      toast(
        next ? 'Plataforma travada para manutenção' : 'Plataforma liberada',
        next ? 'info' : 'success'
      );
    } catch {
      toast('Erro ao atualizar modo manutenção', 'error');
    }
    setSavingMaint(false);
  };

  const saveMessage = async () => {
    setSavingMaint(true);
    try {
      await setMaintenance({ message: maintMsg });
      toast('Mensagem atualizada', 'success');
    } catch {
      toast('Erro ao salvar mensagem', 'error');
    }
    setSavingMaint(false);
  };

  return (
    <div className="fz-in" style={{ maxWidth: 720, width: '100%' }}>
      <div className="card" style={{ marginBottom: 16, borderColor: maintenance.enabled ? '#F26931' : undefined }}>
        <div className="card-header">
          <div className="card-title">
            <i className="ti ti-tools"></i> Modo manutenção
            {maintenance.enabled && (
              <span style={{ fontSize: 10, background: '#F26931', color: '#fff', borderRadius: 4, padding: '2px 6px', marginLeft: 8, fontWeight: 700, letterSpacing: 0.4 }}>
                ATIVO
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55 }}>
          Quando ativo, operadores veem uma página de manutenção e não conseguem acessar a plataforma. Admins continuam com acesso normal.
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label" htmlFor="maintenance-msg">Mensagem opcional para os operadores</label>
          <input
            id="maintenance-msg"
            className="form-control"
            type="text"
            placeholder="Ex: Estamos atualizando o sistema, voltamos em breve."
            value={maintMsg}
            onChange={e => setMaintMsg(e.target.value)}
            disabled={savingMaint}
          />
          {msgDirty && (
            <div style={{ fontSize: 11, color: 'var(--warning-600, #b45309)', marginTop: 4 }}>
              <i className="ti ti-alert-circle" style={{ fontSize: 11, marginRight: 3 }}></i>
              Mensagem ainda não salva.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={toggleMaintenance}
            disabled={savingMaint}
            style={{
              background: maintenance.enabled ? 'var(--success-500, #1a7a3a)' : '#F26931',
              color: '#fff',
              border: 'none',
            }}
          >
            {savingMaint
              ? <><i className="ti ti-loader-2"></i> Salvando…</>
              : maintenance.enabled
                ? <><i className="ti ti-lock-open"></i> Liberar plataforma</>
                : <><i className="ti ti-lock"></i> Travar plataforma</>
            }
          </button>
          {msgDirty && (
            <button
              type="button"
              className="btn"
              onClick={saveMessage}
              disabled={savingMaint}
            >
              <i className="ti ti-device-floppy"></i> Salvar mensagem
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
