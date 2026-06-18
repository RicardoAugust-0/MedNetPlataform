import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { C, fmt, _ax } from './ChartUtils.js';

export function AlertasCategoriaCard({ d, noData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.categorias || Object.keys(d.categorias).length === 0) return;

    const catLabels = Object.keys(d.categorias);
    const catValores = Object.values(d.categorias);
    const total = catValores.reduce((a, b) => a + b, 0) || 1;
    const cols = [C.vinho, C.info, C.warning, C.success, C.vinho2, C.orange];

    chartRef.current = new Chart(canvasRef.current, {
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

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [d, noData]);

  if (noData || !d || !d.categorias || Object.keys(d.categorias).length === 0) return null;

  const totalAlerts = Object.values(d.categorias).reduce((a, b) => a + b, 0) || 1;

  return (
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
            <canvas ref={canvasRef}></canvas>
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
                  const val = d.categorias[cat];
                  const pctVal = ((val / totalAlerts) * 100).toFixed(1);
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
  );
}

export function EvidenciaVideoCard({ d, noData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.evidencia) return;

    const total = (d.evidencia.disp + d.evidencia.aguard) || 1;

    chartRef.current = new Chart(canvasRef.current, {
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

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [d, noData]);

  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Evidência em vídeo</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        Cobertura de evidências em vídeo disponíveis para auditoria.
      </p>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-video" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}
