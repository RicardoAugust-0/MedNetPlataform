export const C = {
  vinho: '#9E1A45',
  vinho2: '#C24A6A',
  vinhoSoft: 'rgba(158,26,69,0.12)',
  orange: '#D4631B',
  danger: '#D23A2A',
  warning: '#C17E17',
  success: '#128273',
  info: '#2E5FD9',
  violet: '#6852C7',
  ink: '#12161C',
  muted: '#5B6572',
  dim: '#8B93A0',
  grid: 'var(--chart-grid, rgba(18,22,28,0.07))',
};

export const fmt = (n) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('pt-BR'));
export const kf = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v);

export const axisLineProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: 'var(--text-muted, #5B6572)', fontSize: 11, fontFamily: "'IBM Plex Mono', monospace" },
};

export const gridProps = {
  stroke: 'var(--chart-grid, rgba(15,25,35,0.08))',
  vertical: false,
};

export function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return React.createElement(
    'div',
    { style: {
      background: 'rgba(18, 22, 28, 0.96)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.13)',
      borderRadius: 8,
      padding: '9px 11px',
      fontSize: 11.5,
      fontFamily: "'IBM Plex Mono', monospace",
      boxShadow: '0 12px 30px rgba(18,22,28,0.24)',
    } },
    label ? React.createElement('div', { style: { fontWeight: 600, marginBottom: 5, color: '#C9D1DC' } }, label) : null,
    ...payload.map((p, i) => React.createElement(
      'div',
      { key: `${p.name}-${i}`, style: { color: p.color || '#fff' } },
      formatter ? formatter(p.value, p.name, p, payload) : `${p.name}: ${fmt(p.value)}`
    ))
  );
}

export function CenterLabel({ line1, line2, color = C.vinho }) {
  return React.createElement(
    'div',
    { style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      pointerEvents: 'none',
      paddingBottom: 28,
    } },
    React.createElement('div', { style: { color, fontWeight: 700, fontSize: 22, lineHeight: 1 } }, line1),
    React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 11, marginTop: 3 } }, line2)
  );
}

export function EmptyChart({ icon = 'ti-chart-bar', paddingTop = '0' }) {
  return React.createElement(
    'div',
    { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center', paddingTop } },
    React.createElement('i', { className: `ti ${icon}`, style: { fontSize: 28, color: 'var(--border-strong, #C9CDD6)' } }),
    React.createElement('div', { style: { fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' } }, 'Sem dados')
  );
}

export function initChartDefaults() {}
export const _ax = () => ({});
import React from 'react';
