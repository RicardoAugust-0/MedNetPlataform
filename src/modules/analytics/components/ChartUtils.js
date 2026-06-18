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

export const _ax = (extra) =>
  Object.assign(
    {
      grid: { color: 'var(--chart-grid, rgba(15,25,35,0.025))', drawTicks: false },
      border: { display: false },
      ticks: { padding: 8, color: 'var(--text-muted, #8A94A6)' },
    },
    extra || {}
  );
