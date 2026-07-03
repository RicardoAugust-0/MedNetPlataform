import { useState, useEffect } from 'react';
import Modal from '../../components/Modal';
import { useAuth } from '../../auth/AuthContext.jsx';

import { useToast } from '../../hooks/useToast.jsx';


const ICON_OPTIONS = [
  'ti-robot', 'ti-cloud-download', 'ti-bolt', 'ti-mail-bolt', 'ti-database',
  'ti-file-spreadsheet', 'ti-refresh', 'ti-world', 'ti-brand-whatsapp', 'ti-report',
  'ti-clock-play', 'ti-shield-bolt', 'ti-api', 'ti-server-cog', 'ti-download', 'ti-send',
];

const EVENT_OPTIONS = [
  'Alerta NV3 (sonolência grave)',
  'Alerta crítico NV4',
  'Novo alerta de fadiga',
  'Início de jornada',
  'Câmera obstruída',
];

function triggerLabelFor(a) {
  if (a.trigger === 'agendado') return 'Agendado · ' + (a.schedule || 'definir');
  if (a.trigger === 'evento') return a.eventType ? a.eventType : 'Por evento de alerta';
  return 'Manual';
}

function VpsStrip({ vpsHealth, vncUrl, onOpenVnc }) {
  if (vpsHealth.checking && !vpsHealth.data) {
    return (
      <div className="vps-strip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)' }}>
          <i className="ti ti-loader-2" style={{ animation: 'spin 1s linear infinite' }}></i>
          Verificando conexão com a VPS...
        </div>
      </div>
    );
  }

  if (vpsHealth.error || !vpsHealth.data) {
    return (
      <div className="vps-strip" style={{ borderColor: 'var(--danger-500)', background: 'var(--danger-bg)' }}>
        <div className="vps-id">
          <div className="vps-badge" style={{ background: 'var(--danger-500)', boxShadow: 'none' }}>
            <i className="ti ti-server-off"></i>
          </div>
          <div>
            <div className="vps-name" style={{ color: 'var(--danger-600)' }}>VPS Desconectada</div>
            <div className="vps-host" style={{ color: 'var(--danger-600)', opacity: 0.85 }}>
              {vpsHealth.error || 'Healthcheck inativo ou offline'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { label, host, region, latencyMs, uptimeDays, cpu, ram } = vpsHealth.data;

  return (
    <div className="vps-strip">
      <div className="vps-id">
        <div className="vps-badge"><i className="ti ti-server-2"></i></div>
        <div>
          <div className="vps-name">
            {label} 
            <span className="vps-online">
              <span className="d"></span> Online
            </span>
          </div>
          <div className="vps-host">{host} · {region}</div>
        </div>
      </div>
      <div className="vps-divider"></div>
      <div className="vps-metrics">
        <div className="vps-metric"><span className="v">{latencyMs}ms</span><span className="l">Latência</span></div>
        <div className="vps-metric"><span className="v">{uptimeDays}d</span><span className="l">Uptime</span></div>
        <div className="vps-metric">
          <span className="v">{cpu}%</span><span className="l">CPU</span>
          <div className="vps-bar"><span style={{ width: cpu + '%' }}></span></div>
        </div>
        <div className="vps-metric">
          <span className="v">{ram}%</span><span className="l">RAM</span>
          <div className="vps-bar"><span style={{ width: ram + '%' }}></span></div>
        </div>
      </div>
      {vncUrl && (
        <>
          <div className="vps-divider"></div>
          <button className="btn btn-secondary btn-sm" onClick={onOpenVnc} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-device-desktop"></i>
            <span>Ver Tela (VNC)</span>
          </button>
        </>
      )}
    </div>
  );
}

function HookCard({ hook, logs = [], onToggle, onRun, onConfig, onOpenLog }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const active = hook.active;

  const runsToday = logs.filter(l => {
    const logDate = new Date(l.date);
    const today = new Date();
    return logDate.toDateString() === today.toDateString();
  }).length;

  const totalRuns = logs.length;
  const successRate = totalRuns > 0 
    ? Math.round((logs.filter(l => l.status === 'success').length / totalRuns) * 100)
    : null;

  const lastRun = logs[0] || null;

  const runNow = async () => {
    if (!active || running) return;
    setRunning(true);
    await onRun(hook.id, profile?.nome || 'Operador');
    setRunning(false);
  };

  const copyEndpoint = () => {
    navigator.clipboard?.writeText(hook.endpoint);
    toast('Endpoint do webhook copiado!', 'success');
  };

  return (
    <div className={`hook-card ${active ? '' : 'off'}`}>
      <div className="hook-top">
        <div className="hook-icon"><i className={`ti ${hook.icon}`}></i></div>
        <div className="hook-head">
          <div className="hook-name">{hook.name}</div>
          <div className="hook-desc">{hook.desc}</div>
        </div>
        <div className="hook-cog">
          <button className="btn-icon" title="Configurar" onClick={() => onConfig(hook)}><i className="ti ti-settings"></i></button>
          <label className="switch" title={active ? 'Desativar' : 'Ativar'}>
            <input type="checkbox" checked={active} onChange={() => onToggle(hook.id, { active: !active })} />
            <span className="track"></span>
            <span className="knob"></span>
          </label>
        </div>
      </div>

      <div className="hook-meta">
        <span className={`trigger-tag trigger-${hook.trigger}`}>
          <i className={`ti ${hook.trigger === 'agendado' ? 'ti-clock' : hook.trigger === 'evento' ? 'ti-bolt' : 'ti-hand-finger'}`}></i>
          {triggerLabelFor(hook)}
        </span>
        <span className="hook-stat"><i className="ti ti-rotate-clockwise-2"></i> <b>{runsToday}</b> hoje</span>
        <span className="hook-stat"><i className="ti ti-circle-check"></i> <b>{successRate == null ? '—' : successRate + '%'}</b> sucesso</span>
      </div>

      {lastRun ? (
        <div className="hook-lastrun">
          <div className={`lr-icon ${lastRun.status === 'success' ? 'ok' : (lastRun.status === 'running' ? 'running-icon' : 'err')}`}>
            <i className={`ti ${lastRun.status === 'success' ? 'ti-check' : (lastRun.status === 'running' ? 'ti-loader-2' : 'ti-alert-triangle')}`} style={lastRun.status === 'running' ? { animation: 'spin 1s linear infinite' } : null}></i>
          </div>
          <div className="lr-body">
            <div className="lr-title">{lastRun.status === 'success' ? 'Última execução concluída' : (lastRun.status === 'running' ? 'Automação em andamento...' : 'Falha na última execução')}</div>
            <div className="lr-sub">{lastRun.detail} {lastRun.dur ? `· ${lastRun.dur}` : ''}</div>
          </div>
          <div className="lr-time">{lastRun.when.split(' ')[1] || lastRun.when}</div>
        </div>
      ) : (
        <div className="hook-lastrun idle">
          <div className="lr-icon idle"><i className="ti ti-player-track-next"></i></div>
          <div className="lr-body">
            <div className="lr-title">Ainda não executada</div>
            <div className="lr-sub">Aguardando primeiro disparo</div>
          </div>
          <div className="lr-time">—</div>
        </div>
      )}

      <div className="hook-actions">
        <button className="hook-endpoint" onClick={copyEndpoint} title="Copiar endpoint do webhook">
          <i className="ti ti-link"></i><span>{hook.endpoint}</span><i className="ti ti-copy" style={{ marginLeft: 'auto' }}></i>
        </button>
        <button className="btn btn-primary btn-sm" disabled={!active || running} onClick={runNow} style={!active || running ? { opacity: .55, cursor: 'not-allowed' } : null}>
          <i className={`ti ${running ? 'ti-loader-2' : 'ti-player-play'}`} style={running ? { animation: 'spin 1s linear infinite' } : null}></i>
          {running ? 'Executando…' : 'Executar agora'}
        </button>
      </div>

      {logs.length > 0 && (
        <div className="hook-logs">
          <div className="logs-head" style={{ marginBottom: 4 }}>
            <span className="t-label">Log recente</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => onOpenLog(hook)}>
              Ver tudo <i className="ti ti-arrow-right"></i>
            </button>
          </div>
          {(logs[0]?.logs || []).slice(0, 4).map((l, i) => (
            <div className="log-line" key={i}>
              <span className="lt">{l.t}</span>
              <span className={`ld ${l.lvl}`}></span>
              <span className="lm">{l.m}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HookDrawer({ hook, logs = [], onClose }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div className="hook-icon" style={{ width: 36, height: 36, fontSize: 18 }}><i className={`ti ${hook.icon}`}></i></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="drawer-title" className="hook-name" style={{ fontSize: 13.5, margin: 0 }}>{hook.name}</h3>
            <div className="lr-sub">{triggerLabelFor(hook)}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar drawer de logs"><i className="ti ti-x"></i></button>
        </div>
        <div className="drawer-body">
          <div className="t-label" style={{ marginBottom: 10 }}>Histórico de execuções</div>
          {logs.length === 0 ? (
            <div className="empty-hint">Sem execuções registradas ainda</div>
          ) : (
            <div className="drawer-log">
              {logs.map((runLog) => (
                <div key={runLog.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`ld ${runLog.status === 'success' ? 'ok' : (runLog.status === 'running' ? 'info' : 'err')}`} style={{ width: 8, height: 8 }}></span>
                      {runLog.status === 'success' ? 'Sucesso' : (runLog.status === 'running' ? 'Em andamento' : 'Falha')} · {runLog.detail}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{runLog.when} {runLog.dur ? `(${runLog.dur})` : ''}</span>
                  </div>
                  {runLog.logs.map((l, i) => (
                    <div className="log-line" key={i} style={{ paddingLeft: 14 }}>
                      <span className="lt">{l.t}</span>
                      <span className={`ld ${l.lvl}`}></span>
                      <span className="lm">{l.m}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="drawer-foot">
          <button className="btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}><i className="ti ti-x"></i> Fechar</button>
        </div>
      </aside>
    </>
  );
}

function AutomationModal({ automation, onSave, onDelete, onClose }) {
  const isNew = !automation;
  const [name, setName] = useState(automation?.name || '');
  const [desc, setDesc] = useState(automation?.desc || '');
  const [icon, setIcon] = useState(automation?.icon || 'ti-robot');
  const [endpoint, setEndpoint] = useState(automation?.endpoint || 'https://botsplaywright.duckdns.org/automacoes/');
  const [trigger, setTrigger] = useState(automation?.trigger || 'manual');
  const [schedule, setSchedule] = useState(automation?.schedule || '');
  const [eventType, setEventType] = useState(automation?.eventType || EVENT_OPTIONS[0]);
  const [token, setToken] = useState(automation?.token || '');
  const [active, setActive] = useState(automation?.active ?? true);

  const canSave = name.trim() && endpoint.trim() && (trigger !== 'agendado' || schedule.trim());

  const save = () => {
    if (!canSave) return;
    onSave({ 
      name: name.trim(), 
      desc: desc.trim(), 
      icon, 
      endpoint: endpoint.trim(), 
      trigger, 
      schedule: trigger === 'agendado' ? schedule.trim() : null, 
      eventType: trigger === 'evento' ? eventType : null, 
      token: token.trim() || null, 
      active 
    });
  };

  return (
    <Modal open onClose={onClose} width={650} labelledBy="hooks-config-modal-title">
        <div className="modal-header">
          <div className="modal-title" id="hooks-config-modal-title"><i className="ti ti-settings"></i> {isNew ? 'Nova automação' : 'Configurar ' + automation.name}</div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Bot_Maxtrack" />
            </div>
            <div className="form-group">
              <label className="form-label">Ícone</label>
              <div className="icon-pick">
                {ICON_OPTIONS.map(ic => (
                  <div key={ic} className={`icon-opt ${icon === ic ? 'active' : ''}`} onClick={() => setIcon(ic)}><i className={`ti ${ic}`}></i></div>
                ))}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-control" value={desc} onChange={e => setDesc(e.target.value)} placeholder="O que essa automação faz…" />
          </div>

          <div className="form-group">
            <label className="form-label">Endpoint do webhook (VPS)</label>
            <input className="form-control mono" value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://sua-vps/hooks/nome" />
            <div className="field-hint"><i className="ti ti-info-circle"></i> A automação é registrada na plataforma; a execução roda na sua VPS através deste endpoint.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Gatilho</label>
            <div className="seg" style={{ width: '100%' }}>
              {[['manual', 'Manual'], ['agendado', 'Agendado'], ['evento', 'Por evento']].map(([v, l]) => (
                <button key={v} className={trigger === v ? 'active' : ''} style={{ flex: 1 }} onClick={() => setTrigger(v)}>{l}</button>
              ))}
            </div>
            {trigger === 'agendado' && (
              <div style={{ marginTop: 10 }}>
                <input className="form-control" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="Ex: diário às 06:00 · a cada 15 min" />
              </div>
            )}
            {trigger === 'evento' && (
              <div style={{ marginTop: 10 }}>
                <select className="form-control" value={eventType} onChange={e => setEventType(e.target.value)}>
                  {EVENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Token de autenticação <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
            <input className="form-control mono" value={token} onChange={e => setToken(e.target.value)} placeholder="Segredo enviado no header da requisição" />
          </div>

          <div className="toggle-row">
            <div className="tr-body">
              <div className="tr-title">Automação ativa</div>
              <div className="tr-sub">Quando desativada, não dispara nem aceita execução.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={active} onChange={() => setActive(!active)} />
              <span className="track"></span>
              <span className="knob"></span>
            </label>
          </div>
        </div>

        <div className="modal-footer">
          {!isNew && <button className="btn-icon danger" title="Remover automação" onClick={() => onDelete(automation.id)}><i className="ti ti-trash"></i></button>}
          <div className="spacer"></div>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={save} style={!canSave ? { opacity: .55, cursor: 'not-allowed' } : null}>
            <i className="ti ti-check"></i> {isNew ? 'Adicionar' : 'Salvar'}
          </button>
        </div>
    </Modal>
  );
}

export function HooksTab({ automations, logs, vpsHealth, vncUrl, onOpenVnc, onRun, onToggle, onSave, onDelete }) {
  const [activeSubTab, setActiveSubTab] = useState('vps'); // 'vps', 'whatsapp'
  const [drawer, setDrawer] = useState(null);
  const [modal, setModal] = useState(null);

  const toast = useToast();
  const { profile, session } = useAuth();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const authHeader = () => ({ Authorization: `Bearer ${session?.access_token}` });

  const getWebhookUrl = () => {
    if (API_URL.startsWith('http://') || API_URL.startsWith('https://')) {
      return `${API_URL.replace(/\/$/, '')}/api/whatsapp/webhook`;
    }
    const origin = window.location.origin;
    const cleanApiUrl = API_URL.trim() === '' ? '' : (API_URL.startsWith('/') ? API_URL : `/${API_URL}`);
    return `${origin.replace(/\/$/, '')}${cleanApiUrl.replace(/\/$/, '')}/api/whatsapp/webhook`;
  };
  const webhookUrl = getWebhookUrl();

  // WhatsApp credentials state
  const [credentials, setCredentials] = useState({
    token: '',
    phone_number_id: '',
    whatsapp_business_account_id: ''
  });
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const fetchCredentials = async () => {
    setLoadingCreds(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/credentials`, { headers: authHeader() });
      if (!res.ok) throw new Error('Falha ao carregar credenciais.');
      const data = await res.json();
      setCredentials({
        token: data.id ? '••••••••••••••••••••••••' : '',
        phone_number_id: data.phone_number_id || '',
        whatsapp_business_account_id: data.whatsapp_business_account_id || ''
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCreds(false);
    }
  };

  const saveCredentials = async () => {
    if (!credentials.phone_number_id || !credentials.whatsapp_business_account_id) {
      toast('Por favor, preencha todos os campos.', 'error');
      return;
    }

    setSavingCreds(true);
    try {
      const payload = {
        phone_number_id: credentials.phone_number_id.trim(),
        whatsapp_business_account_id: credentials.whatsapp_business_account_id.trim(),
        userId: profile?.id
      };

      if (credentials.token && credentials.token !== '••••••••••••••••••••••••') {
        payload.token = credentials.token.trim();
      } else if (!credentials.token) {
        toast('O token de acesso permanente é obrigatório.', 'error');
        setSavingCreds(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/whatsapp/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao salvar credenciais.');
      }

      toast('Credenciais salvas com sucesso!', 'success');
      fetchCredentials();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingCreds(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'whatsapp') {
      fetchCredentials();
    }
  }, [activeSubTab]);

  const save = (data) => {
    onSave(modal === 'new' ? null : modal.id, data);
    setModal(null);
  };

  const copyText = (text, message) => {
    navigator.clipboard?.writeText(text);
    toast(message || 'Copiado para a área de transferência!', 'success');
  };

  return (
    <div>
      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '20px', width: '100%' }}>
        <div className="seg">
          <button
            className={activeSubTab === 'vps' ? 'active' : ''}
            onClick={() => setActiveSubTab('vps')}
          >
            <i className="ti ti-server"></i> Automações VPS (Hooks de Saída)
          </button>
          <button
            className={activeSubTab === 'whatsapp' ? 'active' : ''}
            onClick={() => setActiveSubTab('whatsapp')}
          >
            <i className="ti ti-brand-whatsapp"></i> WhatsApp Cloud API & Webhook (Entrada)
          </button>
        </div>
      </div>

      {/* SUBTAB 1: VPS AUTOMATIONS (HOOKS DE SAÍDA) */}
      {activeSubTab === 'vps' && (
        <div className="fz-in">
          <div className="explainer-card">
            <i className="ti ti-info-circle"></i>
            <div className="explainer-card-body">
              <h4 className="explainer-title">Automações via VPS (Webhooks de Saída)</h4>
              <p className="explainer-desc">
                Configure gatilhos na plataforma MedNet (por exemplo, quando um alerta crítico de fadiga nível 3 ou 4 for gerado) para disparar rotinas externas em sua VPS. O sistema enviará uma requisição POST HTTP para a URL cadastrada de cada automação.
              </p>
            </div>
          </div>

          <VpsStrip vpsHealth={vpsHealth} vncUrl={vncUrl} onOpenVnc={onOpenVnc} />

          <div className="hooks-toolbar">
            <span className="ht-label"><b>{automations.filter(a => a.active).length}</b> de {automations.length} automações ativas</span>
            <button className="btn btn-primary" onClick={() => setModal('new')}><i className="ti ti-plus"></i> Nova automação</button>
          </div>

          <div className="hooks-grid">
            {automations.map(h => (
              <HookCard
                key={h.id}
                hook={h}
                logs={logs[h.id] || []}
                onToggle={onToggle}
                onRun={onRun}
                onConfig={setModal}
                onOpenLog={setDrawer}
              />
            ))}
            <div className="hook-add" onClick={() => setModal('new')}>
              <i className="ti ti-plus"></i>
              <div className="ha-title">Adicionar automação</div>
              <div className="ha-sub">Registre um hook da sua VPS</div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: WHATSAPP API & WEBHOOK (CREDENCIAIS & RETORNO META) */}
      {activeSubTab === 'whatsapp' && (
        <div className="fz-in">
          <div className="explainer-card" style={{ marginBottom: '24px' }}>
            <i className="ti ti-info-circle"></i>
            <div className="explainer-card-body">
              <h4 className="explainer-title">WhatsApp Cloud API & Webhook (Mensagens e Status)</h4>
              <p className="explainer-desc">
                Preencha as chaves oficiais da Meta para que a plataforma MedNet envie notificações ativas pelo WhatsApp. Registre a URL de Webhook abaixo no painel de desenvolvedores do Facebook para capturar confirmações de envio, entrega e leitura dos operadores em tempo real.
              </p>
            </div>
          </div>

          {loadingCreds ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <i className="ti ti-loader-2" style={{ fontSize: 24, animation: 'spin 1s linear infinite', display: 'block', marginBottom: 8, color: 'var(--accent-50)' }}></i>
              Carregando credenciais...
            </div>
          ) : (
            <div className="disparos-split-layout">
              {/* Left Column: Meta Cloud API Credentials Form */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                <div className="card-header pb-3 border-b border-[var(--border)]" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 0 }}>
                  <div className="card-title">
                    <i className="ti ti-key" style={{ color: 'var(--accent-500)', fontSize: '18px' }}></i>
                    <span>Credenciais de Acesso à API Cloud (Meta)</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">ID do Número de Telefone (Phone Number ID)</label>
                    <input
                      className="form-control mono"
                      value={credentials.phone_number_id}
                      onChange={e => setCredentials(prev => ({ ...prev, phone_number_id: e.target.value }))}
                      placeholder="Ex: 102938475610293"
                    />
                    <span className="field-hint">
                      <i className="ti ti-info-circle"></i>
                      O identificador único associado ao seu número de telefone de disparo, obtido no painel de desenvolvedores da Meta.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">ID da Conta do WhatsApp Business (WABA ID)</label>
                    <input
                      className="form-control mono"
                      value={credentials.whatsapp_business_account_id}
                      onChange={e => setCredentials(prev => ({ ...prev, whatsapp_business_account_id: e.target.value }))}
                      placeholder="Ex: 92837461524354"
                    />
                    <span className="field-hint">
                      <i className="ti ti-info-circle"></i>
                      O identificador da conta comercial do WhatsApp Business no painel de gerenciador de negócios.
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Token de Acesso Permanente (System User Access Token)</label>
                    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                      <input
                        className="form-control mono"
                        type={showToken ? 'text' : 'password'}
                        value={credentials.token}
                        onChange={e => setCredentials(prev => ({ ...prev, token: e.target.value }))}
                        placeholder="EAABw..."
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-icon-only"
                        onClick={() => setShowToken(!showToken)}
                        type="button"
                        style={{ height: '38px', width: '38px', justifyContent: 'center' }}
                      >
                        <i className={`ti ${showToken ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize: '15px' }}></i>
                      </button>
                    </div>
                    <span className="field-hint">
                      <i className="ti ti-info-circle"></i>
                      Token de acesso permanente gerado para o Usuário do Sistema dentro do gerenciador comercial da sua empresa na Meta.
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '20px', flexWrap: 'wrap', gap: '16px' }} className="form-footer-wrap">
                  <span className="field-hint" style={{ marginTop: 0 }}>
                    <i className="ti ti-shield-check" style={{ color: 'var(--success-500)', fontSize: '14px' }}></i>
                    Suas credenciais são transmitidas de forma criptografada e armazenadas com segurança.
                  </span>

                  <button
                    className="btn btn-primary"
                    onClick={saveCredentials}
                    disabled={savingCreds}
                  >
                    <i className={`ti ${savingCreds ? 'ti-loader-2 animate-spin' : 'ti-device-floppy'}`}></i>
                    {savingCreds ? 'Gravando...' : 'Salvar Credenciais'}
                  </button>
                </div>
              </div>

              {/* Right Column: Webhook Details Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="card-header pb-2 border-b border-[var(--border)]" style={{ marginBottom: 0 }}>
                    <div className="card-title" style={{ fontSize: '12.5px' }}>
                      <i className="ti ti-info-circle" style={{ color: 'var(--accent-500)', fontSize: '16px' }}></i>
                      <span>Retorno do Webhook (Meta)</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '10px', lineHeight: '1.45' }}>
                    <p style={{ margin: 0 }}>Para registrar a entrega e leitura de disparos em tempo real, configure o Webhook no painel de desenvolvedores da Meta:</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '9px' }}>URL de Callback</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input className="form-control mono" readOnly value={webhookUrl} style={{ fontSize: '10.5px', padding: '6px 8px', flex: 1 }} />
                          <button className="btn btn-icon-only btn-sm" style={{ height: '30px', width: '30px' }} onClick={() => copyText(webhookUrl, 'URL de Callback copiada!')} title="Copiar URL"><i className="ti ti-copy" style={{ fontSize: '12px' }}></i></button>
                        </div>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '9px' }}>Token de Verificação</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input className="form-control mono" readOnly value="mednet_verify_token" style={{ fontSize: '10.5px', padding: '6px 8px', flex: 1 }} />
                          <button className="btn btn-icon-only btn-sm" style={{ height: '30px', width: '30px' }} onClick={() => copyText('mednet_verify_token', 'Token de verificação copiado!')} title="Copiar Token"><i className="ti ti-copy" style={{ fontSize: '12px' }}></i></button>
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                      <p style={{ margin: 0, fontWeight: 'bold', fontSize: '11px', color: 'var(--text-primary)' }}>Campos Requeridos:</p>
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>No painel da Meta, assine a opção <b>messages</b> nas configurações de Webhook do produto WhatsApp.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {drawer && <HookDrawer hook={drawer} logs={logs[drawer.id] || []} onClose={() => setDrawer(null)} />}
      {modal && <AutomationModal automation={modal === 'new' ? null : modal} onSave={save} onDelete={onDelete} onClose={() => setModal(null)} />}
    </div>
  );
}

export function VncModal({ vncUrl, onStopBot, onClose }) {
  const iframeUrl = `${vncUrl}/vnc.html?autoconnect=true&resize=scale&quality=6&compression=7`;

  return (
    <Modal open onClose={onClose} width={960} labelledBy="vnc-modal-title">
        <div className="modal-header">
          <div className="modal-title" id="vnc-modal-title"><i className="ti ti-device-desktop"></i> Transmissão de Tela da VPS (noVNC)</div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body" style={{ padding: 0, background: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <iframe
            src={iframeUrl}
            title="VNC Stream"
            style={{ width: '100%', height: '580px', border: 'none', background: '#000' }}
            allow="fullscreen"
          />
        </div>
        <div className="modal-footer">
          <div className="field-hint" style={{ marginTop: 0 }}>
            <i className="ti ti-info-circle"></i> Use esta tela para digitar, clicar e resolver o Captcha caso o robô Horizon trave.
          </div>
          <div className="spacer"></div>
          {onStopBot && (
            <button className="btn btn-danger" onClick={onStopBot} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8, background: 'var(--danger-500)', borderColor: 'var(--danger-500)', color: '#fff' }}>
              <i className="ti ti-player-stop"></i> Parar Robô
            </button>
          )}
          <button className="btn btn-primary" onClick={onClose}><i className="ti ti-check"></i> Concluir</button>
        </div>
    </Modal>
  );
}
