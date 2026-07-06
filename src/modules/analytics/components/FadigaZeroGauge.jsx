import { PieChart, Pie, Cell } from 'recharts';
import { C } from './ChartUtils.jsx';

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
// Arco parcial (270°, gap embaixo): startAngle=225 → endAngle=-45 no Recharts
// equivale ao rotation:225/circumference:270 do gauge antigo em Chart.js.
export default function FadigaZeroGauge({ score }) {
  if (score == null) return null;

  const color = scoreColor(score);
  const data = [{ value: score }, { value: 100 - score }];
  const explicacao = 'Fadiga Zero: pontuação de 0 a 100 que resume o período — combina a gravidade dos alertas, a taxa de falso positivo e o tempo de resposta da operação vs. o SLA. Quanto maior, melhor.';

  return (
    <div
      title={explicacao}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: '99px', padding: '7px 16px 7px 7px', cursor: 'help' }}
    >
      <div style={{ position: 'relative', width: '60px', height: '60px', flexShrink: 0 }}>
        <PieChart width={60} height={60}>
          <Pie
            data={data}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={20}
            outerRadius={28}
            startAngle={225}
            endAngle={-45}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill={color} />
            <Cell fill="var(--surface-2, rgba(15,25,35,0.06))" />
          </Pie>
        </PieChart>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color, fontFamily: "'Poppins', sans-serif" }}>{score}</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Fadiga Zero
          <i className="ti ti-info-circle" style={{ fontSize: '11px' }}></i>
        </div>
        <div style={{ fontSize: '12.5px', fontWeight: 600, color: scoreColor(score) }}>{scoreLabel(score)}</div>
        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', maxWidth: '150px', lineHeight: 1.3 }}>
          Severidade + qualidade + tempo de resposta
        </div>
      </div>
    </div>
  );
}
