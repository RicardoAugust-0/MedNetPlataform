import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { fmt, kf, axisLineProps, gridProps, ChartTooltip } from './ChartUtils.jsx';
import { apiFetch } from '../../../lib/analyticsApi.js';

const ACCENT = '#9E1A45';
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function heatColor(value, max) {
  if (!value || !max) return 'var(--surface-1, #F4F6F8)';
  const opacity = 0.16 + (value / max) * 0.74;
  return `rgba(158, 26, 69, ${opacity.toFixed(2)})`;
}

function controlStyle(extra = {}) {
  return {
    padding: '5px 9px',
    fontSize: 11.5,
    borderRadius: 6,
    border: '1px solid var(--border-strong, #CBD5E1)',
    background: 'var(--background-card, #fff)',
    color: 'var(--text-primary)',
    fontWeight: 600,
    outline: 'none',
    ...extra,
  };
}

export default function OperatorRankingCard({ platformId, selectedSeverity }) {
  const [ranking, setRanking] = useState([]);
  const [hourlyProductivity, setHourlyProductivity] = useState([]);
  const [activeTab, setActiveTab] = useState('hourly');
  const [selectedHour, setSelectedHour] = useState(() => new Date().getHours());
  const [period, setPeriod] = useState('today');
  const [startDate, setStartDate] = useState(() => localDateInputValue());
  const [endDate, setEndDate] = useState(() => localDateInputValue());
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!platformId) return undefined;
    let active = true;
    const controller = new AbortController();

    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setErrored(false);
      }
    });

    const params = new URLSearchParams({ platformId });
    if (period === 'today') {
      const today = localDateInputValue();
      params.set('month', 'custom');
      params.set('startDate', today);
      params.set('endDate', today);
    } else if (period === 'last7') {
      const today = new Date();
      const firstDay = new Date(today);
      firstDay.setDate(today.getDate() - 6);
      params.set('month', 'custom');
      params.set('startDate', localDateInputValue(firstDay));
      params.set('endDate', localDateInputValue(today));
    } else if (period === 'month') {
      params.set('month', localDateInputValue().slice(0, 7));
    } else if (period === 'custom' && startDate && endDate) {
      params.set('month', 'custom');
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    if (selectedSeverity && selectedSeverity !== 'all') params.set('severity', selectedSeverity);

    apiFetch(`/api/analytics/operator-ranking?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Falha ao carregar ranking'))))
      .then((data) => {
        if (!active) return;
        setRanking(data.ranking || []);
        setHourlyProductivity(data.hourlyProductivity || []);
      })
      .catch((error) => {
        if (active && error?.name !== 'AbortError') setErrored(true);
      })
      .finally(() => { if (active) setLoading(false); });

    return () => {
      active = false;
      controller.abort();
    };
  }, [platformId, period, startDate, endDate, selectedSeverity]);

  const productivityByOperator = useMemo(
    () => new Map(hourlyProductivity.map((operator) => [operator.operador, operator])),
    [hourlyProductivity],
  );

  const operators = useMemo(() => ranking.map((row) => {
    const productivity = productivityByOperator.get(row.operador);
    return {
      name: row.operador,
      total: Number(row.total_eventos || 0),
      gravissimo: Number(row.gravissimo || 0),
      grave: Number(row.grave || 0),
      medio: Number(row.medio || 0),
      intervencoes: Number(row.intervencoes || 0),
      activeHours: Number(productivity?.activeHours || 0),
      average: Number(productivity?.average || 0),
      hourly: HOURS.map((hour) => Number(productivity?.hourly?.[hour] || 0)),
      hourlyInterventions: HOURS.map((hour) => Number(productivity?.hourlyInterventions?.[hour] || 0)),
    };
  }), [ranking, productivityByOperator]);

  const selectedHourRows = useMemo(() => operators
    .map((operator) => ({
      ...operator,
      closed: operator.hourly[selectedHour],
      hourInterventions: operator.hourlyInterventions[selectedHour],
    }))
    .filter((operator) => operator.closed > 0 || operator.hourInterventions > 0)
    .sort((a, b) => b.closed - a.closed || a.name.localeCompare(b.name, 'pt-BR')),
  [operators, selectedHour]);

  const hourTotal = selectedHourRows.reduce((sum, row) => sum + row.closed, 0);
  const hourInterventions = selectedHourRows.reduce((sum, row) => sum + row.hourInterventions, 0);
  const maxHourlyValue = Math.max(0, ...operators.flatMap((operator) => operator.hourly));
  const leader = selectedHourRows[0];

  const tabButton = (tab) => ({
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    border: 0,
    borderRadius: 4,
    background: activeTab === tab ? ACCENT : 'transparent',
    color: activeTab === tab ? '#fff' : 'var(--text-muted)',
    cursor: 'pointer',
  });

  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, height: 2, background: ACCENT, borderRadius: 2 }} />
        Produtividade dos operadores
      </div>

      <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas fechados por operador</h4>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '2px 0 14px' }}>
          Consulte uma hora específica ou compare o desempenho no período inteiro.
        </p>

        {!loading && !errored && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-1, #F4F6F8)', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setActiveTab('hourly')} style={tabButton('hourly')}>Por hora</button>
              <button type="button" onClick={() => setActiveTab('ranking')} style={tabButton('ranking')}>Resumo do período</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>Período</span>
                <select value={period} onChange={(event) => setPeriod(event.target.value)} style={controlStyle({ cursor: 'pointer' })}>
                  <option value="today">Hoje</option>
                  <option value="last7">Últimos 7 dias</option>
                  <option value="month">Mês atual</option>
                  <option value="custom">Personalizado</option>
                  <option value="all">Todo o histórico</option>
                </select>
              </label>
              {period === 'custom' && (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>De <input aria-label="Data inicial" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} style={controlStyle({ fontWeight: 400 })} /></label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>Até <input aria-label="Data final" type="date" value={endDate} min={startDate} max={localDateInputValue()} onChange={(event) => setEndDate(event.target.value)} style={controlStyle({ fontWeight: 400 })} /></label>
                </>
              )}
              {activeTab === 'hourly' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>Hora</span>
                  <select aria-label="Hora consultada" value={selectedHour} onChange={(event) => setSelectedHour(Number(event.target.value))} style={controlStyle({ color: ACCENT, minWidth: 76, cursor: 'pointer' })}>
                    {HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}

        <div style={{ position: 'relative', width: '100%', minHeight: 300 }}>
          {!loading && !errored && activeTab === 'hourly' && operators.length > 0 && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }}>
                {[
                  ['Fechados', fmt(hourTotal), `${hourLabel(selectedHour)}–${hourLabel((selectedHour + 1) % 24)}`],
                  ['Operadores ativos', fmt(selectedHourRows.length), 'com atividade na faixa'],
                  ['Líder da hora', leader?.name || '—', leader ? `${fmt(leader.closed)} alertas fechados` : 'sem fechamentos'],
                  ['Intervenções', fmt(hourInterventions), 'na mesma faixa horária'],
                ].map(([label, value, detail]) => (
                  <div key={label} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1, #F8FAFC)', minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
                    <div title={String(value)} style={{ marginTop: 2, fontSize: 17, color: label === 'Fechados' ? ACCENT : 'var(--text-primary)', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
                    <div style={{ marginTop: 1, fontSize: 10, color: 'var(--text-muted)' }}>{detail}</div>
                  </div>
                ))}
              </div>

              {selectedHourRows.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(220, selectedHourRows.length * 34)}>
                  <BarChart data={selectedHourRows} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} horizontal={false} />
                    <XAxis type="number" allowDecimals={false} {...axisLineProps} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="name" {...axisLineProps} width={140} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
                    <Tooltip content={<ChartTooltip formatter={(value) => `${fmt(value)} alertas fechados`} footer={(row) => `${fmt(row.hourInterventions)} intervenções nesta hora`} />} />
                    <Bar dataKey="closed" fill="rgba(158,26,69,0.78)" radius={[0, 5, 5, 0]} maxBarSize={22}>
                      <LabelList dataKey="closed" position="right" formatter={fmt} style={{ fill: 'var(--text-primary)', fontSize: 10.5, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  Nenhum alerta fechado entre {hourLabel(selectedHour)} e {hourLabel((selectedHour + 1) % 24)}.
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 7 }}>
                  Visão 24h — clique em uma célula para consultar aquela hora
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%', minWidth: 820, padding: 5, fontSize: 9.5 }}>
                    <thead>
                      <tr>
                        <th style={{ position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface-0, #fff)', textAlign: 'left', minWidth: 130, color: 'var(--text-muted)', paddingLeft: 4 }}>Operador</th>
                        {HOURS.map((hour) => <th key={hour} style={{ color: hour === selectedHour ? ACCENT : 'var(--text-muted)', fontWeight: hour === selectedHour ? 800 : 500 }}>{String(hour).padStart(2, '0')}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {operators.map((operator) => (
                        <tr key={operator.name}>
                          <th title={operator.name} style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--surface-0, #fff)', textAlign: 'left', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600, paddingLeft: 4 }}>{operator.name}</th>
                          {operator.hourly.map((value, hour) => (
                            <td key={hour} style={{ padding: 0 }}>
                              <button
                                type="button"
                                title={`${operator.name} · ${hourLabel(hour)} · ${fmt(value)} fechados`}
                                aria-label={`Consultar ${hourLabel(hour)}: ${operator.name}, ${fmt(value)} alertas fechados`}
                                onClick={() => setSelectedHour(hour)}
                                style={{ width: '100%', minWidth: 23, height: 24, padding: 0, borderRadius: 4, border: hour === selectedHour ? `2px solid ${ACCENT}` : '1px solid transparent', background: heatColor(value, maxHourlyValue), color: value / Math.max(maxHourlyValue, 1) > 0.48 ? '#fff' : 'var(--text-primary)', fontSize: 9.5, fontWeight: value ? 700 : 400, cursor: 'pointer' }}
                              >
                                {value || '·'}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {period !== 'today' && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Cada célula soma os fechamentos daquela faixa horária em todos os dias selecionados.</div>}
              </div>
            </div>
          )}

          {!loading && !errored && activeTab === 'ranking' && operators.length > 0 && (
            <div>
              <ResponsiveContainer width="100%" height={Math.max(260, operators.length * 34)}>
                <BarChart data={operators} layout="vertical" margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
                  <YAxis type="category" dataKey="name" {...axisLineProps} width={140} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
                  <Tooltip content={<ChartTooltip formatter={(value) => `${fmt(value)} alertas fechados`} footer={(row) => `${row.average.toFixed(1)} alertas/h ativa · ${fmt(row.activeHours)} horas ativas · ${fmt(row.intervencoes)} intervenções`} />} />
                  <Bar dataKey="total" fill="rgba(158,26,69,0.68)" radius={[0, 5, 5, 0]} maxBarSize={22}>
                    <LabelList dataKey="total" position="right" formatter={fmt} style={{ fill: 'var(--text-primary)', fontSize: 10.5, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '9px 10px' }}>Operador</th><th style={{ padding: '9px 10px', textAlign: 'right' }}>Fechados</th><th style={{ padding: '9px 10px', textAlign: 'right' }}>Horas ativas</th><th style={{ padding: '9px 10px', textAlign: 'right' }}>Alertas/h</th><th style={{ padding: '9px 10px', textAlign: 'right' }}>Intervenções</th>
                  </tr></thead>
                  <tbody>{operators.map((row) => (
                    <tr key={row.name} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 10px', fontWeight: 600 }}>{row.name}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(row.total)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(row.activeHours)}</td><td style={{ padding: '9px 10px', textAlign: 'right', color: ACCENT, fontWeight: 700 }}>{row.average.toFixed(1)}</td><td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(row.intervencoes)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && !errored && operators.length === 0 && (
            <div style={{ minHeight: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)', textAlign: 'center' }}>
              <i className="ti ti-chart-bar-off" style={{ fontSize: 28 }} />
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Nenhum alerta fechado neste período</div>
              <div style={{ fontSize: 11.5 }}>Altere o período para consultar outro dia ou intervalo.</div>
            </div>
          )}
          {loading && <div style={{ position: 'absolute', inset: 0, minHeight: 300, display: 'grid', placeItems: 'center' }}><i className="ti ti-loader-2" style={{ fontSize: 24, color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} /></div>}
          {!loading && errored && <div style={{ minHeight: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--text-muted)' }}><i className="ti ti-alert-triangle" style={{ fontSize: 28 }} /><div style={{ fontSize: 12, fontWeight: 500 }}>Não foi possível carregar os dados dos operadores</div></div>}
        </div>
      </div>
    </div>
  );
}
