import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip } from './ChartUtils.jsx';

function EmptyState({ icon, paddingTop = '80px' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop }}>
      <i className={`ti ${icon}`} style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
    </div>
  );
}

export function HoraDiaCard({ d, noData }) {
  const empty = noData || !d || !d.hora;
  const rows = empty ? [] : d.hora.horas.map((h, i) => ({
    hora: `${h}h`,
    Total: d.hora.valores[i],
    Positivos: d.hora.valores_pos[i],
  }));

  return (
    <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por hora do dia</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Distribuição nas 24 horas — total e apenas confirmados.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        {empty ? (
          <EmptyState icon="ti-clock-hour-4" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="hora" {...axisLineProps} interval={2} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)} alertas`} />} />
              <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} iconType="rect" />
              <Bar dataKey="Total" fill="rgba(158,26,69,0.25)" stroke={C.vinho} strokeWidth={1} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="Positivos" stroke={C.danger} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function DiaSemanaCard({ d, noData }) {
  const empty = noData || !d || !d.dow;
  const rows = empty ? [] : d.dow.labels.map((l, i) => ({ label: l, valor: d.dow.valores[i] }));

  return (
    <div data-card data-accent="info" className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por dia da semana</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Volume acumulado por dia da semana no período.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        {empty ? (
          <EmptyState icon="ti-calendar-week" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {rows.map((r, i) => {
                  const isWeekend = r.label === 'Sáb' || r.label === 'Dom';
                  return (
                    <Cell key={i} fill={isWeekend ? 'rgba(194,74,106,0.55)' : 'rgba(42,141,217,0.5)'} stroke={isWeekend ? C.vinho2 : C.info} strokeWidth={1.5} />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function VelocidadeAlertaCard({ d, noData }) {
  const empty = noData || !d || !d.vel;
  const rows = empty ? [] : d.vel.labels.map((l, i) => ({ label: `${l} km/h`, valor: d.vel.valores[i] }));

  return (
    <div data-card data-accent="danger" className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Velocidade no momento do alerta</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Distribuição da velocidade (km/h) quando o evento disparou.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        {empty ? (
          <EmptyState icon="ti-gauge" paddingTop="60px" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={i >= 3 ? 'rgba(226,75,74,0.55)' : 'rgba(42,141,217,0.45)'} stroke={i >= 3 ? C.danger : C.info} strokeWidth={1.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
