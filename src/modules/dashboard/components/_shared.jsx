// Design tokens compartilhados pelos componentes do Dashboard.
export const COLORS = {
  fadiga:       '#E24B4A',
  comportamento:'#E8A020',
  positivo:     '#2DA75A',
  posPositivo:  '#2A8DD9',
  aberto:       '#8A94A6',
};

// Donut chart usado pelo ClassificationBreakdown — privado ao módulo.
export function Donut({ items, total, size = 160, stroke = 22 }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const safeTotal = total > 0 ? total : 1;
  const segs = items.reduce((acc, it) => {
    const len = (it.count / safeTotal) * C;
    acc.list.push({ ...it, len, offset: acc.cursor });
    acc.cursor += len;
    return acc;
  }, { list: [], cursor: 0 }).list;
  return (
    <svg viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      {total > 0 && segs.map((s, i) => (
        <circle
          key={i}
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke={s.color} strokeWidth={stroke}
          strokeDasharray={`${s.len} ${C - s.len}`}
          strokeDashoffset={-s.offset}
          strokeLinecap="butt"
          style={{ transition: 'stroke-dasharray 0.6s' }}
        />
      ))}
    </svg>
  );
}
