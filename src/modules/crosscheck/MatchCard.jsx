function severityClass(raw) {
  if (!raw) return '';
  const s = raw.toLowerCase();
  if (/gravíssimo|gravissimo/.test(s)) return 'badge-danger';
  if (/grave/.test(s)) return 'badge-warning';
  return 'badge-info';
}

export default function MatchCard({ match: m, leftName, rightName }) {
  return (
    <div className="stat-box" style={{ marginBottom: 12 }}>
      <div className="cc-match-title">
        {m.by === 'placa'
          ? <><i className="ti ti-car" style={{ color: 'var(--text-muted)' }}></i>Placa: {m.key}</>
          : <><i className="ti ti-user" style={{ color: 'var(--text-muted)' }}></i>Motorista: {m.key}</>
        }
      </div>
      <div className="cc-match-sides">
        <EventCol name={leftName} events={m.left} />
        <div className="cc-col-divider" />
        <EventCol name={rightName} events={m.right} />
      </div>
    </div>
  );
}

function EventCol({ name, events }) {
  return (
    <div className="cc-match-col">
      <div className="stat-label">
        {name} <span style={{ textTransform: 'lowercase' }}>({events.length} ocorrências)</span>
      </div>
      {events.map((ev, j) => (
        <div key={j} className="cc-event-row">
          <span className="cc-event-name">{ev.driverRaw || ev.plateRaw}</span>
          {ev.severityRaw
            ? <span className={`badge ${severityClass(ev.severityRaw)}`}>{ev.severityRaw}</span>
            : <span className="stat-sub" style={{ margin: 0 }}>Sem criticidade</span>
          }
        </div>
      ))}
    </div>
  );
}
