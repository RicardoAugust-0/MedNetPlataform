import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { C, fmt, kf, _ax } from './ChartUtils.js';

export function ClassificacaoAlertasCard({ d, noData, selectedClassification, setSelectedClassification }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.clf_total || !d.kpis) return;

    const keys = ['Positivo', 'Falso positivo', 'Não classificado'];
    const col = { Positivo: C.vinho, 'Falso positivo': C.info, 'Não classificado': 'var(--border-strong, #C9CDD6)' };
    const total = d.kpis.total || 1;

    chartRef.current = new Chart(canvasRef.current, {
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
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Classificação dos alertas</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Resultado da análise feita pela operação no período selecionado.
          </p>
        </div>
        <div>
          <select
            value={selectedClassification}
            onChange={(e) => setSelectedClassification(e.target.value)}
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
            }}
          >
            <option value="all">Todas as classificações</option>
            <option value="Positivo">Positivo</option>
            <option value="Falso positivo">Falso positivo</option>
            <option value="Não classificado">Não classificado</option>
          </select>
        </div>
      </div>
      <div style={{ position: 'relative', width: '100%', height: '260px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '80px' }}>
            <i className="ti ti-chart-donut" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaxaFalsoPositivoCard({ d, noData, selectedMonth }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.falso_mensal || !d.falso_mensal.labels.length) return;

    chartRef.current = new Chart(canvasRef.current, {
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

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [d, noData]);

  return (
    <div data-card className="card" style={{ padding: '16px 18px' }}>
      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Taxa de falso positivo</h4>
      <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
        {selectedMonth && selectedMonth !== 'all'
          ? '% dos alertas diários classificados como falso positivo.'
          : '% dos alertas do mês classificados como falso positivo.'}
      </p>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-chart-line" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TipoDeteccaoCard({ d, noData, selectedMonth, selectedType, setSelectedType, availableTypes = [] }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    if (!canvasRef.current || noData || !d || !d.mensal_tipo || !d.mensal_tipo.labels.length) return;

    const cols = [C.vinho, C.info, C.warning, C.success, C.vinho2];
    const short = (s) => (s.length > 26 ? s.slice(0, 24) + '…' : s);

    chartRef.current = new Chart(canvasRef.current, {
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
          <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Tipo de detecção</h4>
          <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {selectedMonth && selectedMonth !== 'all'
              ? 'Quais gatilhos de fadiga foram acionados ao longo dos dias (top 5).'
              : 'Quais gatilhos de fadiga foram acionados ao longo dos meses (top 5).'}
          </p>
        </div>
        {availableTypes.length > 0 && (
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
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
              <option value="">Todos os tipos</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', width: '100%', height: '220px' }}>
        <canvas ref={canvasRef}></canvas>
        {noData && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', textAlign: 'center', paddingTop: '60px' }}>
            <i className="ti ti-chart-line" style={{ fontSize: '28px', color: 'var(--border-strong, #C9CDD6)' }}></i>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>Sem dados</div>
          </div>
        )}
      </div>
    </div>
  );
}
