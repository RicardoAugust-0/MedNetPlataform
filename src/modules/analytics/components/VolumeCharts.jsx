import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { C, fmt, kf, _ax } from './ChartUtils.js';

export function VolumeMensalCard({ d, noData, selectedMonth, formatMonthKey }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.mensal || !d.mensal.labels.length) return;

    const v = d.mensal.variacao;
    const momLabels = {
      id: 'momLabels',
      afterDatasetsDraw: (chart) => {
        if (d.mensal.valores.length > 15) return;
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = "600 10.5px 'Poppins', sans-serif";
        ctx.textAlign = 'center';
        meta.data.forEach((bar, i) => {
          if (v[i] == null) return;
          const up = v[i] >= 0;
          ctx.fillStyle = up ? C.danger : C.success;
          ctx.fillText((up ? '+' : '') + v[i] + '%', bar.x, bar.y - 9);
        });
        ctx.restore();
      },
    };

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.mensal.labels,
        datasets: [
          {
            data: d.mensal.valores,
            backgroundColor: 'rgba(158,26,69,0.55)',
            borderColor: C.vinho,
            borderWidth: 1.5,
            borderRadius: d.mensal.valores.length > 15 ? 4 : 8,
            maxBarThickness: d.mensal.valores.length > 15 ? 30 : 80,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => fmt(c.parsed.y) + ' alertas' } },
        },
        scales: {
          x: _ax(),
          y: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
        },
      },
      plugins: [momLabels],
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [d, noData, selectedMonth]);

  return (
    <div data-card className="card" style={{ padding: '18px 18px 14px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        {selectedMonth && selectedMonth !== 'all' ? `Alertas por dia em ${formatMonthKey(selectedMonth)}` : 'Alertas por mês'}
      </h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        {selectedMonth && selectedMonth !== 'all'
          ? 'Contagem diária de eventos e variação percentual dia a dia.'
          : 'Contagem consolidada de eventos mensais e variação em relação ao mês anterior.'}
      </p>
      <div style={{ position: 'relative', width: '100%', height: '320px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
            <i className="ti ti-chart-bar" style={{ fontSize: '30px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Importe uma planilha para visualizar</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function VolumeCriticidadeCard({ d, noData, selectedMonth, selectedSeverity, setSelectedSeverity }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.mensal_crit || !d.mensal_crit.labels.length) return;

    const cc = { Gravíssimo: C.danger, Grave: C.warning, Médio: C.info };

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: d.mensal_crit.labels,
        datasets: Object.keys(d.mensal_crit.series).map((s) => ({
          label: s,
          data: d.mensal_crit.series[s],
          backgroundColor: cc[s],
          borderRadius: d.mensal_crit.labels.length > 15 ? 2 : 4,
          maxBarThickness: d.mensal_crit.labels.length > 15 ? 20 : 54,
        })),
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
          x: _ax({ stacked: true }),
          y: _ax({ stacked: true, beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
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

  const calcTotal = (seriesName) => {
    if (!d || !d.mensal_crit || !d.mensal_crit.series || !d.mensal_crit.series[seriesName]) return 0;
    return d.mensal_crit.series[seriesName].reduce((a, b) => a + b, 0);
  };

  return (
    <div data-card className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Volume por criticidade</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {selectedMonth && selectedMonth !== 'all'
              ? 'Composição da severidade ao longo dos dias do mês.'
              : 'Composição da severidade ao longo dos meses.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '2px', background: 'var(--surface-1, rgba(255,255,255,0.05))', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          {['all', 'high', 'medium'].map((mode) => {
            const label = mode === 'all' ? 'Todas' : mode === 'high' ? 'Grave/Gravíssimo' : 'Médios';
            return (
              <button
                key={mode}
                onClick={() => setSelectedSeverity(mode)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '4px',
                  background: selectedSeverity === mode ? 'var(--surface-0, #fff)' : 'transparent',
                  color: selectedSeverity === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {!noData && d && d.mensal_crit && d.mensal_crit.series && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(226,75,74,0.06)', border: '1px solid rgba(226,75,74,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E24B4A' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Gravíssimo: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{calcTotal('Gravíssimo').toLocaleString('pt-BR')}</span>
            </span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E8A020' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Grave: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{calcTotal('Grave').toLocaleString('pt-BR')}</span>
            </span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(42,141,217,0.06)', border: '1px solid rgba(42,141,217,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2A8DD9' }}></span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Médio: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{calcTotal('Médio').toLocaleString('pt-BR')}</span>
            </span>
          </div>
        </div>
      )}
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
            <i className="ti ti-chart-bar" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}
