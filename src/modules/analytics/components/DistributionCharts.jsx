import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip, EmptyChart } from './ChartUtils.jsx';

function HBar({ rows, color = C.info, height = 300, emptyIcon = 'ti-chart-bar' }) {
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {!rows.length ? <EmptyChart icon={emptyIcon} /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
            <YAxis type="category" dataKey="label" {...axisLineProps} width={110} />
            <Tooltip content={<ChartTooltip formatter={(v) => `${fmt(v)} alertas`} />} />
            <Bar dataKey="valor" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {rows.map((r, i) => <Cell key={r.label} fill={Array.isArray(color) ? color[i % color.length] : color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function DistribuicaoUfCard({ d, noData, compare, selectedUf, setSelectedUf, availableUfs = [] }) {
  const rows = noData || !d?.uf?.labels?.length ? [] : d.uf.labels.map((label, i) => ({ label, valor: d.uf.valores[i] }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Distribuição por UF</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>Estado onde o alerta foi registrado.</p>
        </div>
        {!compare && availableUfs.length > 0 && (
          <select value={selectedUf} onChange={(e) => setSelectedUf(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', maxWidth: 180 }}>
            <option value="">Todos os estados</option>
            {availableUfs.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        )}
      </div>
      <HBar rows={rows} color="rgba(42,141,217,0.7)" emptyIcon="ti-map-pin" />
    </div>
  );
}

export function FrotaBaseCard({ d, noData, compare, selectedCompany, setSelectedCompany, availableCompanies = [] }) {
  const rows = noData || !d?.frota?.labels?.length ? [] : d.frota.labels.map((label, i) => ({ label: label.length > 20 ? `${label.slice(0, 18)}…` : label, valor: d.frota.valores[i] }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por frota / base</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>Distribuição de ocorrências entre frotas, rodagem e filiais.</p>
        </div>
        {!compare && availableCompanies.length > 0 && (
          <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', maxWidth: 180 }}>
            <option value="">Todas as empresas</option>
            {availableCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <HBar rows={rows} color={['rgba(158,26,69,0.65)', 'rgba(194,74,106,0.55)']} emptyIcon="ti-building-warehouse" />
    </div>
  );
}
