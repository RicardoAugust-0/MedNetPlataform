import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { fmt, kf, axisLineProps, gridProps, ChartTooltip } from './ChartUtils.jsx';

function EmptyState({ icon }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
      <i className={`ti ${icon}`} style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
      <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
    </div>
  );
}

export function DistribuicaoUfCard({ d, noData, compare, selectedUf, setSelectedUf, availableUfs = [] }) {
  const empty = noData || !d || !d.uf || !d.uf.labels.length;
  const rows = empty ? [] : d.uf.labels.map((l, i) => ({ name: l, valor: d.uf.valores[i] }));
  const isFiltered = !compare && !!selectedUf;

  return (
    <div data-card data-accent="info" className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Distribuição por UF</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Estado onde o alerta foi registrado.
          </p>
        </div>
        {!compare && availableUfs.length > 0 && (
          <div>
            <select
              value={selectedUf}
              onChange={(e) => setSelectedUf(e.target.value)}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                background: 'var(--surface-1, rgba(255,255,255,0.05))',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
                maxWidth: '180px',
              }}
            >
              <option value="">Todos os estados</option>
              {availableUfs.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', width: '100%', height: '300px' }}>
        {empty ? (
          <EmptyState icon="ti-map-pin" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
              <YAxis type="category" dataKey="name" {...axisLineProps} width={40} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar
                dataKey="valor"
                radius={[0, 5, 5, 0]}
                maxBarSize={18}
                cursor={compare ? 'default' : 'pointer'}
                onClick={(data) => { if (!compare) setSelectedUf(selectedUf === data.name ? '' : data.name); }}
              >
                {rows.map((r, i) => (
                  <Cell key={i} fill={isFiltered && selectedUf !== r.name ? 'rgba(42,141,217,0.28)' : 'rgba(42,141,217,0.7)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function FrotaBaseCard({ d, noData, compare, selectedCompany, setSelectedCompany, availableCompanies = [] }) {
  const empty = noData || !d || !d.frota || !d.frota.labels.length;
  const short = (s) => (s.length > 20 ? s.slice(0, 18) + '…' : s);
  const rows = empty ? [] : d.frota.labels.map((l, i) => ({ name: short(l), fullName: l, valor: d.frota.valores[i] }));
  const isFiltered = !compare && !!selectedCompany;

  return (
    <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por frota / base</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Distribuição de ocorrências entre frotas, rodagem e filiais.
          </p>
        </div>
        {!compare && availableCompanies.length > 0 && (
          <div>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              style={{
                padding: '4px 8px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                background: 'var(--surface-1, rgba(255,255,255,0.05))',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
                maxWidth: '180px',
              }}
            >
              <option value="">Todas as empresas</option>
              {availableCompanies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', width: '100%', height: '300px' }}>
        {empty ? (
          <EmptyState icon="ti-building-warehouse" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
              <YAxis type="category" dataKey="name" {...axisLineProps} width={100} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
              <Bar
                dataKey="valor"
                radius={[0, 5, 5, 0]}
                maxBarSize={22}
                cursor={compare ? 'default' : 'pointer'}
                onClick={(data) => { if (!compare) setSelectedCompany(selectedCompany === data.fullName ? '' : data.fullName); }}
              >
                {rows.map((r, i) => {
                  if (isFiltered) {
                    return <Cell key={i} fill={selectedCompany === r.fullName ? 'rgba(158,26,69,0.75)' : 'rgba(158,26,69,0.18)'} />;
                  }
                  return <Cell key={i} fill={i === 0 ? 'rgba(158,26,69,0.65)' : 'rgba(194,74,106,0.55)'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
