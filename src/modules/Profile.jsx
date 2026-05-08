import { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

function Section({ title, children }) {
  return (
    <div style={{
      background: 'var(--surface-0)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '20px 24px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SaveBtn({ loading, label = 'Salvar alterações' }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4 }}>
      {loading ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }}></i> Salvando…</> : <><i className="ti ti-check"></i> {label}</>}
    </button>
  );
}

function Alert({ type, msg }) {
  if (!msg) return null;
  const isOk = type === 'success';
  return (
    <div style={{
      padding: '9px 12px', borderRadius: 'var(--radius-md)', fontSize: 12.5,
      display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
      background: isOk ? 'var(--success-bg, #e6f9ed)' : 'var(--danger-bg)',
      color: isOk ? 'var(--success-600, #1a7a3a)' : 'var(--danger-600)',
    }}>
      <i className={`ti ${isOk ? 'ti-circle-check' : 'ti-alert-circle'}`}></i> {msg}
    </div>
  );
}

export default function Profile() {
  const { profile, updateProfile, setPassword } = useAuth();

  // Seção: dados pessoais
  const [nome,  setNome]  = useState(profile?.nome  || '');
  const [cargo, setCargo] = useState(profile?.cargo || '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState(null); // { type, text }

  // Sincroniza campos quando o perfil carrega (profile vem null no primeiro render)
  useEffect(() => {
    if (profile?.nome  && !nome)  setNome(profile.nome);
    if (profile?.cargo && !cargo) setCargo(profile.cargo);
  }, [profile]);

  // Seção: senha
  const [novaSenha,    setNovaSenha]    = useState('');
  const [confirmSenha, setConfirmSenha] = useState('');
  const [senhaLoading, setSenhaLoading] = useState(false);
  const [senhaMsg, setSenhaMsg]         = useState(null);

  const handleInfo = async (e) => {
    e.preventDefault();
    if (!nome.trim()) {
      setInfoMsg({ type: 'error', text: 'O nome não pode ficar em branco.' });
      return;
    }
    if (nome.trim().length < 3) {
      setInfoMsg({ type: 'error', text: 'O nome deve ter pelo menos 3 caracteres.' });
      return;
    }
    setInfoLoading(true);
    setInfoMsg(null);
    const { error } = await updateProfile(nome.trim(), cargo.trim());
    setInfoMsg(error
      ? { type: 'error', text: error.message }
      : { type: 'success', text: 'Informações atualizadas com sucesso.' }
    );
    setInfoLoading(false);
  };

  const handleSenha = async (e) => {
    e.preventDefault();
    setSenhaMsg(null);
    if (novaSenha.length < 6) {
      setSenhaMsg({ type: 'error', text: 'A senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    if (novaSenha !== confirmSenha) {
      setSenhaMsg({ type: 'error', text: 'As senhas não coincidem.' });
      return;
    }
    setSenhaLoading(true);
    const { error } = await setPassword(novaSenha);
    if (error) {
      setSenhaMsg({ type: 'error', text: error.message });
    } else {
      setSenhaMsg({ type: 'success', text: 'Senha alterada com sucesso.' });
      setNovaSenha('');
      setConfirmSenha('');
    }
    setSenhaLoading(false);
  };

  return (
    <div style={{ maxWidth: 560 }}>

      <Section title={<><i className="ti ti-user" style={{ marginRight: 6 }}></i>Informações pessoais</>}>
        <form onSubmit={handleInfo}>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input
              className="form-control"
              value={profile?.email || ''}
              disabled
              style={{ opacity: 0.6, cursor: 'not-allowed' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              O e-mail não pode ser alterado por aqui. Fale com o administrador.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input
              className="form-control"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Cargo / Função</label>
            <input
              className="form-control"
              value={cargo}
              onChange={e => setCargo(e.target.value)}
              placeholder="Ex: Analista Fadiga Zero"
            />
          </div>
          <Alert type={infoMsg?.type} msg={infoMsg?.text} />
          <SaveBtn loading={infoLoading} />
        </form>
      </Section>

      <Section title={<><i className="ti ti-lock" style={{ marginRight: 6 }}></i>Alterar senha</>}>
        <form onSubmit={handleSenha}>
          <div className="form-group">
            <label className="form-label">Nova senha</label>
            <input
              className="form-control"
              type="password"
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirmar nova senha</label>
            <input
              className="form-control"
              type="password"
              value={confirmSenha}
              onChange={e => setConfirmSenha(e.target.value)}
              placeholder="Repita a senha"
            />
          </div>
          <Alert type={senhaMsg?.type} msg={senhaMsg?.text} />
          <SaveBtn loading={senhaLoading} label="Alterar senha" />
        </form>
      </Section>

    </div>
  );
}
