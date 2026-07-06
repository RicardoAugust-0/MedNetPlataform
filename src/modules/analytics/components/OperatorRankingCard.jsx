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
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!platformId) return;
    let active = true;
    setLoading(true);
    setErrored(false);

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
      .then((data) => { if (active) setRanking(data.ranking || []); })
      .catch(() => { if (active) setErrored(true); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [platformId, selectedMonth, startDate, endDate, selectedSeverity]);

  const top = ranking.slice(0, 10).map((r) => ({
    name: r.operador,
    total: Number(r.total_eventos),
    gravissimo: Number(r.gravissimo),
    grave: Number(r.grave),
    medio: Number(r.medio),
  }));

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
          Quem fechou os alertas da planilha MaxTrack no período — contagem, sem cálculo de remuneração ainda.
        </p>
        <div style={{ position: 'relative', width: '100%', height: '300px' }}>
          {!loading && !errored && top.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" {...axisLineProps} tickFormatter={kf} />
                <YAxis type="category" dataKey="name" {...axisLineProps} width={140} tick={{ ...axisLineProps.tick, fontSize: 10.5 }} />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v) => `${fmt(v)} alertas fechados`}
                      footer={(row) => `Gravíssimo: ${fmt(row.gravissimo)} · Grave: ${fmt(row.grave)} · Médio: ${fmt(row.medio)}`}
                    />
                  }
                />
                <Bar dataKey="total" fill="rgba(158,26,69,0.65)" radius={[0, 5, 5, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center' }}>
              <i className="ti ti-loader-2" style={{ fontSize: '24px', color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }}></i>
            </div>
          )}
          {!loading && errored && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Não foi possível carregar o ranking</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
