// deno-lint-ignore-file
import { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast.jsx';
import { supabase } from '../../supabase.js';

// /admin/integracoes/credenciais — configuração técnica da integração OmniLink.
export default function IntegracoesCredenciais() {
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
    <div className="fz-in" style={{ maxWidth: 720, width: '100%' }}>
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
    </div>
  );
}
