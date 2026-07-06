import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { fmt, kf, _ax } from './ChartUtils.js';
import { apiFetch } from '../../../lib/analyticsApi.js';

// Ranking de operadores que fecharam alertas na planilha MaxTrack (coluna
// "Operador - Última Atualização"). Só ranking/contagem por enquanto — sem
// cálculo de remuneração. Card só existe pra MaxTrack (ver caller em
// FadigaCharts.jsx) e só aparece se a planilha atual tiver a coluna preenchida.
export default function OperatorRankingCard({ platformId, selectedMonth, startDate, endDate, selectedSeverity }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
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

  const top = ranking.slice(0, 10);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    if (!canvasRef.current || !top.length) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: top.map((r) => r.operador),
        datasets: [
          {
            data: top.map((r) => Number(r.total_eventos)),
            backgroundColor: 'rgba(158,26,69,0.65)',
            borderRadius: 5,
            maxBarThickness: 20,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const r = top[c.dataIndex];
                return ` ${fmt(r.total_eventos)} alertas fechados`;
              },
              afterLabel: (c) => {
                const r = top[c.dataIndex];
                return `Gravíssimo: ${fmt(r.gravissimo)} · Grave: ${fmt(r.grave)} · Médio: ${fmt(r.medio)}`;
              },
            },
          },
        },
        scales: {
          x: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
          y: _ax({ grid: { display: false }, ticks: { font: { size: 10.5 } } }),
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [top]);

  // Sem coluna preenchida nesta planilha: nada pra mostrar, o card não aparece.
  if (!loading && !errored && ranking.length === 0) return null;

  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        Ranking de operadores
      </h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Quem fechou os alertas da planilha MaxTrack no período — contagem, sem cálculo de remuneração ainda.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '300px' }}>
        <canvas ref={canvasRef}></canvas>
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
  );
}
