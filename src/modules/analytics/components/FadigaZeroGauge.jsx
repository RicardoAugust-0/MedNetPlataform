import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { C } from './ChartUtils.js';

function scoreColor(score) {
  if (score >= 80) return C.success;
  if (score >= 50) return C.warning;
  return C.danger;
}

function scoreLabel(score) {
  if (score >= 80) return 'Sob controle';
  if (score >= 50) return 'Atenção';
  return 'Crítico';
}

// Gauge "Fadiga Zero": um único número (0-100) resumindo severidade, qualidade
// da classificação e tempo de resposta do período — ver useFadigaScore.js.
export default function FadigaZeroGauge({ score }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    if (!canvasRef.current || score == null) return;

    const color = scoreColor(score);
    const centerText = {
      id: 'centerText',
      afterDraw: (chart) => {
        const { ctx, chartArea } = chart;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = "700 20px 'Poppins', sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(String(score), cx, cy - 2);
        ctx.restore();
      },
    };

    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [score, 100 - score],
            backgroundColor: [color, 'var(--surface-2, rgba(15,25,35,0.06))'],
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        circumference: 270,
        rotation: 225,
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
      plugins: [centerText],
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [score]);

  if (score == null) return null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '99px', padding: '6px 14px 6px 6px' }}>
      <div style={{ position: 'relative', width: '46px', height: '46px' }}>
        <canvas ref={canvasRef}></canvas>
      </div>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Fadiga Zero</div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: scoreColor(score) }}>{scoreLabel(score)}</div>
      </div>
    </div>
  );
}
