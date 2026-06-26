import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { fmt, kf, _ax } from './ChartUtils.js';

export function DistribuicaoUfCard({ d, noData, compare, selectedUf, setSelectedUf, availableUfs = [] }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.uf || !d.uf.labels.length) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.uf.labels,
        datasets: [
          {
            data: d.uf.valores,
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
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
            <i className="ti ti-map-pin" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FrotaBaseCard({ d, noData, compare, selectedCompany, setSelectedCompany, availableCompanies = [] }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.frota || !d.frota.labels.length) return;

    const short = (s) => (s.length > 20 ? s.slice(0, 18) + '…' : s);

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.frota.labels.map(short),
        datasets: [
          {
            data: d.frota.valores,
            backgroundColor: d.frota.valores.map((v, i) =>
              i === 0 ? 'rgba(158,26,69,0.65)' : 'rgba(194,74,106,0.55)'
            ),
            borderRadius: 5,
            maxBarThickness: 22,
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
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
            <i className="ti ti-building-warehouse" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}
