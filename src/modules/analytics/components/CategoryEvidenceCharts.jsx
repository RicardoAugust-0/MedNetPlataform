import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { C, fmt, ChartTooltip, CenterLabel, EmptyChart } from './ChartUtils.js';

export function AlertasCategoriaCard({ d, noData }) {
  if (noData || !d?.categorias || Object.keys(d.categorias).length === 0) return null;
  const merged = {};
  Object.entries(d.categorias).forEach(([cat, value]) => {
    const key = String(cat).split(';')[0].trim();
    if (key) merged[key] = (merged[key] || 0) + value;
  });
  const labels = Object.keys(merged).sort((a, b) => merged[b] - merged[a]);
  const total = labels.reduce((sum, k) => sum + merged[k], 0) || 1;
  const colors = [C.vinho, C.info, C.warning, C.success, C.vinho2, C.orange];
  const rows = labels.map((name, i) => ({ name, value: merged[name], fill: colors[i % colors.length] }));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, height: 2, background: '#9E1A45', borderRadius: 2, display: 'inline-block' }}></span>
        Categorias de eventos
      </div>
      <div className="grid-equal-2col">
        <div data-card className="card" style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por categoria</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Distribuição proporcional de alertas por categoria.</p>
          <div style={{ position: 'relative', width: '100%', height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1} stroke="var(--surface-0, #fff)" strokeWidth={3}>
                  {rows.map((r) => <Cell key={r.name} fill={r.fill} />)}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)} alertas (${((v / total) * 100).toFixed(1)}%)`} />} />
                <Legend verticalAlign="bottom" iconType="rect" wrapperStyle={{ fontSize: 10.5, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel line1={fmt(total)} line2="categorizados" />
          </div>
        </div>
        <div data-card className="card" style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Resumo de categorias</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Detalhamento numérico dos alertas.</p>
          <div style={{ overflowY: 'auto', height: 240, marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                {labels.map((cat) => (
                  <tr key={cat} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px', fontWeight: 600, color: 'var(--text-primary)' }}>{cat}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{fmt(merged[cat])}</td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', color: 'var(--text-muted)' }}>{((merged[cat] / total) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EvidenciaVideoCard({ d, noData }) {
  const empty = noData || !d?.evidencia;
  const total = empty ? 1 : (d.evidencia.disp + d.evidencia.aguard) || 1;
  const rows = empty ? [] : [
    { name: 'Evidências disponíveis', value: d.evidencia.disp, fill: C.success },
    { name: 'Aguardando evidências', value: d.evidencia.aguard, fill: C.warning },
  ];
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Evidência em vídeo</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>Cobertura de evidências em vídeo disponíveis para auditoria.</p>
      <div style={{ position: 'relative', width: '100%', height: 220 }}>
        {empty ? <EmptyChart icon="ti-video" /> : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1} stroke="var(--surface-0, #fff)" strokeWidth={3}>
                  {rows.map((r) => <Cell key={r.name} fill={r.fill} />)}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)} (${((v / total) * 100).toFixed(1)}%)`} />} />
                <Legend verticalAlign="bottom" iconType="rect" wrapperStyle={{ fontSize: 10.5, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel line1={`${Math.round((d.evidencia.disp / total) * 100)}%`} line2="disponível" color={C.success} />
          </>
        )}
      </div>
    </div>
  );
}
