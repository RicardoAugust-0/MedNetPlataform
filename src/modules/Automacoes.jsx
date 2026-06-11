import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAutomations } from '../hooks/useAutomations';
import { useAuth } from '../auth/AuthContext.jsx';
import { useConfirm } from '../hooks/useConfirm';
import { useToast } from '../hooks/useToast.jsx';
import '../styles/automacoes.css';

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
      <div className="drawer" role="dialog">
        <div className="drawer-head">
          <div className="hook-icon" style={{ width: 36, height: 36, fontSize: 18 }}><i className={`ti ${hook.icon}`}></i></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hook-name" style={{ fontSize: 13.5 }}>{hook.name}</div>
            <div className="lr-sub">{triggerLabelFor(hook)}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><i className="ti ti-x"></i></button>
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
      </div>
    </>
  );
}

function AutomationModal({ automation, onSave, onDelete, onClose }) {
  const isNew = !automation;
  const [name, setName] = useState(automation?.name || '');
  const [desc, setDesc] = useState(automation?.desc || '');
  const [icon, setIcon] = useState(automation?.icon || 'ti-robot');
  const [endpoint, setEndpoint] = useState(automation?.endpoint || 'https://168.231.94.0/hooks/');
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
  const iframeUrl = `${vncUrl}/vnc.html?autoconnect=true&resize=scale`;

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
      <div className="tabs">
        <div className={`tab ${tab === 'hooks' ? 'active' : ''}`} onClick={() => setTab('hooks')} role="button" style={{ cursor: 'pointer' }}>
          <i className="ti ti-webhook"></i> Hooks <span className="tab-count">{automations.length}</span>
        </div>
        <div className={`tab ${tab === 'disparos' ? 'active' : ''}`} onClick={() => setTab('disparos')} role="button" style={{ cursor: 'pointer' }}>
          <i className="ti ti-brand-whatsapp"></i> Disparos
          <span style={{ marginLeft: 6, fontSize: 9, padding: '2px 6px', background: 'var(--surface-3)', borderRadius: 10, color: 'var(--text-muted)' }}>Breve</span>
        </div>
      </div>
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
