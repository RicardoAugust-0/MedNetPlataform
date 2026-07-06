import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip } from './ChartUtils.jsx';

// Custom range <= 31 dias mostra granularidade diária (mesmo corte usado no backend,
// ver deriveDateParams em server/analytics-rpc.js) — mantém front/back em sincronia.
function isCustomDaily(selectedMonth, startDate, endDate) {
  if (selectedMonth !== 'custom' || !startDate || !endDate) return false;
  const span = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return span > 0 && span <= 31;
}

function VariacaoLabel({ x, y, width, value }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={up ? C.danger : C.success} fontFamily="'Poppins', sans-serif">
      {(up ? '+' : '') + value + '%'}
    </text>
  );
}

export function VolumeMensalCard({ d, noData, selectedMonth, formatMonthKey, startDate, endDate }) {
  const empty = noData || !d || !d.mensal || !d.mensal.labels.length;
  const rows = empty ? [] : d.mensal.labels.map((l, i) => ({ label: l, valor: d.mensal.valores[i], variacao: d.mensal.variacao[i] }));
  const showLabels = rows.length <= 15;

  const isSpecificMonth = selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom';
  const customDaily = isCustomDaily(selectedMonth, startDate, endDate);
  const isDaily = isSpecificMonth || customDaily;

  let title = 'Alertas por mês';
  if (isSpecificMonth) title = `Alertas por dia em ${formatMonthKey(selectedMonth)}`;
  else if (customDaily) title = `Alertas por dia · ${d?.meta?.periodo ? `${d.meta.periodo[0]} a ${d.meta.periodo[1]}` : `${startDate} a ${endDate}`}`;

  return (
    <div data-card data-accent="vinho" className="card" style={{ padding: '18px 18px 14px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        {title}
      </h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        {isDaily
          ? 'Contagem diária de eventos e variação percentual dia a dia.'
          : 'Contagem consolidada de eventos mensais e variação em relação ao mês anterior.'}
      </p>
      <div style={{ position: 'relative', width: '100%', height: '320px' }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
            <i className="ti ti-chart-bar" style={{ fontSize: '30px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Importe uma planilha para visualizar</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar
                dataKey="valor"
                fill="rgba(158,26,69,0.55)"
                stroke={C.vinho}
                strokeWidth={1.5}
                radius={rows.length > 15 ? [4, 4, 0, 0] : [8, 8, 0, 0]}
                maxBarSize={rows.length > 15 ? 30 : 80}
              >
                {showLabels && <LabelList dataKey="variacao" content={VariacaoLabel} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function VolumeCriticidadeCard({ d, noData, selectedMonth, startDate, endDate, selectedSeverity, setSelectedSeverity }) {
  const empty = noData || !d || !d.mensal_crit || !d.mensal_crit.labels.length;
  const seriesKeys = empty ? [] : Object.keys(d.mensal_crit.series);
  const rows = empty ? [] : d.mensal_crit.labels.map((l, i) => {
    const row = { label: l };
    seriesKeys.forEach((s) => { row[s] = d.mensal_crit.series[s][i]; });
    return row;
  });
  const cc = { Gravíssimo: C.danger, Grave: C.warning, Médio: C.info };
  const groupOf = (s) => (s === 'Médio' ? 'medium' : 'high');
  const alpha = (hex, a) => hex + a;
  const isSmall = rows.length > 15;

  const calcTotal = (seriesName) => {
    if (!d || !d.mensal_crit || !d.mensal_crit.series || !d.mensal_crit.series[seriesName]) return 0;
    return d.mensal_crit.series[seriesName].reduce((a, b) => a + b, 0);
  };

  const toggleGroup = (group) => setSelectedSeverity(selectedSeverity === group ? 'all' : group);

  return (
    <div data-card data-accent="danger" className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Volume por criticidade</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {(selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom') || isCustomDaily(selectedMonth, startDate, endDate)
              ? 'Composição da severidade ao longo dos dias do período.'
              : 'Composição da severidade ao longo dos meses.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface-1, rgba(255,255,255,0.05))', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          {['all', 'high', 'medium'].map((mode) => {
            const label = mode === 'all' ? 'Todas' : mode === 'high' ? 'Grave/Gravíssimo' : 'Médios';
            return (
              <button
                key={mode}
                onClick={() => setSelectedSeverity(mode)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  background: selectedSeverity === mode ? 'var(--surface-0, #fff)' : 'transparent',
                  color: selectedSeverity === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {!empty && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(226,75,74,0.06)', border: '1px solid rgba(226,75,74,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E24B4A' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Gravíssimo: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{calcTotal('Gravíssimo').toLocaleString('pt-BR')}</span>
            </span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E8A020' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Grave: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{calcTotal('Grave').toLocaleString('pt-BR')}</span>
            </span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(42,141,217,0.06)', border: '1px solid rgba(42,141,217,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2A8DD9' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Médio: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{calcTotal('Médio').toLocaleString('pt-BR')}</span>
            </span>
          </div>
        </div>
      )}
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
            <i className="ti ti-chart-bar" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v, name, entry, allPayload) => {
                const barTotal = allPayload.reduce((sum, p) => sum + (p.value || 0), 0);
                const pct = barTotal ? ((v / barTotal) * 100).toFixed(1) : '0.0';
                return `${name}: ${fmt(v)} (${pct}%)`;
              }} />} />
              <Legend
                wrapperStyle={{ fontSize: 11.5, paddingTop: 8, cursor: 'pointer' }}
                iconType="rect"
                onClick={(entry) => toggleGroup(groupOf(entry.dataKey))}
              />
              {seriesKeys.map((s) => (
                <Bar
                  key={s}
                  dataKey={s}
                  stackId="crit"
                  fill={selectedSeverity !== 'all' && groupOf(s) !== selectedSeverity ? alpha(cc[s], '55') : cc[s]}
                  radius={isSmall ? [2, 2, 0, 0] : [4, 4, 0, 0]}
                  maxBarSize={isSmall ? 20 : 54}
                  cursor="pointer"
                  onClick={() => toggleGroup(groupOf(s))}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
