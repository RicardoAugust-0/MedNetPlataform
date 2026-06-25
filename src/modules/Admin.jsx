// deno-lint-ignore-file
import { useState, useEffect, useMemo } from 'react';
import { useProfiles } from '../hooks/useProfiles.jsx';
import { useMaintenance } from '../hooks/useMaintenance.jsx';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';
import { useAtendimentos } from '../hooks/useAtendimentos.js';
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from '../hooks/useToast.jsx';
import { supabase, getFunctionErrorMessage } from '../supabase.js';
import { iniciais } from '../utils.js';
import { exportCSV } from './monitor/utils.jsx';

export default function Admin({ section = 'equipe' }) {
  const { profiles, loading, updateRole, updateInfo } = useProfiles();
  const { maintenance, setMaintenance } = useMaintenance();
  const { aliases, setAliases } = useCarrierAliases();
  const { profile: me } = useAuth();
  const toast = useToast();
  
  // A seção ativa vem da rota (AdminLayout controla a sub-navegação).

  const [editing, setEditing] = useState(null);
  const [editNome,  setEditNome]  = useState('');
  const [editCargo, setEditCargo] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [maintMsg, setMaintMsg] = useState(maintenance.message || '');
  const [savingMaint, setSavingMaint] = useState(false);
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

  // Sincroniza o input quando a mensagem chega do servidor (load inicial ou
  // realtime update vindo de outro admin).
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

  const startEdit = (p) => { setEditing(p.id); setEditNome(p.nome || ''); setEditCargo(p.cargo || ''); };
  const saveEdit  = async () => {
    const nome  = editNome.trim();
    const cargo = editCargo.trim();
    const { error } = await updateInfo(editing, { nome, cargo });
    if (error) {
      toast(error.message || 'Não foi possível salvar as alterações', 'error');
      return;
    }
    toast('Operador atualizado', 'success');
    setEditing(null);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setInviting(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('invite-user', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: { email: inviteEmail },
    });
    if (error) {
      const errMsg = await getFunctionErrorMessage(error);
      toast(errMsg, 'error');
    } else if (data?.error) {
      toast(data.error, 'error');
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
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Cabeçalho e sub-navegação movidos para AdminLayout */}

      {/* Tab Contents — seção definida pela rota (prop `section`) */}
      <div style={{ maxWidth: 720, width: '100%', marginTop: '10px' }}>
        
        {section === 'equipe' && (
          <div className="fz-in">
            {/* Convidar novo operador */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div className="card-title"><i className="ti ti-user-plus"></i> Convidar operador</div>
              </div>
              <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label" htmlFor="invite-email">E-mail do novo operador</label>
                  <input
                    id="invite-email"
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
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                      background: p.avatar_url ? 'var(--surface-1, #2a2a2a)' : 'linear-gradient(135deg, var(--accent-500), var(--accent-700))',
                      display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 600, color: '#fff',
                    }}>
                      {p.avatar_url
                        ? <img src={p.avatar_url} alt={p.nome || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : iniciais(p.nome || p.id.slice(0, 4))}
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
                        <option value="lider">Líder</option>
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

            {/* Gerenciar acesso */}
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
        )}

        {section === 'integracoes' && (
          <div className="fz-in">
            {/* Configuração da OmniLink */}
            <OmnilinkConfigCard />

            {/* Mapeamento de transportadoras */}
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
        )}

        {section === 'ia' && (
          <div className="fz-in">
            <AiCredentialsCard />
          </div>
        )}

        {section === 'sistema' && (
          <div className="fz-in">
            {/* Modo manutenção */}
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

            {/* Limpar histórico */}
            <ClearHistoryCard />
          </div>
        )}

      </div>
    </div>
  );
}

// ── Nova Configuração da OmniLink ───────────────────────────────────────────
function OmnilinkConfigCard() {
  const toast = useToast();
  const [operatorEmail, setOperatorEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'omnilink_config')
      .maybeSingle()
      .then(({ data }) => {
        const email = data?.value?.operator_email || 'hevilyntfzero@gmail.com';
        setOperatorEmail(email);
        setSavedEmail(email);
        setLoading(false);
      });
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'omnilink_config',
          value: { operator_email: operatorEmail.trim().toLowerCase() },
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (error) throw error;
      setSavedEmail(operatorEmail.trim().toLowerCase());
      toast('Configuração da OmniLink salva com sucesso!', 'success');
    } catch (err) {
      toast('Erro ao salvar configuração: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = operatorEmail.trim().toLowerCase() !== savedEmail;

  if (loading) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">
          <i className="ti ti-settings"></i> Configuração da OmniLink
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
        E-mail do operador cadastrado no sistema OmniLink cujos eventos tratados devem ser mantidos. Todos os outros operadores serão ignorados durante o parsing da planilha.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
          <label className="form-label" htmlFor="omnilink-operator">E-mail do operador</label>
          <input
            id="omnilink-operator"
            className="form-control"
            type="email"
            value={operatorEmail}
            onChange={e => setOperatorEmail(e.target.value)}
            placeholder="Ex: operador@exemplo.com.br"
            disabled={saving}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={saveConfig}
          disabled={saving || !operatorEmail.trim() || !isDirty}
          style={{ flexShrink: 0 }}
        >
          {saving ? <><i className="ti ti-loader-2 fz-spin"></i> Salvando…</> : <><i className="ti ti-device-floppy"></i> Salvar</>}
        </button>
      </div>
    </div>
  );
}

// ── Constantes de IA (espelhadas em Reports.jsx) ─────────────────────────────
const AI_PROVIDERS = [
  {
    id: 'anthropic', label: 'Anthropic (Claude)',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 · rápido' },
      { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 · balanceado' },
      { id: 'claude-opus-4-7',           label: 'Opus 4.7 · máxima qualidade' },
    ],
  },
  {
    id: 'google', label: 'Google (Gemini)',
    models: [
      { id: 'gemini-2.0-flash',  label: 'Flash 2.0 · rápido' },
      { id: 'gemini-2.5-flash',  label: 'Flash 2.5 · balanceado' },
      { id: 'gemini-2.5-pro',    label: 'Pro 2.5 · máxima qualidade' },
    ],
  },
];

const AI_CONFIG_DEFAULT = { provider: 'anthropic', anthropic_model: 'claude-sonnet-4-6', google_model: 'gemini-2.5-flash' };

function AiCredentialsCard() {
  const toast = useToast();

  const [cfg, setCfg]             = useState(AI_CONFIG_DEFAULT);
  const [savedCfg, setSavedCfg]   = useState(AI_CONFIG_DEFAULT);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);

  // Por provedor: { configured: bool, apiKey: string (input), saving: bool }
  const [provState, setProvState] = useState({
    anthropic: { configured: false, apiKey: '', saving: false },
    google:    { configured: false, apiKey: '', saving: false },
  });

  useEffect(() => {
    let cancelled = false;

    supabase.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = { ...AI_CONFIG_DEFAULT, ...(data?.value || {}) };
        setCfg(v);
        setSavedCfg(v);
        setLoadingCfg(false);
      });

    // Verifica quais provedores têm chave configurada (lê apenas existência, não o valor)
    supabase.from('ai_credentials').select('provider').then(({ data }) => {
      if (cancelled || !data) return;
      const configured = new Set(data.map(r => r.provider));
      setProvState(prev => ({
        anthropic: { ...prev.anthropic, configured: configured.has('anthropic') },
        google:    { ...prev.google,    configured: configured.has('google') },
      }));
    });

    return () => { cancelled = true; };
  }, []);

  const cfgDirty = cfg.provider !== savedCfg.provider ||
                   cfg.anthropic_model !== savedCfg.anthropic_model ||
                   cfg.google_model !== savedCfg.google_model;

  const saveAiConfig = async () => {
    setSavingCfg(true);
    try {
      const { error } = await supabase.from('app_settings').upsert({
        key: 'ai_config',
        value: cfg,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) throw error;
      setSavedCfg(cfg);
      toast('Configuração do modelo salva', 'success');
    } catch (err) {
      toast('Erro ao salvar configuração: ' + err.message, 'error');
    }
    setSavingCfg(false);
  };

  const saveProviderKey = async (provider) => {
    const key = provState[provider].apiKey.trim();
    if (!key) return;

    setProvState(prev => ({ ...prev, [provider]: { ...prev[provider], saving: true } }));
    try {
      const { error } = await supabase.from('ai_credentials').upsert(
        { provider, api_key: key, updated_at: new Date().toISOString() },
        { onConflict: 'provider' }
      );
      if (error) throw error;
      setProvState(prev => ({ ...prev, [provider]: { ...prev[provider], configured: true, apiKey: '', saving: false } }));
      toast(`Chave do ${provider === 'anthropic' ? 'Anthropic' : 'Google'} salva`, 'success');
    } catch (err) {
      toast('Erro ao salvar chave: ' + err.message, 'error');
      setProvState(prev => ({ ...prev, [provider]: { ...prev[provider], saving: false } }));
    }
  };

  if (loadingCfg) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title"><i className="ti ti-cpu"></i> Provedores de IA & Modelos</div>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
        Gerencie qual modelo de inteligência artificial (Anthropic Claude ou Google Gemini) é utilizado para a análise do histórico de eventos dos motoristas.
      </div>

      {/* Provedor Ativo + Modelos */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="ai-provider">Provedor ativo</label>
          <select
            id="ai-provider"
            className="form-control"
            value={cfg.provider}
            onChange={e => setCfg(prev => ({ ...prev, provider: e.target.value }))}
          >
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="google">Google (Gemini)</option>
          </select>
        </div>

        {cfg.provider === 'anthropic' ? (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="model-anthropic">Modelo Anthropic</label>
            <select
              id="model-anthropic"
              className="form-control"
              value={cfg.anthropic_model}
              onChange={e => setCfg(prev => ({ ...prev, anthropic_model: e.target.value }))}
            >
              {AI_PROVIDERS[0].models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="model-google">Modelo Google</label>
            <select
              id="model-google"
              className="form-control"
              value={cfg.google_model}
              onChange={e => setCfg(prev => ({ ...prev, google_model: e.target.value }))}
            >
              {AI_PROVIDERS[1].models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        )}

        {cfgDirty && (
          <button type="button" className="btn btn-primary btn-sm" onClick={saveAiConfig} disabled={savingCfg} style={{ flexShrink: 0 }}>
            {savingCfg ? <><i className="ti ti-loader-2"></i> Salvando…</> : <><i className="ti ti-device-floppy"></i> Salvar configuração</>}
          </button>
        )}
      </div>

      {/* Inputs de Chaves API */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Credenciais API (Chaves)
        </div>
        {AI_PROVIDERS.map(p => {
          const ps = provState[p.id];
          return (
            <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
              <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label className="form-label" htmlFor={`api-key-${p.id}`}>{p.label}</label>
                <input
                  id={`api-key-${p.id}`}
                  className="form-control"
                  type="password"
                  value={ps.apiKey}
                  onChange={e => setProvState(prev => ({ ...prev, [p.id]: { ...prev[p.id], apiKey: e.target.value } }))}
                  placeholder={ps.configured ? '••••••••  (chave configurada, digite nova para alterar)' : 'Chave de API do provedor'}
                  disabled={ps.saving}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => saveProviderKey(p.id)}
                disabled={ps.saving || !ps.apiKey.trim()}
                style={{ flexShrink: 0 }}
              >
                {ps.saving ? <><i className="ti ti-loader-2"></i> Salvando…</> : <><i className="ti ti-key"></i> {ps.configured ? 'Substituir' : 'Salvar'}</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}



const TIPO_OPTS = [
  { value: 'intervencao', label: 'Intervenção' },
  { value: 'reportar',    label: 'Reportar' },
  { value: 'descarte',    label: 'Descarte' },
  { value: 'limpeza',     label: 'Limpeza' },
];

function ClearHistoryCard() {
  const { loadAllByFilter, deleteByFilter } = useAtendimentos();
  const toast = useToast();
  const [period, setPeriod] = useState('todos'); // hoje | semana | mes | intervalo | todos
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [tipos, setTipos] = useState([]); // vazio = todos
  const [preview, setPreview] = useState(null); // { count, rows } | null
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [confirming, setConfirming]   = useState(false);
  const [deleting, setDeleting]       = useState(false);

  // Converte período relativo em { from, to } no formato YYYY-MM-DD (local).
  const dateRange = useMemo(() => {
    const fmt = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    if (period === 'todos')     return { from: null, to: null };
    if (period === 'hoje')      return { from: fmt(now), to: fmt(now) };
    if (period === 'semana')    { const d = new Date(now); d.setDate(d.getDate() - 7);  return { from: fmt(d), to: fmt(now) }; }
    if (period === 'mes')       { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: fmt(d), to: fmt(now) }; }
    if (period === 'intervalo') return { from: from || null, to: to || null };
    return { from: null, to: null };
  }, [period, from, to]);

  const canPreview = period !== 'intervalo' || (from && to);

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreview(null);
    const { data, error } = await loadAllByFilter({
      from: dateRange.from,
      to:   dateRange.to,
      tipos: tipos.length > 0 ? tipos : undefined,
    });
    if (error) {
      toast('Erro ao carregar prévia: ' + error, 'error');
      setLoadingPreview(false);
      return;
    }
    setPreview({ count: data.length, rows: data });
    setLoadingPreview(false);
  };

  const handleStartConfirm = () => {
    if (!preview || preview.count === 0) return;
    setConfirmText('');
    setConfirming(true);
  };

  const handleCancel = () => {
    setConfirming(false);
    setConfirmText('');
  };

  const handleExecute = async () => {
    if (confirmText !== 'LIMPAR') return;
    setDeleting(true);
    try {
      // Exporta CSV antes (rede de segurança)
      if (preview.rows.length > 0) exportCSV(preview.rows);
      const { count, error } = await deleteByFilter({
        from: dateRange.from,
        to:   dateRange.to,
        tipos: tipos.length > 0 ? tipos : undefined,
      });
      if (error) {
        toast('Erro ao limpar: ' + error, 'error');
      } else {
        toast(`${count} registro(s) apagado(s). CSV baixado.`, 'success');
        setPreview(null);
        setConfirming(false);
        setConfirmText('');
      }
    } finally {
      setDeleting(false);
    }
  };

  const toggleTipo = (t) => {
    setTipos(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    setPreview(null);
  };

  const resetPreview = () => setPreview(null);

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: confirming ? 'var(--danger-500)' : undefined }}>
      <div className="card-header">
        <div className="card-title">
          <i className="ti ti-eraser" style={{ color: 'var(--danger-500)' }}></i> Limpar histórico de atendimentos
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.55 }}>
        Apaga registros da tabela <code>atendimentos</code> (intervenções, descartes, reportar, limpeza). Um CSV de backup é baixado automaticamente antes do delete. <strong>Ação irreversível.</strong>
      </div>

      <div className="form-group" style={{ marginBottom: 10 }}>
        <label className="form-label" htmlFor="clear-period">Período</label>
        <select id="clear-period" className="form-control" value={period} onChange={e => { setPeriod(e.target.value); resetPreview(); }} disabled={confirming || deleting}>
          <option value="todos">Todos (apagar histórico inteiro)</option>
          <option value="hoje">Hoje</option>
          <option value="semana">Últimos 7 dias</option>
          <option value="mes">Últimos 30 dias</option>
          <option value="intervalo">Intervalo personalizado</option>
        </select>
      </div>

      {period === 'intervalo' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label" htmlFor="clear-date-from">De</label>
            <input id="clear-date-from" className="form-control" type="date" value={from} onChange={e => { setFrom(e.target.value); resetPreview(); }} disabled={confirming || deleting} />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label" htmlFor="clear-date-to">Até</label>
            <input id="clear-date-to" className="form-control" type="date" value={to} onChange={e => { setTo(e.target.value); resetPreview(); }} disabled={confirming || deleting} />
          </div>
        </div>
      )}

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Tipos (vazio = todos)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TIPO_OPTS.map(opt => {
            const active = tipos.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                onClick={() => toggleTipo(opt.value)}
                disabled={confirming || deleting}
                style={{ fontSize: 11.5 }}
              >
                {active && <i className="ti ti-check" style={{ marginRight: 4 }}></i>}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {!confirming && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={handlePreview}
            disabled={!canPreview || loadingPreview || deleting}
          >
            {loadingPreview ? <><i className="ti ti-loader-2"></i> Calculando…</> : <><i className="ti ti-eye"></i> Calcular prévia</>}
          </button>
          {preview && (
            <>
              <span style={{ fontSize: 13, color: preview.count > 0 ? 'var(--danger-500)' : 'var(--text-muted)', fontWeight: 600 }}>
                {preview.count} registro(s) serão apagados
              </span>
              <button
                type="button"
                className="btn"
                onClick={handleStartConfirm}
                disabled={preview.count === 0}
                style={{ background: 'var(--danger-500)', color: '#fff', border: 'none', marginLeft: 'auto' }}
              >
                <i className="ti ti-trash"></i> Exportar CSV e limpar
              </button>
            </>
          )}
        </div>
      )}

      {confirming && (
        <div style={{ padding: 12, background: 'var(--danger-50, rgba(220, 38, 38, 0.08))', borderRadius: 6, border: '1px solid var(--danger-500)' }}>
          <div style={{ fontSize: 13, color: 'var(--danger-600, var(--danger-500))', marginBottom: 8, lineHeight: 1.5 }}>
            <i className="ti ti-alert-triangle" style={{ marginRight: 4 }}></i>
            Você vai apagar <strong>{preview.count}</strong> registro(s) de forma permanente. Digite <code>LIMPAR</code> para confirmar.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="form-control"
              style={{ flex: 1 }}
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="Digite LIMPAR"
              disabled={deleting}
              autoFocus
            />
            <button
              type="button"
              className="btn"
              onClick={handleExecute}
              disabled={confirmText !== 'LIMPAR' || deleting}
              style={{ background: 'var(--danger-500)', color: '#fff', border: 'none' }}
            >
              {deleting ? <><i className="ti ti-loader-2"></i> Apagando…</> : <><i className="ti ti-check"></i> Confirmar</>}
            </button>
            <button type="button" className="btn" onClick={handleCancel} disabled={deleting}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


