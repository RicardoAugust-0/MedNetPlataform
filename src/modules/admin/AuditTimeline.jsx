const TIPO_META = {
  intervencao: { label: 'Intervenção', badge: 'danger',  icon: 'ti-headset',  color: 'var(--danger-500)' },
  reportar:    { label: 'Reportar',    badge: 'warning', icon: 'ti-building', color: 'var(--warning-500)' },
  descarte:    { label: 'Descarte',    badge: 'info',    icon: 'ti-trash',    color: 'var(--info-500)' },
  limpeza:     { label: 'Limpeza',     badge: 'info',    icon: 'ti-trash',    color: 'var(--info-500)' },
};

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Hoje';
  if (sameDay(d, yesterday)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

export default function AuditTimeline({ rows, resolveMonitorName }) {
  const groups = [];
  for (const h of rows) {
    const key = h.created_at ? new Date(h.created_at).toDateString() : '—';
    let g = groups.find(g => g.key === key);
    if (!g) { g = { key, label: h.created_at ? dayLabel(h.created_at) : 'Sem data', items: [] }; groups.push(g); }
    g.items.push(h);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {groups.map(g => (
        <div key={g.key}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            {g.label} <span style={{ fontWeight: 400, textTransform: 'none' }}>· {g.items.length} tratativa{g.items.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{ position: 'absolute', left: 9, top: 4, bottom: 4, width: 2, background: 'var(--border)' }}></div>
            {g.items.map(h => {
              const meta = TIPO_META[h.tipo] || { label: h.tipo, badge: 'info', icon: 'ti-point', color: 'var(--text-muted)' };
              return (
                <div key={h.id} style={{ position: 'relative', paddingBottom: 16 }}>
                  <div
                    style={{
                      position: 'absolute', left: -24, top: 2, width: 20, height: 20, borderRadius: '50%',
                      display: 'grid', placeItems: 'center', fontSize: 10.5, color: meta.color,
                      background: 'var(--surface-0)', border: `2px solid ${meta.color}`,
                    }}
                  >
                    <i className={`ti ${meta.icon}`}></i>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {h.motorista || '—'}
                        {h.placa && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>{h.placa}</span>}
                        <span className={`badge badge-${meta.badge}`} style={{ fontSize: 9, marginLeft: 8 }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {h.operador && <span>{h.operador}</span>}
                        {h.transportadora && <span> · {resolveMonitorName(h.transportadora)}</span>}
                        {h.obs && <span> · {h.obs}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{h.hora || ''}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
