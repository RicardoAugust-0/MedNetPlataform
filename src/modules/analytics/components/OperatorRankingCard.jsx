import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { fmt, kf, axisLineProps, gridProps, ChartTooltip } from './ChartUtils.jsx';
import { apiFetch } from '../../../lib/analyticsApi.js';

// Ranking de operadores que fecharam alertas na planilha MaxTrack (coluna
// "Operador - Última Atualização"). Só ranking/contagem por enquanto — sem
// cálculo de remuneração. Card só existe pra MaxTrack (ver caller em
// FadigaCharts.jsx) e só aparece se a planilha atual tiver a coluna preenchida.
export default function OperatorRankingCard({ platformId, selectedMonth, startDate, endDate, selectedSeverity }) {
  const [ranking, setRanking] = useState([]);
  const [hourlyProductivity, setHourlyProductivity] = useState([]);
  const [activeTab, setActiveTab] = useState('ranking'); // 'ranking' | 'hourly'
  const [selectedOperator, setSelectedOperator] = useState('');
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!platformId) return;
    let active = true;

    Promise.resolve().then(() => {
      if (active) {
        setLoading(true);
        setErrored(false);
      }
    });

    const params = new URLSearchParams();
    params.set('platformId', platformId);
    if (selectedMonth) params.set('month', selectedMonth);
    if (selectedMonth === 'custom' && startDate && endDate) {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    if (selectedSeverity && selectedSeverity !== 'all') params.set('severity', selectedSeverity);

    apiFetch(`/api/analytics/operator-ranking?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Falha ao carregar ranking'))))
      .then((data) => {
        if (active) {
          const rankList = data.ranking || [];
          const hourlyList = data.hourlyProductivity || [];
          setRanking(rankList);
          setHourlyProductivity(hourlyList);
          
          if (hourlyList.length > 0) {
            setSelectedOperator(hourlyList[0].operador);
          } else {
            setSelectedOperator('');
          }
        }
      })
      .catch(() => { if (active) setErrored(true); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [platformId, selectedMonth, startDate, endDate, selectedSeverity]);

  const productivityByOperator = new Map(hourlyProductivity.map(op => [op.operador, op]));
  const top = ranking.slice(0, 10).map((r) => {
    const productivity = productivityByOperator.get(r.operador);
    return {
      name: r.operador,
      total: Number(r.total_eventos),
      gravissimo: Number(r.gravissimo),
      grave: Number(r.grave),
      medio: Number(r.medio),
      intervencoes: Number(r.intervencoes || 0),
      activeHours: productivity?.activeHours || 0,
      average: productivity?.average || 0,
    };
  });

  const selectedOpStats = hourlyProductivity.find(o => o.operador === selectedOperator);

  const hourlyChartData = selectedOpStats
    ? Array.from({ length: 24 }, (_, hour) => ({
        hour: `${String(hour).padStart(2, '0')}:00`,
        total: selectedOpStats.hourly[hour] || 0,
        intervencoes: selectedOpStats.hourlyInterventions[hour] || 0,
      }))
    : [];

  // Sem coluna preenchida nesta planilha: nada pra mostrar — nem o card nem o
  // header da seção aparecem (evita título "Ranking de operadores" órfão,
  // sem nada embaixo, quando a planilha atual não tem a coluna de operador).
  if (!loading && !errored && ranking.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
        Ranking de operadores
      </div>
      <div data-card data-accent="vinho" className="card" style={{ padding: '16px 18px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Ranking de operadores
        </h4>
        <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
          Quem fechou os alertas da planilha MaxTrack no período — contagem, intervenções e produtividade por hora.
        </p>

        {/* Tab switcher & Operator selector */}
        {!loading && !errored && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 2, background: 'var(--surface-1, rgba(255,255,255,0.05))', padding: 2, borderRadius: 6, border: '1px solid var(--border)' }}>
              <button
                onClick={() => setActiveTab('ranking')}
                style={{
                  padding: '3px 9px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  background: activeTab === 'ranking' ? '#9E1A45' : 'transparent',
                  color: activeTab === 'ranking' ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Ranking Geral
              </button>
              <button
                onClick={() => setActiveTab('hourly')}
                style={{
                  padding: '3px 9px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  background: activeTab === 'hourly' ? '#9E1A45' : 'transparent',
                  color: activeTab === 'hourly' ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                Produtividade Horária
              </button>
            </div>

            {activeTab === 'hourly' && hourlyProductivity.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 500 }}>Operador:</span>
                <select
                  value={selectedOperator}
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '11.5px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong, #CBD5E1)',
                    background: 'var(--background-card, #fff)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {hourlyProductivity.map((op) => (
                    <option key={op.operador} value={op.operador}>
                      {op.operador}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Tab content area */}
        <div style={{ position: 'relative', width: '100%', minHeight: '300px' }}>
          {!loading && !errored && activeTab === 'ranking' && top.length > 0 && (
            <div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
                  <YAxis type="category" dataKey="name" {...axisLineProps} width={140} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(v) => `${fmt(v)} alertas fechados`}
                        footer={(row) => `Produtividade: ${row.average.toFixed(1)} alertas/h · Horas ativas: ${fmt(row.activeHours)} · Intervenções: ${fmt(row.intervencoes)} · Gravíssimo: ${fmt(row.gravissimo)} · Grave: ${fmt(row.grave)} · Médio: ${fmt(row.medio)}`}
                      />
                    }
                  />
                  <Bar dataKey="total" fill="rgba(158,26,69,0.65)" radius={[0, 5, 5, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>

              <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-0, #fff)', zIndex: 1 }}>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '9px 10px', fontWeight: 600 }}>Operador</th>
                      <th style={{ padding: '9px 10px', fontWeight: 600, textAlign: 'right' }}>Fechados</th>
                      <th style={{ padding: '9px 10px', fontWeight: 600, textAlign: 'right' }}>Horas ativas</th>
                      <th style={{ padding: '9px 10px', fontWeight: 600, textAlign: 'right' }}>Alertas/h</th>
                      <th style={{ padding: '9px 10px', fontWeight: 600, textAlign: 'right' }}>Intervenções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map(row => (
                      <tr key={row.name} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 10px', color: 'var(--text-primary)', fontWeight: 600 }}>{row.name}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(row.total)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(row.activeHours)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', color: '#9E1A45', fontWeight: 700 }}>{row.average.toFixed(1)}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmt(row.intervencoes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && !errored && activeTab === 'hourly' && selectedOpStats && (
            <div>
              {/* Summary stat cards */}
              <div style={{ marginBottom: '16px', background: 'rgba(158,26,69,0.03)', border: '1px solid rgba(158,26,69,0.15)', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.4 }}>
                  {selectedOpStats.operador} fecha em média <span style={{ color: '#9E1A45', fontSize: '14.5px', fontWeight: 700 }}>{selectedOpStats.average.toFixed(1)}</span> alertas por hora ativa.
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Total de <strong>{selectedOpStats.total}</strong> alertas fechados (sendo <strong>{selectedOpStats.intervencoes}</strong> intervenções) ao longo de <strong>{selectedOpStats.activeHours}</strong> {selectedOpStats.activeHours === 1 ? 'hora ativa' : 'horas ativas'}.
                </div>
              </div>

              {/* Hourly Chart */}
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={hourlyChartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="hour" {...axisLineProps} tick={{ ...axisLineProps.tick, fontSize: 9.5 }} />
                  <YAxis {...axisLineProps} tickFormatter={fmt} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        formatter={(v, name) => {
                          const label = name === 'total' ? 'Alertas fechados' : 'Intervenções';
                          return `${fmt(v)} ${label.toLowerCase()}`;
                        }}
                      />
                    }
                  />
                  <Bar dataKey="total" name="total" fill="rgba(158,26,69,0.75)" radius={[3, 3, 0, 0]} maxBarSize={15} />
                  <Bar dataKey="intervencoes" name="intervencoes" fill="rgba(42,141,217,0.75)" radius={[3, 3, 0, 0]} maxBarSize={15} />
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px', fontSize: '10.5px', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: 'rgba(158,26,69,0.75)', borderRadius: '2px' }}></span>
                  Total de Alertas
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '10px', height: '10px', backgroundColor: 'rgba(42,141,217,0.75)', borderRadius: '2px' }}></span>
                  Intervenções
                </span>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', minHeight: '300px' }}>
              <i className="ti ti-loader-2" style={{ fontSize: '24px', color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }}></i>
            </div>
          )}
          {!loading && errored && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px', minHeight: '300px' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Não foi possível carregar o ranking</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
