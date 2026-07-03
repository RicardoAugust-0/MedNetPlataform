// Placeholder de carregamento com shimmer — reaproveita o padrão já usado
// no Dashboard (dashboard.css) para ser aplicável em qualquer módulo.
export default function Skeleton({ width = '100%', height = 14, radius = 8, circle = false, style, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${className}`}
      style={{
        display: 'inline-block',
        width,
        height,
        borderRadius: circle ? '50%' : radius,
        ...style,
      }}
    />
  );
}
