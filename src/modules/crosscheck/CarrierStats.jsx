function CarrierPanel({ title, stats, onCarrierFilter }) {
  return (
    <div className="stat-box" style={{ padding: 16 }}>
      <div className="stat-label">Transportadoras · {title}</div>
      {stats.length === 0 ? (
        <div className="stat-sub" style={{ marginTop: 8 }}>Nenhum dado de transportadora.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {stats.slice(0, 6).map((item) => (
            <div
              key={item.name}
              onClick={() => onCarrierFilter(item.name)}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, cursor: 'pointer' }}
              title="Filtrar resultados por transportadora"
            >
              <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>{item.count}</span>
            </div>
          ))}
          {stats.length > 6 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{stats.length - 6} outras</div>
          )}
        </div>
      )}
    </div>
  );
}

function DupPanel({ title, dupStats }) {
  const empty = dupStats.plates.total === 0 && dupStats.drivers.total === 0;
  return (
    <div className="stat-box" style={{ padding: 16 }}>
      <div className="stat-label">Duplicados internos · {title}</div>
      {empty ? (
        <div className="stat-sub" style={{ marginTop: 8 }}>Nenhum duplicado encontrado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Placas repetidas: {dupStats.plates.total}</div>
          {dupStats.plates.top.map((item) => (
            <div key={item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
              <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Motoristas repetidos: {dupStats.drivers.total}</div>
          {dupStats.drivers.top.map((item) => (
            <div key={item.value} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--text-primary)' }}>{item.value}</span>
              <span style={{ color: 'var(--text-muted)' }}>{item.count}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GRID = { display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' };

export default function CarrierStats({
  leftCarrierStats,
  rightCarrierStats,
  leftDupStats,
  rightDupStats,
  leftName,
  rightName,
  onCarrierFilter,
}) {
  return (
    <>
      <div style={{ ...GRID, marginTop: 16 }}>
        <CarrierPanel title={leftName} stats={leftCarrierStats} onCarrierFilter={onCarrierFilter} />
        <CarrierPanel title={rightName} stats={rightCarrierStats} onCarrierFilter={onCarrierFilter} />
      </div>
      <div style={{ ...GRID, marginTop: 12 }}>
        <DupPanel title={leftName} dupStats={leftDupStats} />
        <DupPanel title={rightName} dupStats={rightDupStats} />
      </div>
    </>
  );
}
