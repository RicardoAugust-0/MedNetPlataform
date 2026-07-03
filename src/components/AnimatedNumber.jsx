import { useState, useEffect, useRef } from 'react';

// Anima a transição entre o número anterior e o atual (easing cubic out).
// `decimals` preserva casas decimais (ex: percentuais/medianas com 1 casa)
// em vez de arredondar para inteiro durante e após a animação.
export function AnimatedNumber({ value, duration = 700, decimals = 0 }) {
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
      const raw = from + (to - from) * e;
      setDisplay(decimals ? Number(raw.toFixed(decimals)) : Math.round(raw));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => raf.current && cancelAnimationFrame(raf.current);
  }, [value, duration, decimals]);
  return display.toLocaleString('pt-BR', decimals
    ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
    : undefined);
}
