import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip } from './components/ChartUtils.js';

export default function ComparisonView({
  sources,
  selectedMonth,
  formatMonthKey,
  compareCompanies = {},
  setCompareCompanies,
  selectedSeverity,
  compareMode = 'platforms'
}) {
  const compareRows = useMemo(() => {
    const colors = ['#9E1A45', '#2A8DD9', '#E8A020', '#2DA75A', '#C24A6A', '#F26931', '#7A1235', '#6F6A88'];
    return sources.map((x, i) => {
      const agg = x.data;
      if (!agg) return null;
      return {
        platformName: x.label || x.platformName,
        color: colors[i % colors.length],
        totalNum: agg.kpis?.total || 0,
        positivosNum: Math.round(((agg.kpis?.total || 0) * (agg.kpis?.pct_positivo || 0)) / 100),
        gravissimo: (agg.mensal_crit?.series?.['Gravíssimo'] || []).reduce((a, b) => a + b, 0),
        grave: (agg.mensal_crit?.series?.Grave || []).reduce((a, b) => a + b, 0),
        medio: (agg.mensal_crit?.series?.Médio || []).reduce((a, b) => a + b, 0),
        total: agg.kpis?.total != null ? agg.kpis.total.toLocaleString('pt-BR') : '0',
        pos: agg.kpis?.pct_positivo != null ? `${agg.kpis.pct_positivo}%` : '—',
        falso: agg.kpis?.pct_falso != null ? `${agg.kpis.pct_falso}%` : '—',
        vel: agg.kpis?.vel_mediana != null ? agg.kpis.vel_mediana : '—',
        evid: agg.kpis?.pct_evidencia != null ? `${agg.kpis.pct_evidencia}%` : '—',
      };
    }).filter(Boolean);
  }, [sources, selectedSeverity]);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '28px 2px 14px', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 16, height: 2, background: '#9E1A45', borderRadius: 2, display: 'inline-block' }}></span>
          Comparação entre {compareMode === 'companies' ? 'empresas' : 'plataformas'} {selectedMonth && `(${formatMonthKey(selectedMonth)})`}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {sources.map((src) => compareMode === 'companies' ? (
            <div key={src.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-1)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>{src.label}</span>
            </div>
          ) : (
            <div key={src.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-1)', padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{src.platformName}:</span>
              <select value={compareCompanies[src.platformId] || ''} onChange={(e) => setCompareCompanies((prev) => ({ ...prev, [src.platformId]: e.target.value }))} style={{ padding: '2px 4px', border: 'none', background: 'transparent', fontSize: 11.5, fontWeight: 500, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                <option value="">Todas as empresas</option>
                {(src.availableCompanies || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="grid-2col">
        <div data-card className="card" style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Volume por plataforma</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Total de alertas e positivos confirmados em cada fonte.</p>
          <div style={{ position: 'relative', width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="platformName" {...axisLineProps} />
                <YAxis {...axisLineProps} tickFormatter={kf} />
                <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)}`} />} />
                <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} iconType="rect" />
                <Bar dataKey="totalNum" name="Total" fill="rgba(158,26,69,0.65)" stroke={C.vinho} strokeWidth={1} radius={[5, 5, 0, 0]} maxBarSize={34} />
                <Bar dataKey="positivosNum" name="Positivos" fill="rgba(42,141,217,0.55)" stroke={C.info} strokeWidth={1} radius={[5, 5, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div data-card className="card" style={{ padding: '16px 18px', overflowX: 'auto' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Indicadores lado a lado</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Qualidade e risco por plataforma.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {compareRows.map((r) => (
                <tr key={r.platformName} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8, fontWeight: 500, color: 'var(--text-primary)' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 7, background: r.color }} />{r.platformName}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.total}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.pos}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.falso}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.vel}</td>
                  <td style={{ padding: 8, textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.evid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div data-card className="card" style={{ padding: '16px 18px', marginTop: 20 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Criticidade por plataforma</h4>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Distribuição de Gravíssimo / Grave / Médio em cada fonte.</p>
        <div style={{ position: 'relative', width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareRows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="platformName" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)}`} />} />
              <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} iconType="rect" />
              <Bar dataKey="gravissimo" name="Gravíssimo" stackId="crit" fill={C.danger} />
              <Bar dataKey="grave" name="Grave" stackId="crit" fill={C.warning} />
              <Bar dataKey="medio" name="Médio" stackId="crit" fill={C.info} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
