import { ResponsiveContainer, ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip, EmptyChart } from './ChartUtils.jsx';

export function HoraDiaCard({ d, noData }) {
  const empty = noData || !d?.hora;
  const rows = empty ? [] : d.hora.horas.map((h, i) => ({ hora: `${h}h`, Total: d.hora.valores[i], Positivos: d.hora.valores_pos[i] }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por hora do dia</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Distribuição nas 24 horas, total e apenas confirmados.</p>
      <div style={{ position: 'relative', width: '100%', height: 260 }}>
        {empty ? <EmptyChart icon="ti-clock-hour-4" /> : (
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
  const empty = noData || !d?.dow;
  const rows = empty ? [] : d.dow.labels.map((label, i) => ({ label, valor: d.dow.valores[i] }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por dia da semana</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Volume acumulado por dia da semana no período.</p>
      <div style={{ position: 'relative', width: '100%', height: 260 }}>
        {empty ? <EmptyChart icon="ti-calendar-week" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {rows.map((r) => <Cell key={r.label} fill={r.label === 'Sáb' || r.label === 'Dom' ? 'rgba(194,74,106,0.55)' : 'rgba(42,141,217,0.5)'} stroke={r.label === 'Sáb' || r.label === 'Dom' ? C.vinho2 : C.info} strokeWidth={1.5} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function VelocidadeAlertaCard({ d, noData }) {
  const empty = noData || !d?.vel;
  const rows = empty ? [] : d.vel.labels.map((label, i) => ({ label: `${label} km/h`, valor: d.vel.valores[i] }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Velocidade no momento do alerta</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Distribuição da velocidade (km/h) quando o evento disparou.</p>
      <div style={{ position: 'relative', width: '100%', height: 220 }}>
        {empty ? <EmptyChart icon="ti-gauge" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                {rows.map((r, i) => <Cell key={r.label} fill={i >= 3 ? 'rgba(226,75,74,0.55)' : 'rgba(42,141,217,0.45)'} stroke={i >= 3 ? C.danger : C.info} strokeWidth={1.5} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
