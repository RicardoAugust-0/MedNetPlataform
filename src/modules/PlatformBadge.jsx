// Chip colorido identificando a plataforma de origem do alerta.
// Usado em DriverCard (Monitor), CriticalSLA (Dashboard) e no header
// do Dashboard com contagem agregada.

const CONFIG = {
  maxtrack: { label: 'MAX', name: 'Maxtrack', color: '#E8A020', bg: 'rgba(232, 160, 32, 0.18)' },
  sascar:   { label: 'SAS', name: 'Sascar',   color: '#2DA75A', bg: 'rgba(45, 167, 90, 0.18)'   },
};

const BASE_STYLE = {
  display:        'inline-flex',
  alignItems:     'center',
  gap:            4,
  fontSize:       9.5,
  fontWeight:     700,
  letterSpacing:  0.5,
  padding:        '2px 6px',
  borderRadius:   4,
  whiteSpace:     'nowrap',
  textTransform:  'uppercase',
};

export default function PlatformBadge({ platformId, count }) {
  const cfg = CONFIG[platformId];
  const isUnknownOrigin = !platformId || platformId === 'auto';
  const label = cfg?.label || (isUnknownOrigin ? 'ORIGEM N/I' : String(platformId).slice(0, 12));
  const name = cfg?.name || (isUnknownOrigin ? 'Plataforma não informada na importação' : String(platformId));
  const color = cfg?.color || '#64748B';
  const bg = cfg?.bg || 'rgba(100, 116, 139, 0.16)';
  return (
    <span
      className="platform-badge"
      style={{ ...BASE_STYLE, background: bg, color }}
      title={name}
    >
      {label}
      {typeof count === 'number' && <span style={{ fontWeight: 800 }}>{count}</span>}
    </span>
  );
}
