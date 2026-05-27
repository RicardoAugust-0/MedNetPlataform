import { useState, useEffect, useRef } from 'react';

// Design tokens compartilhados pelos componentes do Dashboard.
export const COLORS = {
  fadiga:       '#E24B4A',
  comportamento:'#E8A020',
  positivo:     '#2DA75A',
  posPositivo:  '#2A8DD9',
  aberto:       '#8A94A6',
};

// Anima a transição entre o número anterior e o atual (easing cubic out).
export function AnimatedNumber({ value, duration = 700 }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  const raf = useRef(null);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (raf.current) cancelAnimationFrame(raf.current);
    if (from === to) { setDisplay(to); return; }
    let start = null;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return display.toLocaleString('pt-BR');
}

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
