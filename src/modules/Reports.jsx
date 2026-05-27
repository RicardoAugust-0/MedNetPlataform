// deno-lint-ignore-file
import { useState, useEffect } from 'react';
import { supabase, getFunctionErrorMessage } from '../supabase.js';
import { useToast } from '../hooks/useToast.jsx';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';

// Espelhado em Admin.jsx (AiCredentialsCard)
const AI_PROVIDERS = [
  {
    id: 'anthropic', label: 'Claude',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 · rápido' },
      { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6 · balanceado' },
      { id: 'claude-opus-4-7',           label: 'Opus 4.7 · melhor qualidade' },
    ],
  },
  {
    id: 'google', label: 'Gemini',
    models: [
      { id: 'gemini-2.0-flash',  label: 'Flash 2.0 · rápido' },
      { id: 'gemini-2.5-flash',  label: 'Flash 2.5 · balanceado' },
      { id: 'gemini-2.5-pro',    label: 'Pro 2.5 · melhor qualidade' },
    ],
  },
];

const PERIOD_OPTS = [
  { value: 1,  label: 'Último mês' },
  { value: 3,  label: 'Últimos 3 meses' },
  { value: 6,  label: 'Últimos 6 meses' },
  { value: 12, label: 'Último ano' },
];

// Converte markdown simples em HTML (sem dependência externa).
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^- (.+)$/gm,  '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>.*?<\/li>(?:<br>)?)+/gs, m => '<ul>' + m.replace(/<br>/g, '') + '</ul>');
  return '<p>' + html + '</p>';
}

export default function Reports() {
  const toast = useToast();
  const { resolveMonitorName } = useCarrierAliases();

  const [transps,        setTransps]        = useState([]);
  const [loadingTransps, setLoadingTransps] = useState(true);
  const [transportadora, setTransportadora] = useState('');
  const [months,         setMonths]         = useState(3);
  const [generating,     setGenerating]     = useState(false);
  const [report,         setReport]         = useState(null);
  const [error,          setError]          = useState(null);

  // Provider + model: carregado do ai_config, sobrescrito pelo usuário para esta geração
  const [provider,  setProvider]  = useState('anthropic');
  const [model,     setModel]     = useState('claude-sonnet-4-6');
  const [aiCfgLoaded, setAiCfgLoaded] = useState(false);

  // Carrega ai_config para inicializar os selectors com os defaults do admin
  useEffect(() => {
    supabase.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle()
      .then(({ data }) => {
        if (!data?.value) { setAiCfgLoaded(true); return; }
        const cfg = data.value;
        const p = cfg.provider || 'anthropic';
        const m = p === 'google' ? (cfg.google_model || 'gemini-2.5-flash') : (cfg.anthropic_model || 'claude-sonnet-4-6');
        setProvider(p);
        setModel(m);
        setAiCfgLoaded(true);
      });
  }, []);

  // Ao trocar provider, seleciona o primeiro modelo disponível
  const handleProviderChange = (p) => {
    setProvider(p);
    const prov = AI_PROVIDERS.find(x => x.id === p);
    if (prov) setModel(prov.models[0].id);
    setReport(null);
  };

  // Carrega transportadoras disponíveis em driver_events
  useEffect(() => {
    supabase.rpc('get_distinct_transportadoras')
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao buscar transportadoras:', error.message);
          return;
        }
        if (!data) return;
        const cleaned = data.map(r => resolveMonitorName(r.transportadora)).filter(Boolean);
        const uniq = [...new Set(cleaned)].sort();
        setTransps(uniq);
        if (uniq.length > 0) setTransportadora(uniq[0]);
        setLoadingTransps(false);
      });
  }, [resolveMonitorName]);

  const generate = async () => {
    if (!transportadora) return;
    setGenerating(true);
    setReport(null);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error: fnErr } = await supabase.functions.invoke('generate-report', {
        body: { transportadora, months, provider, model },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (fnErr) {
        const errMsg = await getFunctionErrorMessage(fnErr);
        throw new Error(errMsg);
      }
      if (data?.error) throw new Error(data.error);

      setReport({ text: data.report, meta: data.meta });
    } catch (err) {
      setError(err.message);
      toast('Erro ao gerar relatório: ' + err.message, 'error');
    }

    setGenerating(false);
  };

  const currentModels = AI_PROVIDERS.find(p => p.id === provider)?.models || [];

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><i className="ti ti-report-analytics"></i> Gerador de Relatório por IA</div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
          Analisa o histórico de <code>driver_events</code> e gera um relatório executivo em linguagem natural, pronto para reuniões com as transportadoras.
        </div>

        {loadingTransps ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}><i className="ti ti-loader-2"></i> Carregando…</div>
        ) : transps.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>
            <i className="ti ti-database-off" style={{ marginRight: 6 }}></i>
            Nenhum dado em <code>driver_events</code>. Importe planilhas pelo Monitor para popular o histórico.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Transportadora */}
            <div className="form-group" style={{ flex: 2, minWidth: 180, marginBottom: 0 }}>
              <label className="form-label">Transportadora</label>
              <select className="form-control" value={transportadora} onChange={e => setTransportadora(e.target.value)} disabled={generating}>
                {transps.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Período */}
            <div className="form-group" style={{ minWidth: 130, marginBottom: 0 }}>
              <label className="form-label">Período</label>
              <select className="form-control" value={months} onChange={e => setMonths(Number(e.target.value))} disabled={generating}>
                {PERIOD_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Provedor */}
            <div className="form-group" style={{ minWidth: 140, marginBottom: 0 }}>
              <label className="form-label">Provedor</label>
              <select className="form-control" value={provider} onChange={e => handleProviderChange(e.target.value)} disabled={generating || !aiCfgLoaded}>
                {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            {/* Modelo */}
            <div className="form-group" style={{ minWidth: 190, marginBottom: 0 }}>
              <label className="form-label">Modelo</label>
              <select className="form-control" value={model} onChange={e => setModel(e.target.value)} disabled={generating || !aiCfgLoaded}>
                {currentModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={generate}
              disabled={generating || !transportadora || !aiCfgLoaded}
              style={{ flexShrink: 0 }}
            >
              {generating
                ? <><i className="ti ti-loader-2"></i> Gerando…</>
                : <><i className="ti ti-sparkles"></i> Gerar relatório</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(220,38,38,0.08)', border: '1px solid var(--danger-500)', color: 'var(--danger-500)', fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
          <i className="ti ti-alert-triangle" style={{ marginRight: 6 }}></i>
          {error}
        </div>
      )}

      {/* Relatório */}
      {report && (
        <div className="card">
          <div className="card-header" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="card-title"><i className="ti ti-file-text"></i> {transportadora}</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 11.5, color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
              {report.meta && (
                <>
                  <span><strong style={{ color: 'var(--text-primary)' }}>{report.meta.totalEventos}</strong> eventos</span>
                  <span><strong style={{ color: 'var(--danger-500)' }}>{report.meta.totalIntervencoes}</strong> intervenções</span>
                  <span><strong style={{ color: 'var(--text-primary)' }}>{report.meta.drivers}</strong> motoristas</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span style={{ color: 'var(--text-muted)' }}>{report.meta.period}</span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                </>
              )}
              {/* Badge do modelo utilizado */}
              <span style={{
                fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                background: (report.meta?.provider === 'google') ? 'rgba(66,133,244,0.12)' : 'rgba(180,85,0,0.12)',
                color:      (report.meta?.provider === 'google') ? '#4285F4'                : '#b45500',
              }}>
                <i className="ti ti-sparkles" style={{ fontSize: 10, marginRight: 3 }}></i>
                {report.meta?.provider === 'google' ? 'Gemini' : 'Claude'} · {currentModels.find(m => m.id === report.meta?.model)?.label?.split(' · ')[0] || report.meta?.model}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { navigator.clipboard?.writeText(report.text); toast('Copiado', 'success'); }}
              style={{ marginLeft: 'auto' }}
              title="Copiar markdown"
            >
              <i className="ti ti-copy"></i> Copiar
            </button>
          </div>

          <div
            className="report-body"
            style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--text-primary)' }}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(report.text) }}
          />
        </div>
      )}
    </div>
  );
}
