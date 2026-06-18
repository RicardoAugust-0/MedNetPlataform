import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { C, fmt, kf, _ax } from './ChartUtils.js';

export function HoraDiaCard({ d, noData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.hora) return;

    chartRef.current = new Chart(canvasRef.current, {
      data: {
        labels: d.hora.horas.map((h) => h + 'h'),
        datasets: [
          {
            type: 'bar',
            label: 'Total',
            data: d.hora.valores,
            backgroundColor: 'rgba(158,26,69,0.25)',
            borderColor: C.vinho,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            type: 'line',
            label: 'Positivos',
            data: d.hora.valores_pos,
            borderColor: C.danger,
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2.5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'rectRounded',
            },
          },
        },
        scales: {
          x: _ax({
            ticks: {
              maxRotation: 0,
              callback: (val, i) => (i % 3 === 0 ? d.hora.horas[i] + 'h' : ''),
            },
          }),
          y: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
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
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por hora do dia</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Distribuição nas 24 horas — total e apenas confirmados.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
            <i className="ti ti-clock-hour-4" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DiaSemanaCard({ d, noData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.dow) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.dow.labels,
        datasets: [
          {
            data: d.dow.valores,
            backgroundColor: d.dow.labels.map((l) =>
              l === 'Sáb' || l === 'Dom' ? 'rgba(194,74,106,0.55)' : 'rgba(42,141,217,0.5)'
            ),
            borderColor: d.dow.labels.map((l) =>
              l === 'Sáb' || l === 'Dom' ? C.vinho2 : C.info
            ),
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) + ' alertas' } },
        },
        scales: {
          x: _ax(),
          y: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
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
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por dia da semana</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Volume acumulado por dia da semana no período.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
            <i className="ti ti-calendar-week" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function VelocidadeAlertaCard({ d, noData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.vel) return;

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.vel.labels.map((l) => l + ' km/h'),
        datasets: [
          {
            data: d.vel.valores,
            backgroundColor: d.vel.labels.map((l, i) =>
              i >= 3 ? 'rgba(226,75,74,0.55)' : 'rgba(42,141,217,0.45)'
            ),
            borderColor: d.vel.labels.map((l, i) => (i >= 3 ? C.danger : C.info)),
            borderWidth: 1.5,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) + ' alertas' } },
        },
        scales: {
          x: _ax(),
          y: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
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
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Velocidade no momento do alerta</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Distribuição da velocidade (km/h) quando o evento disparou.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-gauge" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}
