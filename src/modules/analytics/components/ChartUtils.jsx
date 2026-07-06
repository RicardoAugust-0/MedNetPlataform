// Paleta e helpers compartilhados entre os cards do Analytics — Recharts.
// Cada gráfico é JSX declarativo (data + <Chart>), sem lifecycle manual
// (useRef+useEffect+new Chart()+destroy do Chart.js antigo).

export const C = {
  vinho: '#9E1A45',
  vinho2: '#C24A6A',
  vinhoSoft: 'rgba(158,26,69,0.12)',
  orange: '#F26931',
  danger: '#E24B4A',
  warning: '#E8A020',
  success: '#2DA75A',
  info: '#2A8DD9',
  ink: '#0F1923',
  muted: '#8A94A6',
  grid: 'var(--chart-grid, rgba(15,25,35,0.025))',
};

export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));

export const kf = (v) => (v >= 1000 ? v / 1000 + 'k' : v);

// Props compartilhadas de eixo (equivalente ao antigo _ax do Chart.js).
export const axisTick = { fontSize: 11, fill: C.muted, fontFamily: "'Poppins', sans-serif" };
export const axisLineProps = { tickLine: false, axisLine: false, tick: axisTick };
export const gridProps = { stroke: C.grid, vertical: false };

// Tooltip customizado compartilhado — fundo escuro, cantos arredondados,
// marcador de cor por série. `formatter(value, name, entry, allPayload)` devolve
// a string principal de cada linha (allPayload dá acesso às outras séries do
// mesmo ponto, útil pra calcular % do total numa barra empilhada); `footer(payload0)`
// devolve uma linha extra opcional (equivalente ao afterLabel do Chart.js).
export function ChartTooltip({ active, payload, label, formatter, footer }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div
      style={{
        background: C.ink,
        color: '#fff',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 12,
        fontFamily: "'Poppins', sans-serif",
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {label != null && <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill, display: 'inline-block', flexShrink: 0 }}></span>
          <span>{formatter ? formatter(p.value, p.name, p, payload) : `${p.name}: ${fmt(p.value)}`}</span>
        </div>
      ))}
      {footer && <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{footer(payload[0]?.payload)}</div>}
    </div>
  );
}

// Texto central de donut — overlay absoluto sobre o wrapper relative que
// envolve o <ResponsiveContainer> (ver uso nos cards de doughnut).
export function CenterLabel({ line1, line2, color = C.ink }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'Poppins', sans-serif", lineHeight: 1.1 }}>{line1}</div>
      {line2 && <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginTop: 2 }}>{line2}</div>}
    </div>
  );
}

// Gradiente vertical pra <Area>/<Bar> — opaco no topo, esmaecendo até
// transparente na base. Uso: <defs>{gradientDef('falsoGrad', C.warning)}</defs>
// e no elemento: fill="url(#falsoGrad)".
export function gradientDef(id, hex, alphaTop = 0.35) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={hex} stopOpacity={alphaTop} />
      <stop offset="100%" stopColor={hex} stopOpacity={0} />
    </linearGradient>
  );
}
