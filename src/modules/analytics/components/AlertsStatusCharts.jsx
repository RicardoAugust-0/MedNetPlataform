import { ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { C, fmt, kf, axisLineProps, gridProps, ChartTooltip, CenterLabel, EmptyChart } from './ChartUtils.jsx';

export function ClassificacaoAlertasCard({ d, noData, selectedClassification, setSelectedClassification }) {
  const keys = ['Positivo', 'Falso positivo', 'Não classificado'];
  const colors = { Positivo: C.vinho, 'Falso positivo': C.info, 'Não classificado': 'var(--border-strong, #C9CDD6)' };
  const total = d?.kpis?.total || 0;
  const rows = keys.map((k) => ({ name: k, value: d?.clf_total?.[k] || 0, fill: colors[k] }));
  const empty = noData || !total;
  const toggleClassification = (name) => setSelectedClassification(selectedClassification === name ? 'all' : name);

  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Classificação dos alertas</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>Resultado da análise feita pela operação no período selecionado.</p>
        </div>
        <select value={selectedClassification} onChange={(e) => setSelectedClassification(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
          <option value="all">Todas as classificações</option>
          {keys.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div style={{ position: 'relative', width: '100%', height: 260 }}>
        {empty ? <EmptyChart icon="ti-chart-donut" /> : (
          <>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius="60%" outerRadius="85%" paddingAngle={1} stroke="var(--surface-0, #fff)" strokeWidth={3} onClick={(entry) => toggleClassification(entry.name)} cursor="pointer">
                  {rows.map((r) => <Cell key={r.name} fill={r.fill} opacity={selectedClassification === 'all' || selectedClassification === r.name ? 1 : 0.35} style={{ cursor: 'pointer' }} />)}
                </Pie>
                <Tooltip content={<ChartTooltip formatter={(v, name) => `${name}: ${fmt(v)} (${((v / (total || 1)) * 100).toFixed(1)}%)`} />} />
                <Legend verticalAlign="bottom" iconType="rect" wrapperStyle={{ fontSize: 10.5, paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <CenterLabel line1={fmt(total)} line2="alertas" />
          </>
        )}
      </div>
    </div>
  );
}

export function TaxaFalsoPositivoCard({ d, noData, selectedMonth }) {
  const empty = noData || !d?.falso_mensal?.labels?.length;
  const rows = empty ? [] : d.falso_mensal.labels.map((label, i) => ({ label, pct: d.falso_mensal.pct[i] || 0 }));
  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Taxa de falso positivo</h4>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>{selectedMonth && selectedMonth !== 'all' ? '% dos alertas diários classificados como falso positivo.' : '% dos alertas do mês classificados como falso positivo.'}</p>
      <div style={{ position: 'relative', width: '100%', height: 220 }}>
        {empty ? <EmptyChart icon="ti-chart-line" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTooltip formatter={(v) => `${v}% falso positivo`} />} />
              <Area type="monotone" dataKey="pct" stroke={C.warning} fill="rgba(232,160,32,0.10)" strokeWidth={2.5} dot={rows.length <= 15} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function TipoDeteccaoCard({ d, noData, selectedMonth, selectedType, setSelectedType, availableTypes = [] }) {
  const empty = noData || !d?.mensal_tipo?.labels?.length;
  const seriesKeys = empty ? [] : Object.keys(d.mensal_tipo.series || {});
  const colors = [C.vinho, C.info, C.warning, C.success, C.vinho2];
  const rows = empty ? [] : d.mensal_tipo.labels.map((label, i) => {
    const row = { label };
    seriesKeys.forEach((k) => { row[k] = d.mensal_tipo.series[k][i] || 0; });
    return row;
  });
  const short = (s) => (s.length > 26 ? `${s.slice(0, 24)}…` : s);

  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Tipo de detecção</h4>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>{selectedMonth && selectedMonth !== 'all' ? 'Gatilhos de fadiga ao longo dos dias (top 5).' : 'Gatilhos de fadiga ao longo dos meses (top 5).'}</p>
        </div>
        {availableTypes.length > 0 && (
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--surface-1)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', maxWidth: 180 }}>
            <option value="">Todos os tipos</option>
            {availableTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>
      <div style={{ position: 'relative', width: '100%', height: 220 }}>
        {empty ? <EmptyChart icon="ti-chart-line" /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisLineProps} />
              <YAxis {...axisLineProps} tickFormatter={kf} />
              <Tooltip content={<ChartTooltip formatter={(v, name) => `${short(name)}: ${fmt(v)}`} />} />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 9.5, paddingTop: 8, cursor: 'pointer' }} formatter={short} onClick={(entry) => setSelectedType(selectedType === entry.dataKey ? '' : entry.dataKey)} />
              {seriesKeys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={colors[i % colors.length]} strokeWidth={selectedType && selectedType !== k ? 1.4 : 2.4} strokeOpacity={selectedType && selectedType !== k ? 0.28 : 1} dot={rows.length <= 15} activeDot={{ r: 5, onClick: () => setSelectedType(selectedType === k ? '' : k), style: { cursor: 'pointer' } }} onClick={() => setSelectedType(selectedType === k ? '' : k)} style={{ cursor: 'pointer' }} />)}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
