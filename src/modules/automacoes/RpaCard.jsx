import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useToast } from '../../hooks/useToast.jsx';
import { supabase } from '../../supabase.js';

const RPA_CONFIG_DEFAULT = {
  enabled: false,
  interval_minutes: 30,
  platforms: ['maxtrack'],
  last_run_at: null,
  last_run_status: null,
  last_run_message: null,
};

export default function RpaCard() {
  const toast = useToast();

  const [config, setConfig]         = useState(RPA_CONFIG_DEFAULT);
  const [savedConfig, setSavedConfig] = useState(RPA_CONFIG_DEFAULT);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig]   = useState(false);

  const [credEmail, setCredEmail]           = useState('');
  const [credEmailCurrent, setCredEmailCurrent] = useState('');
  const [credPass, setCredPass]             = useState('');
  const [credConfigured, setCredConfigured] = useState(false);
  const [savingCred, setSavingCred]         = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Carrega rpa_config
    supabase.from('app_settings').select('value').eq('key', 'rpa_config').maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const v = { ...RPA_CONFIG_DEFAULT, ...(data?.value || {}) };
        setConfig(v);
        setSavedConfig(v);
        setLoadingConfig(false);
      });

    // Verifica credenciais do robô
    supabase.from('rpa_credentials').select('email').eq('platform_id', 'maxtrack').maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCredEmailCurrent(data.email || '');
        setCredEmail(data.email || '');
        setCredConfigured(true);
      });

    return () => { cancelled = true; };
  }, []);

  const configDirty = config.enabled !== savedConfig.enabled ||
                      config.interval_minutes !== savedConfig.interval_minutes;

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const next = { ...savedConfig, enabled: config.enabled, interval_minutes: config.interval_minutes };
      const { error } = await supabase.from('app_settings').upsert({
        key: 'rpa_config',
        value: next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      if (error) throw error;
      setSavedConfig(next);
      toast(config.enabled ? 'Robô ativado' : 'Robô desativado', config.enabled ? 'success' : 'info');
    } catch (err) {
      toast('Erro ao salvar configuração: ' + err.message, 'error');
    }
    setSavingConfig(false);
  };

  const saveCred = async () => {
    const email = credEmail.trim();
    if (!email || !credPass) return;
    setSavingCred(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('rpa_credentials').upsert(
        { platform_id: 'maxtrack', email, password: credPass, updated_at: new Date().toISOString(), updated_by: user?.id },
        { onConflict: 'platform_id' },
      );
      if (error) throw error;
      setCredEmailCurrent(email);
      setCredConfigured(true);
      setCredPass('');
      toast('Credenciais Maxtrack salvas', 'success');
    } catch (err) {
      toast('Erro ao salvar credenciais: ' + err.message, 'error');
    }
    setSavingCred(false);
  };

  const fmtLastRun = (iso) => {
    if (!iso) return null;
    const d = new Date(iso), now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 2)    return 'agora mesmo';
    if (diff < 60)   return `há ${diff} min`;
    if (diff < 1440) return `há ${Math.floor(diff / 60)}h`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const STATUS_COLOR = { success: 'var(--success-500, #1a7a3a)', error: 'var(--danger-500)', running: '#b45309' };
  const STATUS_LABEL = { success: 'OK', error: 'Erro', running: 'Rodando' };

  if (loadingConfig) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">
          <i className="ti ti-robot"></i> Automação RPA
          {config.enabled && (
            <span style={{ fontSize: 10, background: 'var(--success-500, #1a7a3a)', color: '#fff', borderRadius: 4, padding: '2px 6px', marginLeft: 8, fontWeight: 700, letterSpacing: 0.4 }}>
              ATIVO
            </span>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
        Robô Playwright na VPS que baixa o relatório Maxtrack automaticamente e alimenta o Monitor.
      </div>

      {config.last_run_at && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 12px', background: 'var(--surface-1, rgba(255,255,255,0.04))', borderRadius: 6, flexWrap: 'wrap' }}>
          <i className="ti ti-clock" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}></i>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            Última execução: <strong style={{ color: 'var(--text-primary)' }}>{fmtLastRun(config.last_run_at)}</strong>
          </span>
          {config.last_run_status && (
            <span style={{ fontSize: 10, background: STATUS_COLOR[config.last_run_status] || 'var(--text-muted)', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
              {STATUS_LABEL[config.last_run_status] || config.last_run_status}
            </span>
          )}
          {config.last_run_status === 'error' && config.last_run_message && (
            <span style={{ fontSize: 11, color: 'var(--danger-500)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={config.last_run_message}>
              {config.last_run_message}
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="form-label" style={{ marginBottom: 0 }}>Estado do robô</label>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            style={{ background: config.enabled ? 'var(--success-500, #1a7a3a)' : 'var(--surface-2, #3a3a3a)', color: '#fff', border: 'none', minWidth: 80 }}
          >
            {config.enabled ? <><i className="ti ti-player-play"></i> Ligado</> : <><i className="ti ti-player-pause"></i> Desligado</>}
          </button>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" htmlFor="sync-interval">Intervalo de atualização</label>
          <select
            id="sync-interval"
            className="form-control"
            style={{ width: 'auto' }}
            value={config.interval_minutes}
            onChange={e => setConfig(prev => ({ ...prev, interval_minutes: Number(e.target.value) }))}
          >
            <option value={15}>15 minutos</option>
            <option value={30}>30 minutos</option>
            <option value={60}>1 hora</option>
            <option value={120}>2 horas</option>
          </select>
        </div>

        {configDirty && (
          <button type="button" className="btn btn-primary btn-sm" onClick={saveConfig} disabled={savingConfig} style={{ flexShrink: 0 }}>
            {savingConfig ? <><i className="ti ti-loader-2"></i> Salvando…</> : <><i className="ti ti-device-floppy"></i> Salvar</>}
          </button>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Credenciais Maxtrack
        </div>

        {credConfigured && credEmailCurrent && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            <i className="ti ti-check" style={{ color: 'var(--success-500, #1a7a3a)', marginRight: 4 }}></i>
            Conta configurada: <strong style={{ color: 'var(--text-primary)' }}>{credEmailCurrent}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <label className="form-label" htmlFor="rpa-email">E-mail</label>
            <input
              id="rpa-email"
              className="form-control"
              type="email"
              placeholder="rpa@empresa.com.br"
              value={credEmail}
              onChange={e => setCredEmail(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <label className="form-label" htmlFor="rpa-pass">Senha</label>
            <input
              id="rpa-pass"
              className="form-control"
              type="password"
              placeholder="••••••••"
              value={credPass}
              onChange={e => setCredPass(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={savingCred || !credEmail.trim() || !credPass}
            onClick={saveCred}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {savingCred ? <><i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }}></i> Gravando…</> : <><i className="ti ti-key-off"></i> Gravar senha</>}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          Use uma conta dedicada ao robô — não a conta pessoal. Lida apenas pelo serviço na VPS via chave de serviço.
        </div>
      </div>
    </div>
  );
}
