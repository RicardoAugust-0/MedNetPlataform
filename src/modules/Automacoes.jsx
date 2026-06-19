import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAutomations } from '../hooks/useAutomations';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast.jsx';
import '../styles/automacoes.css';
import { supabase } from '../supabase.js';

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

  // Compute metrics from real execution logs
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

  return createPortal(
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title"><i className="ti ti-settings"></i> {isNew ? 'Nova automação' : 'Configurar ' + automation.name}</div>
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
      </div>
    </div>,
    document.body
  );
}

function HooksTab({ automations, logs, vpsHealth, vncUrl, onOpenVnc, onRun, onToggle, onSave, onDelete }) {
  const [drawer, setDrawer] = useState(null);
  const [modal, setModal] = useState(null);

  const save = (data) => {
    onSave(modal === 'new' ? null : modal.id, data);
    setModal(null);
  };

  return (
    <div>
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
      {drawer && <HookDrawer hook={drawer} logs={logs[drawer.id] || []} onClose={() => setDrawer(null)} />}
      {modal && <AutomationModal automation={modal === 'new' ? null : modal} onSave={save} onDelete={onDelete} onClose={() => setModal(null)} />}
    </div>
  );
}

function DisparosTab() {
  return (
    <div className="disp-card" style={{ padding: '60px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <i className="ti ti-brand-whatsapp" style={{ fontSize: 52, color: 'var(--text-muted)', opacity: 0.4, display: 'block', marginBottom: 20 }}></i>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Módulo de Disparos em Planejamento</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
        O disparo de mensagens via WhatsApp será realizado de forma <strong>automática e integrada</strong> diretamente na tela do <strong>Monitor de Frota</strong> no momento da tratativa dos alertas de fadiga.
      </p>
      <div style={{ marginTop: 24, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-50)', color: 'var(--accent-700)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 500 }}>
        <i className="ti ti-info-circle"></i> Integração com o fluxo operacional do Monitor em desenvolvimento
      </div>
    </div>
  );
}

function VncModal({ vncUrl, onStopBot, onClose }) {
  const iframeUrl = `${vncUrl}/vnc.html?autoconnect=true&resize=scale&quality=6&compression=7`;

  return createPortal(
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '960px', maxWidth: '95vw' }}>
        <div className="modal-header">
          <div className="modal-title"><i className="ti ti-device-desktop"></i> Transmissão de Tela da VPS (noVNC)</div>
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
      </div>
    </div>,
    document.body
  );
}

export default function Automacoes() {
  const [tab, setTab] = useState('hooks');
  const { automations, logs, loading, vpsHealth, vncUrl, add, update, remove, run, stopRunningTasks, stopAutomationTasks } = useAutomations();
  const confirm = useConfirm();
  const [showVnc, setShowVnc] = useState(false);

  const handleToggle = async (id, patch) => {
    const message = patch.active ? 'Automação ativada' : 'Automação desativada';
    const success = await update(id, patch, { toastMessage: message });
    if (success && !patch.active) {
      await stopAutomationTasks(id);
    }
  };

  const handleSave = async (id, data) => {
    if (id) {
      await update(id, data);
    } else {
      await add(data);
    }
  };

  const handleDelete = async (id) => {
    const auto = automations.find(a => a.id === id);
    if (!auto) return;

    if (await confirm({ 
      title: 'Excluir automação', 
      message: `Tem certeza que deseja excluir a automação "${auto.name}"? Esta ação não pode ser desfeita.`, 
      danger: true 
    })) {
      await remove(id);
    }
  };

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: '70px 20px' }}>
        <i className="ti ti-loader-2" style={{ fontSize: 32, animation: 'spin 1s linear infinite', display: 'block', marginBottom: 12, color: 'var(--accent-500)' }}></i>
        Carregando automações...
      </div>
    );
  }

  return (
    <div className="auto-page">
      <nav className="tabs" aria-label="Abas de Automações">
        <div 
          className={`tab ${tab === 'hooks' ? 'active' : ''}`} 
          onClick={() => setTab('hooks')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('hooks');
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-selected={tab === 'hooks'}
        >
          <i className="ti ti-webhook"></i> Hooks <span className="tab-count">{automations.length}</span>
        </div>
        <div 
          className={`tab ${tab === 'rpa' ? 'active' : ''}`} 
          onClick={() => setTab('rpa')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('rpa');
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-selected={tab === 'rpa'}
        >
          <i className="ti ti-robot"></i> Robô RPA
        </div>
        <div 
          className={`tab ${tab === 'disparos' ? 'active' : ''}`} 
          onClick={() => setTab('disparos')} 
          role="button" 
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setTab('disparos');
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-selected={tab === 'disparos'}
        >
          <i className="ti ti-brand-whatsapp"></i> Disparos
          <span style={{ marginLeft: 6, fontSize: 9, padding: '2px 6px', background: 'var(--surface-3)', borderRadius: 10, color: 'var(--text-muted)' }}>Breve</span>
        </div>
      </nav>
      {tab === 'hooks' ? (
        <HooksTab 
          automations={automations} 
          logs={logs} 
          vpsHealth={vpsHealth} 
          vncUrl={vncUrl}
          onOpenVnc={() => setShowVnc(true)}
          onRun={run} 
          onToggle={handleToggle} 
          onSave={handleSave} 
          onDelete={handleDelete} 
        />
      ) : tab === 'rpa' ? (
        <div style={{ maxWidth: 720, width: '100%', marginTop: '10px' }} className="fz-in">
          <RpaCard />
        </div>
      ) : (
        <DisparosTab />
      )}
      {showVnc && vncUrl && (
        <VncModal 
          vncUrl={vncUrl} 
          onStopBot={async () => {
            const confirmed = await confirm({
              title: 'Encerrar Robô',
              message: 'Deseja realmente forçar o encerramento do robô na VPS? O navegador será fechado e os recursos da máquina serão liberados.',
              danger: true
            });
            if (confirmed) {
              await stopRunningTasks();
              setShowVnc(false);
            }
          }}
          onClose={() => setShowVnc(false)} 
        />
      )}
    </div>
  );
}

// ── Automação RPA Card (Maxtrack) ──────────────────────────────────────────
function RpaCard() {
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

      {/* Status da última execução */}
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

      {/* Configuração: ativo + intervalo */}
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

      {/* Credenciais da conta RPA */}
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
              disabled={savingCred}
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <label className="form-label" htmlFor="rpa-password">Senha</label>
            <input
              id="rpa-password"
              className="form-control"
              type="password"
              placeholder={credConfigured ? '••••••••  (nova senha para alterar)' : 'Senha da conta RPA'}
              value={credPass}
              onChange={e => setCredPass(e.target.value)}
              disabled={savingCred}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveCred}
            disabled={savingCred || !credEmail.trim() || !credPass}
            style={{ flexShrink: 0 }}
          >
            {savingCred ? <><i className="ti ti-loader-2"></i> Salvando…</> : <><i className="ti ti-key"></i> {credConfigured ? 'Atualizar' : 'Salvar'}</>}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          Use uma conta dedicada ao robô — não a conta pessoal. Lida apenas pelo serviço na VPS via chave de serviço.
        </div>
      </div>
    </div>
  );
}

const RPA_CONFIG_DEFAULT = {
  enabled: false,
  interval_minutes: 30,
  platforms: ['maxtrack'],
  last_run_at: null,
  last_run_status: null,
  last_run_message: null,
};
