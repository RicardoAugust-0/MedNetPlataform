import Chart from 'chart.js/auto';

let _initialized = false;

export function initChartDefaults() {
  if (_initialized) return;
  _initialized = true;
  Chart.defaults.font.family = "'Poppins', sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = 'var(--text-muted, #8A94A6)';
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#0F1923';
  Chart.defaults.plugins.tooltip.borderColor = 'var(--border, rgba(255,255,255,0.1))';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = '#fff';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { family: "'Poppins', sans-serif", weight: '600' };
  // Estilo "Power BI": tooltip com marcador de cor do dataset + sombra suave,
  // hover que dispara pela coluna inteira (não só quando o mouse acerta a barra
  // exata) e transição consistente entre filtros/períodos.
  Chart.defaults.plugins.tooltip.usePointStyle = true;
  Chart.defaults.plugins.tooltip.boxPadding = 6;
  Chart.defaults.plugins.tooltip.bodySpacing = 6;
  Chart.defaults.interaction = { mode: 'nearest', axis: 'x', intersect: false };
  Chart.defaults.animation = { duration: 400, easing: 'easeOutQuart' };
  Chart.defaults.animations.colors = { duration: 250 };
}

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
