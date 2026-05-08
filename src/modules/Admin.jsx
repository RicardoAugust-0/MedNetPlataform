import { useState } from 'react';
import { useProfiles } from '../hooks/useProfiles';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../hooks/useToast';
import { supabase } from '../supabase';
import { iniciais } from '../utils';

export default function Admin() {
  const { profiles, loading, updateRole, updateInfo } = useProfiles();
  const { profile: me } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [editNome,  setEditNome]  = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const startEdit = (p) => { setEditing(p.id); setEditNome(p.nome || ''); setEditCargo(p.cargo || ''); };
  const saveEdit  = async () => { await updateInfo(editing, { nome: editNome, cargo: editCargo }); setEditing(null); };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail }),
      }
    );
    const json = await res.json();
    if (json.error) {
      toast(json.error, 'error');
    } else {
      toast(`Convite enviado para ${inviteEmail}`, 'success');
      setInviteEmail('');
    }
    setInviting(false);
  };

  const fmtLastSeen = (iso) => {
    if (!iso) return 'Nunca';
    const d = new Date(iso), now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 2)    return 'Agora';
    if (diff < 60)   return `${diff}min atrás`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h atrás`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Convidar novo operador */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-user-plus"></i> Convidar operador</div>
        </div>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">E-mail do novo operador</label>
            <input
              className="form-control"
              type="email"
              placeholder="operador@exemplo.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              disabled={inviting}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={inviting || !inviteEmail}
            style={{ flexShrink: 0 }}
          >
            {inviting
              ? <><i className="ti ti-loader-2"></i> Enviando…</>
              : <><i className="ti ti-send"></i> Convidar</>
            }
          </button>
        </form>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          O operador receberá um e-mail com link para definir a senha e acessar a plataforma.
        </div>
      </div>

      {/* Lista de operadores */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-users"></i> Equipe · {profiles.length} operador{profiles.length !== 1 ? 'es' : ''}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {profiles.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
                display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: '#fff',
              }}>
                {iniciais(p.nome || p.id.slice(0, 4))}
              </div>

              {editing === p.id ? (
                <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="form-control" style={{ flex: 1 }} value={editNome}  onChange={e => setEditNome(e.target.value)}  placeholder="Nome" />
                  <input className="form-control" style={{ flex: 1 }} value={editCargo} onChange={e => setEditCargo(e.target.value)} placeholder="Cargo" />
                  <button className="btn btn-sm btn-primary" onClick={saveEdit}><i className="ti ti-check"></i></button>
                  <button className="btn btn-sm" onClick={() => setEditing(null)}><i className="ti ti-x"></i></button>
                </div>
              ) : (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {p.nome || '(sem nome)'}
                    {p.id === me?.id && <span style={{ fontSize: 10, background: 'var(--accent-100)', color: 'var(--accent-600)', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>Você</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.cargo || 'Operador'}</div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fmtLastSeen(p.last_seen)}</span>

                <select
                  className="form-control"
                  style={{ width: 'auto', fontSize: 11, padding: '3px 8px' }}
                  value={p.role || 'operador'}
                  onChange={e => updateRole(p.id, e.target.value)}
                  disabled={p.id === me?.id}
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>

                {editing !== p.id && (
                  <button className="btn-icon" title="Editar" onClick={() => startEdit(p)}>
                    <i className="ti ti-pencil"></i>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-info-circle"></i> Gerenciar acesso</div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <p>Para <strong>remover acesso</strong>, acesse o Supabase → Authentication → Users → Delete.</p>
          <p>Operadores com role <strong>Admin</strong> podem convidar usuários e editar perfis da equipe.</p>
        </div>
      </div>
    </div>
  );
}
