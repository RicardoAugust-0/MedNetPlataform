// deno-lint-ignore-file
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabase.js';
import { useToast } from '../../hooks/useToast.jsx';
import { useConfirm } from '../../hooks/useConfirm';
import EmptyState from '../../components/EmptyState.jsx';

const STATUS_INFO = {
  ok:               { label: 'OK',       bg: 'rgba(45, 167, 90, 0.18)', color: 'var(--success-500)' },
  credential_error: { label: 'Erro de senha', bg: 'rgba(226, 75, 74, 0.18)', color: 'var(--danger-500)' },
  session_expired:  { label: 'Sessão expirada', bg: 'rgba(232, 160, 32, 0.18)', color: 'var(--warning-500)' },
};
const HORIZON_CREDENTIAL_COLUMNS = 'id, label, email, status, last_login_at, last_extracted_at, last_error';

function fetchHorizonAccounts() {
  return supabase
    .from('horizon_credentials')
    .select(HORIZON_CREDENTIAL_COLUMNS)
    .order('label', { ascending: true });
}

function StatusPill({ status }) {
  const info = STATUS_INFO[status] || STATUS_INFO.ok;
  return <span className="pillc" style={{ background: info.bg, color: info.color }}>{info.label}</span>;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// /admin/integracoes/horizon — contas do portal Horizon usadas pelo
// Bot_HorizonScraping. Rotação de senha: a Horizon força troca periódica e as
// senhas circulam entre um pequeno conjunto conhecido — por isso cada conta
// guarda a senha atual + candidatas, que o robô tenta em sequência ao falhar.
export default function IntegracoesHorizon() {
  const toast = useToast();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editPassword, setEditPassword] = useState('');
  const [editCandidates, setEditCandidates] = useState([]);
  const [candidatesTouched, setCandidatesTouched] = useState(false);
  const [newCandidate, setNewCandidate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [newLabel, setNewLabel] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchHorizonAccounts();
    if (error) {
      toast('Erro ao carregar contas Horizon: ' + error.message, 'error');
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    fetchHorizonAccounts().then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        toast('Erro ao carregar contas Horizon: ' + error.message, 'error');
      } else {
        setAccounts(data || []);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [toast]);

  const addAccount = async () => {
    const label = newLabel.trim();
    const email = newEmail.trim().toLowerCase();
    const password = newPassword.trim();
    if (!label || !email || !password) return;

    setAdding(true);
    const { error } = await supabase
      .from('horizon_credentials')
      .insert({ label, email, password, password_candidates: [] });
    setAdding(false);

    if (error) {
      toast('Erro ao adicionar conta: ' + error.message, 'error');
      return;
    }
    setNewLabel(''); setNewEmail(''); setNewPassword('');
    toast('Conta Horizon adicionada', 'success');
    load();
  };

  const removeAccount = async (acc) => {
    if (!(await confirm({ title: 'Remover conta Horizon', message: `Remover a conta "${acc.label}" (${acc.email})? O robô deixará de usá-la nas próximas execuções.` }))) return;
    const { error } = await supabase.from('horizon_credentials').delete().eq('id', acc.id);
    if (error) {
      toast('Erro ao remover conta: ' + error.message, 'error');
      return;
    }
    toast('Conta removida', 'info');
    load();
  };

  const startEdit = (acc) => {
    setEditingId(acc.id);
    setEditPassword('');
    setEditCandidates([]);
    setCandidatesTouched(false);
    setNewCandidate('');
    setShowEditPassword(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPassword('');
    setEditCandidates([]);
    setCandidatesTouched(false);
    setNewCandidate('');
    setShowEditPassword(false);
  };

  const addCandidate = () => {
    const c = newCandidate.trim();
    if (!c || editCandidates.includes(c)) return;
    setEditCandidates(prev => [...prev, c]);
    setCandidatesTouched(true);
    setNewCandidate('');
  };

  const removeCandidate = (c) => {
    setEditCandidates(prev => prev.filter(x => x !== c));
    setCandidatesTouched(true);
  };

  const saveEdit = async (acc) => {
    setSaving(true);
    const patch = {
      // Editar metadados também reabre contas com falha operacional.
      status: acc.status !== 'ok' ? 'ok' : acc.status,
      last_error: acc.status !== 'ok' ? null : acc.last_error,
      updated_at: new Date().toISOString(),
    };
    if (editPassword.trim()) patch.password = editPassword.trim();
    if (candidatesTouched) patch.password_candidates = editCandidates;
    const { error } = await supabase
      .from('horizon_credentials')
      .update(patch)
      .eq('id', acc.id);
    setSaving(false);

    if (error) {
      toast('Erro ao salvar conta: ' + error.message, 'error');
      return;
    }
    toast('Conta atualizada', 'success');
    cancelEdit();
    load();
  };

  if (loading) return null;

  return (
    <div className="fz-in" style={{ maxWidth: 860, width: '100%' }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-cloud-download"></i> Contas Horizon</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
          O robô <strong>Bot_HorizonScraping</strong> usa estas credenciais para extrair relatórios de hora em hora.
          A Horizon força troca de senha periodicamente — cadastre aqui a senha atual e as senhas candidatas que costumam circular;
          se a Horizon rejeitar explicitamente a senha, o robô tenta as candidatas em ordem. Captcha, timeout e indisponibilidade
          aparecem como falha de sessão e não bloqueiam a conta.
        </div>

        {accounts.length === 0 ? (
          <EmptyState icon="ti-inbox" msg="Nenhuma conta cadastrada ainda." style={{ padding: '20px 0' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 16 }}>
            {accounts.map(acc => {
              const isEditing = editingId === acc.id;
              return (
                <div key={acc.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{acc.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{acc.email}</div>
                    </div>
                    <StatusPill status={acc.status} />
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', minWidth: 130 }}>
                      Último login: {formatDate(acc.last_login_at)}
                    </div>
                    {!isEditing && (
                      <>
                        <button className="btn-icon" onClick={() => startEdit(acc)} title="Editar senha/candidatas">
                          <i className="ti ti-pencil" style={{ color: 'var(--accent-500)' }}></i>
                        </button>
                        <button className="btn-icon" onClick={() => removeAccount(acc)} title="Remover conta">
                          <i className="ti ti-trash" style={{ color: 'var(--danger-500)' }}></i>
                        </button>
                      </>
                    )}
                  </div>

                  {acc.status !== 'ok' && acc.last_error && !isEditing && (
                    <div style={{ fontSize: 11.5, color: 'var(--danger-500)', marginTop: 4 }}>
                      <i className="ti ti-alert-triangle"></i> {acc.last_error}
                    </div>
                  )}

                  {isEditing && (
                    <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-2, rgba(0,0,0,0.03))', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" htmlFor={`horizon-password-${acc.id}`}>Nova senha (opcional)</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            id={`horizon-password-${acc.id}`}
                            className="form-control"
                            type={showEditPassword ? 'text' : 'password'}
                            value={editPassword}
                            onChange={e => setEditPassword(e.target.value)}
                            placeholder="Deixe em branco para manter a senha atual"
                            autoComplete="new-password"
                            style={{ fontSize: 13, padding: '5px 8px', flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => setShowEditPassword(value => !value)}
                            title={showEditPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                          >
                            <i className={`ti ${showEditPassword ? 'ti-eye-off' : 'ti-eye'}`}></i>
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="form-label">Substituir senhas candidatas (opcional)</label>
                        {!candidatesTouched && (
                          <div className="field-hint" style={{ marginBottom: 6 }}>
                            As candidatas atuais não são carregadas no navegador e serão preservadas.
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          {editCandidates.map(c => (
                            <span key={c} className="pillc" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {c}
                              <button type="button" className="btn-icon" aria-label="Remover candidata" onClick={() => removeCandidate(c)} style={{ padding: 0 }}>
                                <i className="ti ti-x" style={{ fontSize: 11 }}></i>
                              </button>
                            </span>
                          ))}
                          {candidatesTouched && editCandidates.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>A lista será removida ao salvar</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            className="form-control"
                            style={{ flex: 1, fontSize: 13, padding: '5px 8px' }}
                            value={newCandidate}
                            onChange={e => setNewCandidate(e.target.value)}
                            placeholder="Nova senha candidata"
                            onKeyDown={e => e.key === 'Enter' && addCandidate()}
                          />
                          <button className="btn btn-sm" onClick={addCandidate} disabled={!newCandidate.trim()}>
                            <i className="ti ti-plus"></i>
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={cancelEdit} disabled={saving}>Cancelar</button>
                        <button className="btn btn-sm btn-primary" onClick={() => saveEdit(acc)} disabled={saving}>
                          {saving ? <><i className="ti ti-loader-2 fz-spin"></i> Salvando…</> : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Adicionar conta</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label className="form-label">Label</label>
              <input className="form-control" value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Ex: Conta 01" disabled={adding} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <label className="form-label">E-mail</label>
              <input className="form-control" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="conta@exemplo.com" disabled={adding} />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
              <label className="form-label">Senha</label>
              <input className="form-control" type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Senha atual" disabled={adding} />
            </div>
            <button
              className="btn btn-primary"
              onClick={addAccount}
              disabled={adding || !newLabel.trim() || !newEmail.trim() || !newPassword.trim()}
              style={{ flexShrink: 0 }}
            >
              {adding ? <><i className="ti ti-loader-2 fz-spin"></i> Adicionando…</> : <><i className="ti ti-plus"></i> Adicionar</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
