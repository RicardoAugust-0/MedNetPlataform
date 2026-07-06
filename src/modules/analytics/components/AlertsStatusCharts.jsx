import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip, CenterLabel, gradientDef } from './ChartUtils.jsx';

const alpha = (hex, a) => (hex.startsWith('var') ? hex : hex + a);

export function ClassificacaoAlertasCard({ d, noData, selectedClassification, setSelectedClassification }) {
  const empty = noData || !d || !d.clf_total || !d.kpis;
  const keys = ['Positivo', 'Falso positivo', 'Não classificado'];
  const col = { Positivo: C.vinho, 'Falso positivo': C.info, 'Não classificado': 'var(--border-strong, #C9CDD6)' };
  const total = empty ? 1 : (d.kpis.total || 1);
  const isFiltered = selectedClassification && selectedClassification !== 'all';
  const rows = empty ? [] : keys.map((k) => ({ name: k, value: d.clf_total[k] || 0 }));

  return (
    <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Classificação dos alertas</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Resultado da análise feita pela operação no período selecionado.
          </p>
        </div>
        <div>
          <select
            value={selectedClassification}
            onChange={(e) => setSelectedClassification(e.target.value)}
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
            }}
          >
            <option value="all">Todas as classificações</option>
            <option value="Positivo">Positivo</option>
            <option value="Falso positivo">Falso positivo</option>
            <option value="Não classificado">Não classificado</option>
          </select>
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
            <i className="ti ti-chart-donut" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="85%"
                  paddingAngle={1}
                  stroke="var(--surface-0, #fff)"
                  strokeWidth={3}
                  cursor="pointer"
                  onClick={(entry) => setSelectedClassification(selectedClassification === entry.name ? 'all' : entry.name)}
                >
                  {rows.map((r, i) => (
                    <Cell key={i} fill={isFiltered && selectedClassification !== r.name ? alpha(col[r.name], '55') : col[r.name]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)} (${((v / total) * 100).toFixed(1)}%)`} />} />
                <Legend verticalAlign="bottom" iconType="rect" wrapperStyle={{ fontSize: 11.5, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel line1={fmt(d.kpis.total)} line2="alertas" />
          </>
        )}
      </div>
    </div>
  );
}

export function TaxaFalsoPositivoCard({ d, noData, selectedMonth }) {
  const empty = noData || !d || !d.falso_mensal || !d.falso_mensal.labels.length;
  const rows = empty ? [] : d.falso_mensal.labels.map((l, i) => ({ label: l, pct: d.falso_mensal.pct[i] }));

  return (
    <div data-card data-accent="warning" className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Taxa de falso positivo</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        {selectedMonth && selectedMonth !== 'all'
          ? '% dos alertas diários classificados como falso positivo.'
          : '% dos alertas do mês classificados como falso positivo.'}
      </p>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-chart-line" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>{gradientDef('falsoGrad', C.warning)}</defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={(v) => v + '%'} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${v}% falso positivo`} />} />
              <Area
                type="monotone"
                dataKey="pct"
                stroke={C.warning}
                strokeWidth={2.5}
                fill="url(#falsoGrad)"
                dot={rows.length > 15 ? false : { r: 4, fill: C.warning, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function TipoDeteccaoCard({ d, noData, selectedMonth, selectedType, setSelectedType, availableTypes = [] }) {
  const empty = noData || !d || !d.mensal_tipo || !d.mensal_tipo.labels.length;
  const fullLabels = empty ? [] : Object.keys(d.mensal_tipo.series);
  const short = (s) => (s.length > 26 ? s.slice(0, 24) + '…' : s);
  const rows = empty ? [] : d.mensal_tipo.labels.map((l, i) => {
    const row = { label: l };
    fullLabels.forEach((s) => { row[s] = d.mensal_tipo.series[s][i]; });
    return row;
  });
  const cols = [C.vinho, C.info, C.warning, C.success, C.vinho2];
  const isFiltered = !!selectedType;

  return (
    <div data-card data-accent="info" className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Tipo de detecção</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {selectedMonth && selectedMonth !== 'all'
              ? 'Quais gatilhos de fadiga foram acionados ao longo dos dias (top 5).'
              : 'Quais gatilhos de fadiga foram acionados ao longo dos meses (top 5).'}
          </p>
        </div>
        {availableTypes.length > 0 && (
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
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
              <option value="">Todos os tipos</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        {empty ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-chart-line" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v, name) => `${short(name)}: ${fmt(v)}`} />} />
              {fullLabels.map((s, i) => (
                <Line
                  key={s}
                  dataKey={s}
                  name={s}
                  type="monotone"
                  stroke={isFiltered && selectedType !== s ? alpha(cols[i % cols.length], '33') : cols[i % cols.length]}
                  strokeWidth={isFiltered && selectedType === s ? 3 : 2}
                  dot={rows.length > 15 ? false : { r: 3 }}
                />
              ))}
              <Legend
                formatter={(value) => short(value)}
                onClick={(entry) => setSelectedType(selectedType === entry.dataKey ? '' : entry.dataKey)}
                wrapperStyle={{ fontSize: 9.5, cursor: 'pointer', paddingTop: 8 }}
                iconType="circle"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
