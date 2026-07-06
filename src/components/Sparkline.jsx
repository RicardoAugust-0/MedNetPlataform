// Mini-gráfico de tendência inline (estilo Power BI), sem eixos/legendas.
// SVG puro em vez de Chart.js: mais leve pra renderizar várias instâncias
// pequenas lado a lado (um KPI card por vez) sem gerenciar lifecycle de canvas.
// viewBox fixo em 100 unidades de largura + preserveAspectRatio="none" deixa o
// traçado esticar pra 100% do container (cards de KPI têm largura variável no grid).
const VIEW_W = 100;

export default function Sparkline({ data = [], height = 22, color = '#9E1A45', strokeWidth = 2 }) {
  const valid = (data || []).filter((v) => v != null && !isNaN(v));
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const stepX = VIEW_W / (valid.length - 1);
  const padY = strokeWidth;

  const points = valid.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - padY * 2) - padY;
    return [x, y];
  });

  const linePoints = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const areaPoints = `0,${height} ${linePoints} ${VIEW_W},${height}`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <polyline points={areaPoints} fill={color} fillOpacity={0.12} stroke="none" />
      <polyline
        points={linePoints}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.2} fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
