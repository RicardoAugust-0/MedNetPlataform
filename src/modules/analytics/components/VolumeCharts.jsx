import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip, EmptyChart } from './ChartUtils.jsx';

function isCustomDaily(selectedMonth, startDate, endDate) {
  if (selectedMonth !== 'custom' || !startDate || !endDate) return false;
  const span = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return span > 0 && span <= 31;
}

function VariacaoLabel({ x, y, width, value }) {
  if (value == null) return null;
  const up = value >= 0;
  return <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={up ? C.danger : C.success}>{`${up ? '+' : ''}${value}%`}</text>;
}

export function VolumeMensalCard({ d, noData, selectedMonth, setSelectedMonth, formatMonthKey, startDate, endDate }) {
  const empty = noData || !d?.mensal?.labels?.length;
  const rows = empty ? [] : d.mensal.labels.map((label, i) => ({ label, valor: d.mensal.valores[i], variacao: d.mensal.variacao[i] }));
  const isSpecificMonth = selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom';
  const customDaily = isCustomDaily(selectedMonth, startDate, endDate);
  const isDaily = isSpecificMonth || customDaily;
  const canSelectPeriod = !isDaily && typeof setSelectedMonth === 'function';
  let title = 'Alertas por mês';
  if (isSpecificMonth) title = `Alertas por dia em ${formatMonthKey(selectedMonth)}`;
  else if (customDaily) title = `Alertas por dia · ${d?.meta?.periodo ? `${d.meta.periodo[0]} a ${d.meta.periodo[1]}` : `${startDate} a ${endDate}`}`;

  return (
    <div data-card className="card" style={{ padding: '18px 18px 14px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>{isDaily ? 'Contagem diária de eventos e variação percentual dia a dia.' : 'Contagem consolidada de eventos mensais e variação em relação ao mês anterior.'}</p>
      <div style={{ position: 'relative', width: '100%', height: 320 }}>
        {empty ? <EmptyChart icon="ti-chart-bar" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar dataKey="valor" fill="rgba(158,26,69,0.55)" stroke={C.vinho} strokeWidth={1.5} radius={rows.length > 15 ? [4, 4, 0, 0] : [8, 8, 0, 0]} maxBarSize={rows.length > 15 ? 30 : 80} cursor={canSelectPeriod ? 'pointer' : 'default'} onClick={(entry, index) => {
                if (!canSelectPeriod) return;
                const key = d?.mensal?.meses?.[index ?? entry?.index];
                if (key) setSelectedMonth(selectedMonth === key ? 'all' : key);
              }}>
                {rows.length <= 15 && <LabelList dataKey="variacao" content={VariacaoLabel} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function VolumeCriticidadeCard({ d, noData, selectedMonth, startDate, endDate, selectedSeverity, setSelectedSeverity }) {
  const empty = noData || !d?.mensal_crit?.labels?.length;
  const seriesKeys = empty ? [] : Object.keys(d.mensal_crit.series || {});
  const rows = empty ? [] : d.mensal_crit.labels.map((label, i) => {
    const row = { label };
    seriesKeys.forEach((k) => { row[k] = d.mensal_crit.series[k][i] || 0; });
    return row;
  });
  const colors = { Gravíssimo: C.danger, Grave: C.warning, Médio: C.info };
  const groupOf = (s) => (s === 'Médio' ? 'medium' : 'high');
  const calcTotal = (k) => (d?.mensal_crit?.series?.[k] || []).reduce((a, b) => a + b, 0);

  return (
    <div data-card className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Volume por criticidade</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>{(selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom') || isCustomDaily(selectedMonth, startDate, endDate) ? 'Composição da severidade ao longo dos dias do período.' : 'Composição da severidade ao longo dos meses.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-1)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
          {['all', 'high', 'medium'].map((mode) => <button key={mode} onClick={() => setSelectedSeverity(mode)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 4, background: selectedSeverity === mode ? 'var(--surface-0)' : 'transparent', color: selectedSeverity === mode ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer' }}>{mode === 'all' ? 'Todas' : mode === 'high' ? 'Grave/Gravíssimo' : 'Médios'}</button>)}
        </div>
      </div>
      {!empty && <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>{['Gravíssimo', 'Grave', 'Médio'].map((k) => <span key={k} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, background: colors[k], marginRight: 6 }} />{k}: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(calcTotal(k))}</span></span>)}</div>}
      <div style={{ position: 'relative', width: '100%', height: 260 }}>
        {empty ? <EmptyChart icon="ti-chart-bar" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v, name, entry, all) => `${name}: ${fmt(v)} (${((v / ((all || []).reduce((s, p) => s + (p.value || 0), 0) || 1)) * 100).toFixed(1)}%)`} />} />
              <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8, cursor: 'pointer' }} iconType="rect" onClick={(entry) => setSelectedSeverity(selectedSeverity === groupOf(entry.dataKey) ? 'all' : groupOf(entry.dataKey))} />
              {seriesKeys.map((k) => <Bar key={k} dataKey={k} stackId="crit" fill={colors[k]} fillOpacity={selectedSeverity !== 'all' && groupOf(k) !== selectedSeverity ? 0.35 : 1} radius={rows.length > 15 ? [2, 2, 0, 0] : [4, 4, 0, 0]} maxBarSize={rows.length > 15 ? 20 : 54} cursor="pointer" onClick={() => setSelectedSeverity(selectedSeverity === groupOf(k) ? 'all' : groupOf(k))} />)}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
