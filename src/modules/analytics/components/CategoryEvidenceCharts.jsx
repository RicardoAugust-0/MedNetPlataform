import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';
import { C, fmt, ChartTooltip, CenterLabel } from './ChartUtils.jsx';

export function AlertasCategoriaCard({ d, noData }) {
  if (noData || !d || !d.categorias || Object.keys(d.categorias).length === 0) return null;

  const catLabels = Object.keys(d.categorias);
  const catValores = Object.values(d.categorias);
  const total = catValores.reduce((a, b) => a + b, 0) || 1;
  const cols = [C.vinho, C.info, C.warning, C.success, C.vinho2, C.orange];
  const rows = catLabels.map((cat, i) => ({ name: cat, value: d.categorias[cat], fill: cols[i % cols.length] }));

  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
        Categorias de eventos
      </div>
      <div className="grid-equal-2col">
        <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por categoria</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
            Distribuição proporcional de alertas por categoria.
          </p>
          <div style={{ position: 'relative', width: '100%', height: '240px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1} stroke="var(--surface-0, #fff)" strokeWidth={3}>
                  {rows.map((r, i) => (
                    <Cell key={i} fill={r.fill} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)} alertas (${((v / total) * 100).toFixed(1)}%)`} />} />
                <Legend verticalAlign="bottom" iconType="rect" wrapperStyle={{ fontSize: 10.5, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel line1={fmt(total)} line2="categorizados" />
          </div>
        </div>
        <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Resumo de categorias</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
            Detalhamento numérico e representação proporcional dos alertas.
          </p>
          <div style={{ overflowY: 'auto', height: '240px', marginTop: '10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Categoria</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Alertas</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Representação</th>
                </tr>
              </thead>
              <tbody>
                {catLabels.map((cat) => {
                  const val = d.categorias[cat];
                  const pctVal = ((val / total) * 100).toFixed(1);
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.03))' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {cat}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {val.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-muted)' }}>
                        {pctVal}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EvidenciaVideoCard({ d, noData }) {
  const semEvidencia = !noData && (!d || !d.evidencia);
  const empty = noData || semEvidencia;
  const total = empty ? 1 : (d.evidencia.disp + d.evidencia.aguard) || 1;
  const rows = empty ? [] : [
    { name: 'Evidências disponíveis', value: d.evidencia.disp, fill: C.success },
    { name: 'Aguardando evidências', value: d.evidencia.aguard, fill: C.warning },
  ];

  return (
    <div data-card data-accent="success" className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Evidência em vídeo</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Cobertura de evidências em vídeo disponíveis para auditoria.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-video" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
            {semEvidencia && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Esta plataforma/período não informa evidência em vídeo</div>}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1} stroke="var(--surface-0, #fff)" strokeWidth={3}>
                  {rows.map((r, i) => (
                    <Cell key={i} fill={r.fill} />
                  ))}
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
