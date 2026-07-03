// deno-lint-ignore-file
import { useState, useEffect } from 'react';
import { useToast } from '../../hooks/useToast.jsx';
import { supabase } from '../../supabase.js';

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

// /admin/ia — provedor/modelo de IA e respectivas chaves de API.
export default function AiCredentials() {
  const toast = useToast();

  const [cfg, setCfg]             = useState(AI_CONFIG_DEFAULT);
  const [savedCfg, setSavedCfg]   = useState(AI_CONFIG_DEFAULT);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);

  // Por provedor: { configured: bool, apiKey: string (input), saving: bool }
  const [provState, setProvState] = useState({
    anthropic: { configured: false, apiKey: '', saving: false },
    google:    { configured: false, apiKey: '', saving: false },
    mistral:   { configured: false, apiKey: '', saving: false },
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
        mistral:   { ...prev.mistral,   configured: configured.has('mistral') },
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
      const providerLabel = provider === 'anthropic' ? 'Anthropic' : provider === 'google' ? 'Google' : 'Mistral';
      toast(`Chave do ${providerLabel} salva`, 'success');
    } catch (err) {
      toast('Erro ao salvar chave: ' + err.message, 'error');
      setProvState(prev => ({ ...prev, [provider]: { ...prev[provider], saving: false } }));
    }
  };

  if (loadingCfg) return null;

  return (
    <div className="fz-in" style={{ maxWidth: 720, width: '100%' }}>
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

      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-scan"></i> OCR de Documentos (Mistral)</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
          Chave usada exclusivamente para leitura de documentos do motorista (CNH, ASO, Polissonografia) na aba Documentos do Dossiê. Independente do provedor de laudo escolhido acima.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label" htmlFor="api-key-mistral">Mistral (OCR)</label>
            <input
              id="api-key-mistral"
              className="form-control"
              type="password"
              value={provState.mistral.apiKey}
              onChange={e => setProvState(prev => ({ ...prev, mistral: { ...prev.mistral, apiKey: e.target.value } }))}
              placeholder={provState.mistral.configured ? '••••••••  (chave configurada, digite nova para alterar)' : 'Chave de API da Mistral'}
              disabled={provState.mistral.saving}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => saveProviderKey('mistral')}
            disabled={provState.mistral.saving || !provState.mistral.apiKey.trim()}
            style={{ flexShrink: 0 }}
          >
            {provState.mistral.saving ? <><i className="ti ti-loader-2"></i> Salvando…</> : <><i className="ti ti-key"></i> {provState.mistral.configured ? 'Substituir' : 'Salvar'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
