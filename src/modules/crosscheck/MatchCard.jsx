function EventColumn({ name, events }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="stat-label">
        {name}{" "}
        <span style={{ textTransform: "lowercase" }}>
          ({events.length} ocorrências)
        </span>
      </div>
      {events.map((ev, j) => (
        <div
          key={j}
          style={{
            padding: "8px 0",
            borderBottom: "1px dashed var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {ev.driverRaw || ev.plateRaw}
            </div>
            {ev.transportadoraRaw && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {ev.transportadoraRaw}
              </div>
            )}
          </div>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: 11,
              background: "var(--surface-1)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {ev.severityRaw || "Sem criticidade"}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MatchCard({ match: m, leftName, rightName }) {
  return (
    <div className="stat-box" style={{ padding: 18, marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          fontWeight: 600,
          fontSize: 14,
          color: "var(--text-primary)",
        }}
      >
        <div>
          {m.by === "placa" ? (
            <>
              <i
                className="ti ti-car"
                style={{ color: "var(--text-muted)", marginRight: 6 }}
              ></i>
              Placa: {m.key}
            </>
          ) : (
            <>
              <i
                className="ti ti-user"
                style={{ color: "var(--text-muted)", marginRight: 6 }}
              ></i>
              Motorista: {m.key}
            </>
          )}
        </div>
        {m.left.length === m.right.length && (
          <span className="badge badge-success">
            <i className="ti ti-circle-check"></i> Match perfeito
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
        <EventColumn name={leftName} events={m.left} />
        <div style={{ width: 1, background: "var(--border)" }} />
        <EventColumn name={rightName} events={m.right} />
      </div>
    </div>
  );
}
