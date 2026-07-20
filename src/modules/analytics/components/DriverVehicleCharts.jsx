import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { fmt, kf, axisLineProps, gridProps, ChartTooltip, EmptyChart } from './ChartUtils.jsx';

function RankingChart({ rows, color, icon }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 400 }}>
      {!rows.length ? <EmptyChart icon={icon} /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
            <YAxis type="category" dataKey="label" {...axisLineProps} width={130} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
            <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
            <Bar dataKey="valor" fill={color} radius={[0, 5, 5, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function MotoristasMaisAlertasCard({ d, noData }) {
  const [driversViewMode, setDriversViewMode] = useState('chart');
  const rows = noData || !d?.top_motoristas?.labels?.length ? [] : d.top_motoristas.labels.map((label, i) => ({ label, valor: d.top_motoristas.valores[i] }));

  return (
    <div data-card className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Motoristas com mais alertas</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>Ranking dos motoristas com maior volume de eventos.</p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-1)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
          {['chart', 'table'].map((mode) => <button key={mode} onClick={() => setDriversViewMode(mode)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 4, background: driversViewMode === mode ? 'var(--surface-0)' : 'transparent', color: driversViewMode === mode ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer' }}>{mode === 'chart' ? 'Gráfico' : 'Tabela'}</button>)}
        </div>
      </div>
      {driversViewMode === 'chart' ? <RankingChart rows={rows} color="rgba(158,26,69,0.7)" icon="ti-user-exclamation" /> : (
        <div style={{ overflowY: 'auto', height: 400, marginTop: 14 }}>
          {!rows.length ? <EmptyChart icon="ti-user-exclamation" /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>#{idx + 1}</td>
                    <td style={{ padding: '8px 4px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }} title={r.label}>{r.label}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(r.valor)}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'center' }}><Link to={`/dossies/clinico?driver=${encodeURIComponent(r.label)}`} className="btn btn-sm btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, color: 'var(--accent-500, #9E1A45)', textDecoration: 'none', fontWeight: 600 }}><i className="ti ti-arrow-up-right"></i> Dossiê</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function VeiculosMaisAlertasCard({ d, noData }) {
  const rows = noData || !d?.top_placas?.labels?.length ? [] : d.top_placas.labels.map((label, i) => ({ label, valor: d.top_placas.valores[i] }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Top 15 veículos (placa)</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Maior número de alertas no período selecionado.</p>
      <RankingChart rows={rows} color="rgba(42,141,217,0.7)" icon="ti-truck" />
    </div>
  );
}
