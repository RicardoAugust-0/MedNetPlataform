import { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { aggregate } from '../../utils/fatigueParser.js';

export default function ComparisonView({ sources, selectedMonth, formatMonthKey, selectedCompany }) {
  const canvasCmpRef = useRef(null);
  const chartRef = useRef(null);

  // Derived calculations for compare rows
  const compareRows = useMemo(() => {
    const cmpCols = ['#9E1A45', '#2A8DD9', '#E8A020', '#2DA75A', '#C24A6A', '#F26931', '#7A1235', '#6F6A88'];
    return sources.map((x, i) => {
      let filteredRows = x.dataRows;
      if (selectedCompany) {
        filteredRows = filteredRows.filter(row => row[8] === selectedCompany);
      }
      const agg = aggregate(x.headers, filteredRows, x.mapping, selectedMonth === 'all' ? null : selectedMonth);
      return {
        platformName: x.platformName,
        color: cmpCols[i % cmpCols.length],
        total: agg.kpis.total.toLocaleString('pt-BR'),
        pos: agg.kpis.pct_positivo != null ? agg.kpis.pct_positivo + '%' : '—',
        falso: agg.kpis.pct_falso != null ? agg.kpis.pct_falso + '%' : '—',
        vel: agg.kpis.vel_mediana != null ? agg.kpis.vel_mediana : '—',
        evid: agg.kpis.pct_evidencia != null ? agg.kpis.pct_evidencia + '%' : '—',
      };
    });
  }, [sources, selectedMonth, selectedCompany]);

  useEffect(() => {
    // Config Chart.js defaults
    Chart.defaults.font.family = "'Poppins', sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = 'var(--text-muted, #8A94A6)';
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#0F1923';
    Chart.defaults.plugins.tooltip.borderColor = 'var(--border, rgba(255,255,255,0.1))';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor = '#fff';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.titleFont = { family: "'Poppins', sans-serif", weight: '600' };

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const C = {
      vinho: '#9E1A45',
      info: '#2A8DD9',
    };
    const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
    const kf = (v) => (v >= 1000 ? v / 1000 + 'k' : v);
    const _ax = (extra) =>
      Object.assign(
        {
          grid: { color: 'var(--chart-grid, rgba(15,25,35,0.025))', drawTicks: false },
          border: { display: false },
          ticks: { padding: 8, color: 'var(--text-muted, #8A94A6)' },
        },
        extra || {}
      );

    if (sources.length >= 2 && canvasCmpRef.current) {
      const labels = sources.map((s) => s.platformName);
      const datasetsTotal = sources.map((s) => {
        let filteredRows = s.dataRows;
        if (selectedCompany) {
          filteredRows = filteredRows.filter(row => row[8] === selectedCompany);
        }
        const agg = aggregate(s.headers, filteredRows, s.mapping, selectedMonth === 'all' ? null : selectedMonth);
        return agg.kpis.total;
      });
      const datasetsPos = sources.map((s) => {
        let filteredRows = s.dataRows;
        if (selectedCompany) {
          filteredRows = filteredRows.filter(row => row[8] === selectedCompany);
        }
        const agg = aggregate(s.headers, filteredRows, s.mapping, selectedMonth === 'all' ? null : selectedMonth);
        return Math.round((agg.kpis.total * (agg.kpis.pct_positivo || 0)) / 100);
      });

      chartRef.current = new Chart(canvasCmpRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Total',
              data: datasetsTotal,
              backgroundColor: 'rgba(158,26,69,0.65)',
              borderColor: C.vinho,
              borderWidth: 1,
              borderRadius: 5,
              maxBarThickness: 34,
            },
            {
              label: 'Positivos',
              data: datasetsPos,
              backgroundColor: 'rgba(42,141,217,0.55)',
              borderColor: C.info,
              borderWidth: 1,
              borderRadius: 5,
              maxBarThickness: 34,
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
                padding: 14,
                usePointStyle: true,
                pointStyle: 'rectRounded',
              },
            },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.parsed.y) } },
          },
          scales: {
            x: _ax(),
            y: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
          },
        },
      });
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [sources, selectedMonth, selectedCompany]);

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
        Comparação entre plataformas {selectedMonth && `(${formatMonthKey(selectedMonth)})`}
      </div>
      <div className="grid-2col">
        <div data-card className="card" style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Volume por plataforma</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
            Total de alertas e positivos confirmados em cada fonte.
          </p>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <canvas ref={canvasCmpRef}></canvas>
          </div>
        </div>
        <div data-card className="card" style={{ padding: '16px 18px', overflowX: 'auto' }}>
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Indicadores lado a lado</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
            Qualidade e risco por plataforma.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Plataforma</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Alertas</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Pos.</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Falso</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Vel. med.</th>
                <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Evid.</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', marginRight: '7px', background: r.color }}></span>
                    {r.platformName}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.total}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.pos}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.falso}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.vel}</td>
                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>{r.evid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
