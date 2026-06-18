import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import { fmt, kf, _ax } from './ChartUtils.js';

export function MotoristasMaisAlertasCard({ d, noData }) {
  const [driversViewMode, setDriversViewMode] = useState('chart');
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.top_motoristas || !d.top_motoristas.labels.length) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.top_motoristas.labels,
        datasets: [
          {
            data: d.top_motoristas.valores,
            backgroundColor: 'rgba(158,26,69,0.7)',
            borderRadius: 5,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.x) + ' alertas' } },
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
  }, [d, noData, driversViewMode]); // Re-create chart if view mode toggles back to chart

  return (
    <div data-card className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Motoristas com mais alertas</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Ranking dos motoristas com maior volume de eventos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface-1, rgba(255,255,255,0.05))', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setDriversViewMode('chart')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              background: driversViewMode === 'chart' ? 'var(--surface-0, #fff)' : 'transparent',
              color: driversViewMode === 'chart' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Gráfico
          </button>
          <button
            onClick={() => setDriversViewMode('table')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '4px',
              background: driversViewMode === 'table' ? 'var(--surface-0, #fff)' : 'transparent',
              color: driversViewMode === 'table' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Tabela
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height: '400px', display: driversViewMode === 'chart' ? 'block' : 'none', marginTop: '14px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '150px' }}>
            <i className="ti ti-user-exclamation" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
      {driversViewMode === 'table' && (
        <div style={{ overflowY: 'auto', height: '400px', marginTop: '14px' }}>
          {noData || !d?.top_motoristas?.labels?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', height: '100%' }}>
              <i className="ti ti-user-exclamation" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Pos.</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600 }}>Motorista</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Alertas</th>
                  <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {d.top_motoristas.labels.map((driver, idx) => (
                  <tr key={driver} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.03))' }}>
                    <td style={{ padding: '8px 4px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      #{idx + 1}
                    </td>
                    <td style={{ padding: '8px 4px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }} title={driver}>
                      {driver}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>
                      {d.top_motoristas.valores[idx].toLocaleString('pt-BR')}
                    </td>
                    <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                      <Link
                        to={`/dossies?driver=${encodeURIComponent(driver)}`}
                        className="btn btn-sm btn-ghost"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          fontSize: '11px',
                          color: 'var(--accent-500, #9E1A45)',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        <i className="ti ti-arrow-up-right"></i> Dossiê
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function VeiculosMaisAlertasCard({ d, noData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.top_placas || !d.top_placas.labels.length) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.top_placas.labels,
        datasets: [
          {
            data: d.top_placas.valores,
            backgroundColor: 'rgba(42,141,217,0.7)',
            borderRadius: 5,
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.x) + ' alertas' } },
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
  }, [d, noData]);

  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Top 15 veículos (placa)</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Maior número de alertas no período selecionado.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '400px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '150px' }}>
            <i className="ti ti-truck" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}
