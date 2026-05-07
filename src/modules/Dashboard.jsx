import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useReminders } from '../hooks/useReminders';
import { iniciais, fmtDate } from '../utils';

export default function Dashboard() {
  const { drivers, setActivePanel } = useApp();
  const { profile } = useAuth();
  const { history: atHistory } = useAtendimentos();
  const { reminders } = useReminders();

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = profile?.nome?.split(' ')[0] || 'Operador';

  const alertas      = drivers.filter(d => d.alertas > 0);
  const criticos     = drivers.filter(d => d.alertas >= 5);
  const intervencoes = drivers.reduce((s, d) => s + (d.intervencoes || 0), 0);
  const tecCount     = drivers.filter(d => d.tecnicos > 0).length;
  const transp       = new Set(drivers.map(d => d.transportadora).filter(Boolean)).size;
  const top          = criticos[0];

  // Gráfico de atividade real baseado nos atendimentos de hoje
  const today = new Date().toDateString();
  const hourly = Array(24).fill(0);
  atHistory.forEach(a => {
    const d = new Date(a.created_at);
    if (d.toDateString() === today) hourly[d.getHours()]++;
  });
  const maxVal = Math.max(...hourly, 1);

  const sortedRem = [...reminders].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4);

  return (
    <div>
      <div className="dash-greet">
        <div>
          <div className="dash-greet-title">{greet}, {firstName} 👋</div>
          <div className="dash-greet-sub">{fmtDate()} · turno ativo</div>
        </div>
        <div className="dash-greet-actions">
          <button className="btn btn-sm btn-primary" onClick={() => setActivePanel('monitor')}>
            <i className="ti ti-truck-delivery"></i> Abrir Monitor
          </button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat-box">
          <div className="stat-label">Alertas ativos</div>
          <div className="stat-value danger">{alertas.length}</div>
          <div className="stat-sub">{alertas.length === 0 ? 'Nenhum no momento' : 'na planilha atual'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Críticos (≥5)</div>
          <div className="stat-value warning">{criticos.length}</div>
          <div className="stat-sub">{criticos[0]?.nome.split(' ')[0] || '—'}{criticos.length > 0 ? ' no topo' : ''}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Intervenções hoje</div>
          <div className="stat-value success">{atHistory.filter(a => a.tipo === 'intervencao' && new Date(a.created_at).toDateString() === today).length}</div>
          <div className="stat-sub">registradas no turno</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Apenas técnicos</div>
          <div className="stat-value">{tecCount}</div>
          <div className="stat-sub">de {drivers.length} motoristas</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Transportadoras</div>
          <div className="stat-value">{transp}</div>
          <div className="stat-sub">{transp === 0 ? 'carregue uma planilha' : 'no monitoramento'}</div>
        </div>
      </div>

      {top && (
        <div className="dash-hero">
          <div className="dash-hero-row">
            <div className="dash-hero-icon"><i className="ti ti-alert-triangle"></i></div>
            <div className="dash-hero-content">
              <div className="dash-hero-eyebrow">Atenção · Monitor Sascar</div>
              <div className="dash-hero-title">{criticos.length} motoristas com alertas críticos pendentes</div>
              <div className="dash-hero-sub">{top.nome} ({top.placa}) — {top.alertas} alertas · {top.transportadora}</div>
            </div>
            <button className="dash-hero-cta" onClick={() => setActivePanel('monitor')}>
              Ver fila <i className="ti ti-arrow-right"></i>
            </button>
          </div>
        </div>
      )}

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="dash-col">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-flame" style={{ color: 'var(--danger-500)' }}></i>
                Motoristas em alerta crítico
                <span className="pill-count">{criticos.length}</span>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setActivePanel('monitor')}>
                Ver todos <i className="ti ti-arrow-right"></i>
              </button>
            </div>
            <div className="crit-list">
              {criticos.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  <i className="ti ti-mood-happy" style={{ fontSize: 24, display: 'block', marginBottom: 6 }}></i>
                  Nenhum motorista em situação crítica
                </div>
              ) : criticos.slice(0, 4).map(d => {
                const sev = d.alertas >= 7 ? 'danger' : 'warning';
                return (
                  <div className="crit-item" key={d.placa}>
                    <div className={`crit-avatar ${sev}`}>{iniciais(d.nome)}</div>
                    <div className="crit-info">
                      <div className="crit-name">{d.nome}</div>
                      <div className="crit-meta">{d.placa} · {d.transportadora} · {d.tipos?.[0] || '—'}</div>
                    </div>
                    <span className={`badge badge-${sev}`}>{d.alertas}</span>
                    <button className="btn btn-sm btn-primary" onClick={() => setActivePanel('monitor')}>Atender</button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-chart-line" style={{ color: 'var(--accent-500)' }}></i>
                Atividade do turno
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Atendimentos por hora · hoje</span>
            </div>
            {atHistory.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Nenhum atendimento registrado hoje
              </div>
            ) : (
              <>
                <div className="spark-row">
                  {hourly.map((v, i) => {
                    const h = Math.max(8, (v / maxVal) * 100);
                    return <div key={i} className={`spark-bar ${v === maxVal && v > 0 ? 'peak' : ''}`} style={{ height: `${h}%` }} title={`${i}h: ${v} atendimentos`} />;
                  })}
                </div>
                <div className="spark-axis"><span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span></div>
              </>
            )}
          </div>
        </div>

        <div className="dash-col">
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-bell" style={{ color: 'var(--warning-500)' }}></i> Lembretes de hoje</div>
              <button className="btn btn-sm btn-ghost" onClick={() => setActivePanel('agenda')}>Agenda</button>
            </div>
            <div className="mini-rem-list">
              {sortedRem.length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Nenhum lembrete cadastrado
                </div>
              ) : sortedRem.map(r => (
                <div key={r.id} className={`mini-rem ${r.urgent ? 'urgent' : ''} ${r.done ? 'done' : ''}`}>
                  <div className="mini-rem-time">{r.time}</div>
                  <div>
                    <div className="mini-rem-title">{r.title}</div>
                    {r.sub && <div className="mini-rem-sub">{r.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-bolt" style={{ color: 'var(--accent-500)' }}></i> Atalhos</div>
            </div>
            <div className="quick-grid">
              {[
                { id:'templates', icon:'ti-message-2',  bg:'var(--tag-contato-bg)',      ic:'var(--tag-contato-color)',      name:'Templates',  desc:'Scripts prontos' },
                { id:'workspace', icon:'ti-notebook',   bg:'var(--tag-questionario-bg)',  ic:'var(--tag-questionario-color)', name:'Workspace',  desc:'Procedimentos' },
                { id:'notas',     icon:'ti-file-text',  bg:'var(--tag-encerramento-bg)',  ic:'var(--tag-encerramento-color)', name:'Notas',      desc:'Anotações' },
                { id:'links',     icon:'ti-link',       bg:'var(--tag-alerta-bg)',        ic:'var(--tag-alerta-color)',       name:'Links',      desc:'Sistemas externos' },
              ].map(q => (
                <div key={q.id} className="quick-card" onClick={() => setActivePanel(q.id)}>
                  <div className="quick-card-icon" style={{ background: q.bg, color: q.ic }}><i className={`ti ${q.icon}`}></i></div>
                  <div>
                    <div className="quick-card-name">{q.name}</div>
                    <div className="quick-card-desc">{q.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
