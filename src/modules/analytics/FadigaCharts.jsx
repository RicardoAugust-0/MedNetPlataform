import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';

export default function FadigaCharts({ d, noData, selectedMonth, formatMonthKey, selectedSeverity, setSelectedSeverity }) {
  const [driversViewMode, setDriversViewMode] = useState('chart');
  const canvasMensalRef = useRef(null);
  const canvasCritRef = useRef(null);
  const canvasClfRef = useRef(null);
  const canvasFalsoRef = useRef(null);
  const canvasTipoRef = useRef(null);
  const canvasHoraRef = useRef(null);
  const canvasDowRef = useRef(null);
  const canvasVelRef = useRef(null);
  const canvasEvidRef = useRef(null);
  const canvasMotRef = useRef(null);
  const canvasPlacaRef = useRef(null);
  const canvasUfRef = useRef(null);
  const canvasFrotaRef = useRef(null);
  const canvasSascarCatRef = useRef(null);

  const chartsRef = useRef({});

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

    // Destroy all previous charts to refresh
    Object.values(chartsRef.current).forEach((c) => {
      if (c && typeof c.destroy === 'function') {
        try {
          c.destroy();
        } catch (e) {
          console.warn(e);
        }
      }
    });
    chartsRef.current = {};

    if (!d) return;

    const C = {
      vinho: '#9E1A45',
      vinho2: '#C24A6A',
      vinhoSoft: 'rgba(158,26,69,0.12)',
      orange: '#F26931',
      danger: '#E24B4A',
      warning: '#E8A020',
      success: '#2DA75A',
      info: '#2A8DD9',
      ink: '#0F1923',
      muted: '#8A94A6',
      grid: 'var(--chart-grid, rgba(15,25,35,0.025))',
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

    // 1. Daily/Monthly Evolution Chart
    if (canvasMensalRef.current && d.mensal.labels.length) {
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

      chartsRef.current.mensal = new Chart(canvasMensalRef.current, {
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
    }

    // 2. Severity
    if (canvasCritRef.current && d.mensal_crit.labels.length) {
      const cc = { Gravíssimo: C.danger, Grave: C.warning, Médio: C.info };
      chartsRef.current.crit = new Chart(canvasCritRef.current, {
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
    }

    // 3. Classification Donut
    if (canvasClfRef.current) {
      const keys = ['Positivo', 'Falso positivo', 'Não classificado'];
      const col = { Positivo: C.vinho, 'Falso positivo': C.info, 'Não classificado': 'var(--border-strong, #C9CDD6)' };
      const total = d.kpis.total || 1;
      chartsRef.current.clf = new Chart(canvasClfRef.current, {
        type: 'doughnut',
        data: {
          labels: keys,
          datasets: [
            {
              data: keys.map((k) => d.clf_total[k] || 0),
              backgroundColor: keys.map((k) => col[k]),
              borderColor: 'var(--surface-0, #fff)',
              borderWidth: 3,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
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
            tooltip: {
              callbacks: {
                label: (c) =>
                  ' ' +
                  c.label +
                  ': ' +
                  fmt(c.parsed) +
                  ' (' +
                  ((c.parsed / total) * 100).toFixed(1) +
                  '%)',
              },
            },
          },
        },
      });
    }

    // 4. False Positive line
    if (canvasFalsoRef.current && d.falso_mensal.labels.length) {
      chartsRef.current.falso = new Chart(canvasFalsoRef.current, {
        type: 'line',
        data: {
          labels: d.falso_mensal.labels,
          datasets: [
            {
              data: d.falso_mensal.pct,
              borderColor: C.warning,
              backgroundColor: 'rgba(232,160,32,0.06)',
              fill: true,
              tension: 0.35,
              pointBackgroundColor: C.warning,
              pointRadius: d.falso_mensal.labels.length > 15 ? 2 : 4,
              borderWidth: 2.5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => c.parsed.y + '% falso positivo' } },
          },
          scales: {
            x: _ax(),
            y: _ax({
              beginAtZero: true,
              ticks: { callback: (v) => v + '%', padding: 8 },
            }),
          },
        },
      });
    }

    // 5. Detection Type line
    if (canvasTipoRef.current && d.mensal_tipo.labels.length) {
      const cols = [C.vinho, C.info, C.warning, C.success, C.vinho2];
      const short = (s) => (s.length > 26 ? s.slice(0, 24) + '…' : s);
      chartsRef.current.tipo = new Chart(canvasTipoRef.current, {
        type: 'line',
        data: {
          labels: d.mensal_tipo.labels,
          datasets: Object.keys(d.mensal_tipo.series).map((s, i) => ({
            label: short(s),
            data: d.mensal_tipo.series[s],
            borderColor: cols[i % cols.length],
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: d.mensal_tipo.labels.length > 15 ? 1 : 3,
            borderWidth: 2,
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
                boxWidth: 8,
                boxHeight: 8,
                padding: 8,
                usePointStyle: true,
                pointStyle: 'circle',
                font: { size: 9.5 },
              },
            },
          },
          scales: {
            x: _ax(),
            y: _ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
          },
        },
      });
    }

    // 6. Hours of day
    if (canvasHoraRef.current) {
      chartsRef.current.hora = new Chart(canvasHoraRef.current, {
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
    }

    // 7. Day of week
    if (canvasDowRef.current) {
      chartsRef.current.dow = new Chart(canvasDowRef.current, {
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
    }

    // 8. Speed moment
    if (canvasVelRef.current) {
      chartsRef.current.vel = new Chart(canvasVelRef.current, {
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
    }

    // 9. Evidence video donut
    if (canvasEvidRef.current && d.evidencia) {
      const total = (d.evidencia.disp + d.evidencia.aguard) || 1;
      chartsRef.current.evid = new Chart(canvasEvidRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Evidências disponíveis', 'Aguardando evidências'],
          datasets: [
            {
              data: [d.evidencia.disp, d.evidencia.aguard],
              backgroundColor: [C.success, C.warning],
              borderColor: 'var(--surface-0, #fff)',
              borderWidth: 3,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
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
            tooltip: {
              callbacks: {
                label: (c) => ' ' + fmt(c.parsed) + ' (' + ((c.parsed / total) * 100).toFixed(1) + '%)',
              },
            },
          },
        },
      });
    }

    // 9.5. Sascar Categories
    if (canvasSascarCatRef.current && d.categorias && Object.keys(d.categorias).length > 0) {
      const catLabels = Object.keys(d.categorias);
      const catValores = Object.values(d.categorias);
      const total = catValores.reduce((a, b) => a + b, 0) || 1;
      const cols = [C.vinho, C.info, C.warning, C.success, C.vinho2, C.orange];
      
      chartsRef.current.sascarCat = new Chart(canvasSascarCatRef.current, {
        type: 'doughnut',
        data: {
          labels: catLabels,
          datasets: [
            {
              data: catValores,
              backgroundColor: catLabels.map((_, i) => cols[i % cols.length]),
              borderColor: 'var(--surface-0, #fff)',
              borderWidth: 3,
              hoverOffset: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '60%',
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
            tooltip: {
              callbacks: {
                label: (c) => ' ' + c.label + ': ' + fmt(c.parsed) + ' alertas (' + ((c.parsed / total) * 100).toFixed(1) + '%)',
              },
            },
          },
        },
      });
    }

    // Rankings Helper
    const hbar = (canvasRef, dd, color, key) => {
      if (!canvasRef.current || !dd.labels.length) return;
      chartsRef.current[key] = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels: dd.labels,
          datasets: [
            {
              data: dd.valores,
              backgroundColor: color,
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
    };

    // 10. Top Drivers
    hbar(canvasMotRef, d.top_motoristas, 'rgba(158,26,69,0.7)', 'mot');

    // 11. Top Plates
    hbar(canvasPlacaRef, d.top_placas, 'rgba(42,141,217,0.7)', 'placa');

    // 12. Top UFs
    hbar(canvasUfRef, d.uf, 'rgba(232,160,32,0.7)', 'uf');

    // 13. Fleet/Base
    if (canvasFrotaRef.current && d.frota.labels.length) {
      const short = (s) => s.replace(/FILIAL /i, '').replace(/RODAGEM/i, 'Rodagem');
      chartsRef.current.frota = new Chart(canvasFrotaRef.current, {
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
    }

    return () => {
      Object.values(chartsRef.current).forEach((c) => {
        if (c && typeof c.destroy === 'function') {
          try {
            c.destroy();
          } catch (e) {}
        }
      });
    };
  }, [d]);

  return (
    <>
      {/* Evolução */}
      <div>
        <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
          Evolução do volume
        </div>
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
            <canvas ref={canvasMensalRef}></canvas>
            {noData && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
                <i className="ti ti-chart-bar" style={{ fontSize: '30px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Importe uma planilha para visualizar</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Severidade e Qualidade */}
      <div>
        <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
          Severidade e qualidade dos alertas
        </div>
        <div className="grid-equal-2col">
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
                <button
                  onClick={() => setSelectedSeverity('all')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    background: selectedSeverity === 'all' ? 'var(--surface-0, #fff)' : 'transparent',
                    color: selectedSeverity === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Todas
                </button>
                <button
                  onClick={() => setSelectedSeverity('high')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    background: selectedSeverity === 'high' ? 'var(--surface-0, #fff)' : 'transparent',
                    color: selectedSeverity === 'high' ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Grave/Gravíssimo
                </button>
                <button
                  onClick={() => setSelectedSeverity('medium')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '4px',
                    background: selectedSeverity === 'medium' ? 'var(--surface-0, #fff)' : 'transparent',
                    color: selectedSeverity === 'medium' ? 'var(--text-primary)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  Médios
                </button>
              </div>
            </div>
            {!noData && d && d.mensal_crit && d.mensal_crit.series && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(226,75,74,0.06)', border: '1px solid rgba(226,75,74,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E24B4A' }}></span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Gravíssimo: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{d.mensal_crit.series['Gravíssimo'].reduce((a, b) => a + b, 0).toLocaleString('pt-BR')}</span>
                  </span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(232,160,32,0.06)', border: '1px solid rgba(232,160,32,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#E8A020' }}></span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Grave: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{d.mensal_crit.series['Grave'].reduce((a, b) => a + b, 0).toLocaleString('pt-BR')}</span>
                  </span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(42,141,217,0.06)', border: '1px solid rgba(42,141,217,0.15)', padding: '4px 10px', borderRadius: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2A8DD9' }}></span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Médio: <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{d.mensal_crit.series['Médio'].reduce((a, b) => a + b, 0).toLocaleString('pt-BR')}</span>
                  </span>
                </div>
              </div>
            )}
            <div style={{ position: 'relative', width: '100%', height: '260px' }}>
              <canvas ref={canvasCritRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
                  <i className="ti ti-chart-bar" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Classificação dos alertas</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Resultado da análise feita pela operação no período selecionado.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '260px' }}>
              <canvas ref={canvasClfRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
                  <i className="ti ti-chart-donut" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid-equal-2col" style={{ marginTop: '14px' }}>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Taxa de falso positivo</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              {selectedMonth && selectedMonth !== 'all'
                ? '% dos alertas diários classificados como falso positivo.'
                : '% dos alertas do mês classificados como falso positivo.'}
            </p>
            <div style={{ position: 'relative', width: '100%', height: '220px' }}>
              <canvas ref={canvasFalsoRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
                  <i className="ti ti-chart-line" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Tipo de detecção</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              {selectedMonth && selectedMonth !== 'all'
                ? 'Quais gatilhos de fadiga foram acionados ao longo dos dias (top 5).'
                : 'Quais gatilhos de fadiga foram acionados ao longo dos meses (top 5).'}
            </p>
            <div style={{ position: 'relative', width: '100%', height: '220px' }}>
              <canvas ref={canvasTipoRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
                  <i className="ti ti-chart-line" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Categorias de Evento Sascar */}
        {!noData && d && d.categorias && Object.keys(d.categorias).length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
              Categorias de eventos (Sascar)
            </div>
            <div className="grid-equal-2col">
              <div data-card className="card" style={{ padding: '16px 18px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por categoria</h4>
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
                  Distribuição proporcional de alertas por categoria na Sascar.
                </p>
                <div style={{ position: 'relative', width: '100%', height: '240px' }}>
                  <canvas ref={canvasSascarCatRef}></canvas>
                </div>
              </div>
              <div data-card className="card" style={{ padding: '16px 18px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Resumo de categorias</h4>
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
                  Detalhamento numérico e representação proporcional dos alertas.
                </p>
                <div style={{ overflowY: 'auto', height: '240px', marginTop: '10px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <th style={{ padding: '8px 4px', fontWeight: 600 }}>Categoria</th>
                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Alertas</th>
                        <th style={{ padding: '8px 4px', fontWeight: 600, textAlign: 'right' }}>Representação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(d.categorias).map((cat) => {
                        const total = Object.values(d.categorias).reduce((a, b) => a + b, 0) || 1;
                        const val = d.categorias[cat];
                        const pctVal = ((val / total) * 100).toFixed(1);
                        return (
                          <tr key={cat} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.03))' }}>
                            <td style={{ padding: '8px 4px', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {cat}
                            </td>
                            <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace" }}>
                              {val.toLocaleString('pt-BR')}
                            </td>
                            <td style={{ padding: '8px 4px', textAlign: 'right', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-muted)' }}>
                              {pctVal}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quando os alertas acontecem */}
      <div>
        <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
          Quando os alertas acontecem
        </div>
        <div className="grid-2col">
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Alertas por hora do dia</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Distribuição nas 24 horas — total e apenas confirmados.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '260px' }}>
              <canvas ref={canvasHoraRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
                  <i className="ti ti-clock-hour-4" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por dia da semana</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Volume acumulado por dia da semana no período.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '260px' }}>
              <canvas ref={canvasDowRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
                  <i className="ti ti-calendar-week" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid-equal-2col" style={{ marginTop: '14px' }}>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Velocidade no momento do alerta</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Distribuição da velocidade (km/h) quando o evento disparou.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '220px' }}>
              <canvas ref={canvasVelRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
                  <i className="ti ti-gauge" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Evidência em vídeo</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Cobertura de evidências em vídeo disponíveis para auditoria.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '220px' }}>
              <canvas ref={canvasEvidRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
                  <i className="ti ti-video" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ranking de Exposição */}
      <div>
        <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, margin: '28px 2px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
          Ranking de exposição
        </div>
        <div className="grid-equal-2col">
          <div data-card className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Top 15 motoristas</h4>
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Maior número de alertas registrados no período selecionado.
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
              <canvas ref={canvasMotRef}></canvas>
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
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Top 15 veículos (placa)</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Maior número de alertas no período selecionado.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '400px' }}>
              <canvas ref={canvasPlacaRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '150px' }}>
                  <i className="ti ti-truck" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="grid-equal-2col" style={{ marginTop: '14px' }}>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Distribuição por UF</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Estado onde o alerta foi registrado.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '300px' }}>
              <canvas ref={canvasUfRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
                  <i className="ti ti-map-pin" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
          <div data-card className="card" style={{ padding: '16px 18px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Por frota / base</h4>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
              Distribuição de ocorrências entre frotas, rodagem e filiais.
            </p>
            <div style={{ position: 'relative', width: '100%', height: '300px' }}>
              <canvas ref={canvasFrotaRef}></canvas>
              {noData && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '100px' }}>
                  <i className="ti ti-building-warehouse" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
