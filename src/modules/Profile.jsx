import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { supabase } from '../supabase.js';
import { uploadAvatar, removeAvatar } from '../lib/uploadAvatar';
import { iniciais } from '../utils.js';

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

function AvatarSection({ profile, updateProfile }) {
  const fileInputRef = useRef(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoMsg,     setPhotoMsg]     = useState(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-selecionar o mesmo arquivo depois
    if (!file || !profile?.id) return;
    setPhotoLoading(true);
    setPhotoMsg(null);
    try {
      const url = await uploadAvatar(file, profile.id);
      const { error } = await updateProfile({ avatar_url: url });
      if (error) throw error;
      setPhotoMsg({ type: 'success', text: 'Foto atualizada.' });
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err.message || 'Falha ao enviar foto.' });
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!profile?.id || !profile.avatar_url) return;
    if (!window.confirm('Remover sua foto de perfil?')) return;
    setPhotoLoading(true);
    setPhotoMsg(null);
    try {
      await removeAvatar(profile.id);
      const { error } = await updateProfile({ avatar_url: null });
      if (error) throw error;
      setPhotoMsg({ type: 'success', text: 'Foto removida.' });
    } catch (err) {
      setPhotoMsg({ type: 'error', text: err.message || 'Falha ao remover foto.' });
    } finally {
      setPhotoLoading(false);
    }
  };

  return (
    <Section title={<><i className="ti ti-camera" style={{ marginRight: 6 }}></i>Foto de perfil</>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div
          style={{
            width: 96, height: 96, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface-1, #2a2a2a)', color: 'var(--text-primary)',
            fontSize: 32, fontWeight: 600, border: '1px solid var(--border)',
          }}
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt={profile.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span>{iniciais(profile?.nome || '?')}</span>}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={handlePick} disabled={photoLoading}>
              <i className={`ti ${photoLoading ? 'ti-loader-2' : 'ti-upload'}`} style={photoLoading ? { animation: 'spin 1s linear infinite' } : null}></i>
              {profile?.avatar_url ? 'Trocar foto' : 'Enviar foto'}
            </button>
            {profile?.avatar_url && (
              <button type="button" className="btn btn-danger" onClick={handleRemove} disabled={photoLoading}>
                <i className="ti ti-trash"></i> Remover
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            JPG, PNG ou WebP · até 2 MB
          </div>
          <Alert type={photoMsg?.type} msg={photoMsg?.text} />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          hidden
        />
      </div>
    </Section>
  );
}

function MaxtrackSection({ profile, session, updateProfile }) {
  const [email,    setEmail]    = useState('');
  const [senha,    setSenha]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState(null);

  const configured = !!profile?.maxtrack_email;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMsg({ type: 'error', text: 'Informe o e-mail Maxtrack.' }); return; }
    if (!senha.trim()) { setMsg({ type: 'error', text: 'Informe a senha Maxtrack.' }); return; }
    setLoading(true); setMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ maxtrack_email: email.trim(), maxtrack_password: senha })
      .eq('id', session?.user?.id);
    if (error) {
      setMsg({ type: 'error', text: error.message });
    } else {
      updateProfile({ maxtrack_email: email.trim() });
      setSenha('');
      setMsg({ type: 'success', text: 'Credenciais Maxtrack salvas.' });
    }
    setLoading(false);
  };

  const handleRemove = async () => {
    if (!window.confirm('Remover credenciais Maxtrack?')) return;
    setLoading(true); setMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ maxtrack_email: null, maxtrack_password: null })
      .eq('id', session?.user?.id);
    if (!error) {
      updateProfile({ maxtrack_email: '' });
      setEmail(''); setSenha('');
      setMsg({ type: 'success', text: 'Credenciais removidas.' });
    }
    setLoading(false);
  };

  return (
    <Section title={<><i className="ti ti-plug-connected" style={{ marginRight: 6 }}></i>Integrações</>}>
      <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
        Credenciais usadas pela integração automática com o portal Maxtrack.
        A senha é armazenada de forma segura e nunca exibida.
      </div>

      {configured && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: 'var(--success-bg, rgba(34,197,94,0.08))', borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(34,197,94,0.2)', marginBottom: 14, fontSize: 12.5,
        }}>
          <i className="ti ti-circle-check" style={{ color: 'var(--success-600, #16a34a)' }}></i>
          <span style={{ flex: 1 }}>Maxtrack configurado: <strong>{profile.maxtrack_email}</strong></span>
          <button type="button" className="btn btn-sm btn-danger" onClick={handleRemove} disabled={loading}>
            <i className="ti ti-trash"></i> Remover
          </button>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label className="form-label">E-mail Maxtrack</label>
          <input
            className="form-control"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={configured ? profile.maxtrack_email : 'seu@email.com'}
          />
        </div>
        <div className="form-group">
          <label className="form-label">{configured ? 'Nova senha Maxtrack' : 'Senha Maxtrack'}</label>
          <input
            className="form-control"
            type="password"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder={configured ? '••••••••  (deixe em branco para manter)' : '••••••••'}
          />
          {configured && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Só preencha se quiser alterar a senha.
            </div>
          )}
        </div>
        <Alert type={msg?.type} msg={msg?.text} />
        <SaveBtn loading={loading} label={configured ? 'Atualizar credenciais' : 'Salvar credenciais'} />
      </form>
    </Section>
  );
}

export default function Profile() {
  const { profile, session, updateProfile, setPassword } = useAuth();

  const [nome,     setNome]     = useState(profile?.nome     || '');
  const [cargo,    setCargo]    = useState(profile?.cargo    || '');
  const [telefone, setTelefone] = useState(profile?.telefone || '');
  const [bio,      setBio]      = useState(profile?.bio      || '');
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoMsg, setInfoMsg] = useState(null);

  // Sincroniza quando o perfil termina de carregar.
  useEffect(() => {
    if (!profile) return;
    if (profile.nome     && !nome)     setNome(profile.nome);
    if (profile.cargo    && !cargo)    setCargo(profile.cargo);
    if (profile.telefone && !telefone) setTelefone(profile.telefone);
    if (profile.bio      && !bio)      setBio(profile.bio);
  }, [profile]);

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
    const { error } = await updateProfile({
      nome:     nome.trim(),
      cargo:    cargo.trim(),
      telefone: telefone.trim(),
      bio:      bio.trim(),
    });
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

      <AvatarSection profile={profile} updateProfile={updateProfile} />

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
          <div className="form-group">
            <label className="form-label">Telefone</label>
            <input
              className="form-control"
              type="tel"
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Bio</label>
            <textarea
              className="form-control"
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Uma frase rápida sobre você (opcional)"
              rows={3}
              maxLength={200}
              style={{ resize: 'vertical' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
              {bio.length}/200
            </div>
          </div>
          <Alert type={infoMsg?.type} msg={infoMsg?.text} />
          <SaveBtn loading={infoLoading} />
        </form>
      </Section>

      <MaxtrackSection profile={profile} session={session} updateProfile={updateProfile} />

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
