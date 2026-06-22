import { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { C, fmt, kf, _ax, initChartDefaults } from './components/ChartUtils.js';

export default function ComparisonView({
  sources,
  selectedMonth,
  formatMonthKey,
  compareCompanies = {},
  setCompareCompanies,
  selectedSeverity,
  compareMode = 'platforms'
}) {
  initChartDefaults();

  const canvasCmpRef = useRef(null);
  const chartRef = useRef(null);
  const canvasCritRef = useRef(null);
  const chartCritRef = useRef(null);

  // Derived calculations for compare rows
  const compareRows = useMemo(() => {
    const cmpCols = ['#9E1A45', '#2A8DD9', '#E8A020', '#2DA75A', '#C24A6A', '#F26931', '#7A1235', '#6F6A88'];
    return sources.map((x, i) => {
      const agg = x.data;
      if (!agg) return null;
      return {
        platformName: x.label || x.platformName,
        color: cmpCols[i % cmpCols.length],
        total: agg.kpis.total != null ? agg.kpis.total.toLocaleString('pt-BR') : '0',
        pos: agg.kpis.pct_positivo != null ? agg.kpis.pct_positivo + '%' : '—',
        falso: agg.kpis.pct_falso != null ? agg.kpis.pct_falso + '%' : '—',
        vel: agg.kpis.vel_mediana != null ? agg.kpis.vel_mediana : '—',
        evid: agg.kpis.pct_evidencia != null ? agg.kpis.pct_evidencia + '%' : '—',
      };
    }).filter(Boolean);
  }, [sources]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
    if (chartCritRef.current) {
      chartCritRef.current.destroy();
      chartCritRef.current = null;
    }

    if (sources.length >= 2 && canvasCmpRef.current) {
      const labels = sources.map((s) => s.label || s.platformName);
      const datasetsTotal = sources.map((s) => (s.data?.kpis?.total || 0));
      const datasetsPos = sources.map((s) => {
        const total = s.data?.kpis?.total || 0;
        const pctPos = s.data?.kpis?.pct_positivo || 0;
        return Math.round((total * pctPos) / 100);
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

    // Criticidade por plataforma (barras empilhadas). Soma as séries mensais que o
    // aggregate já devolve em `mensal_crit.series`.
    if (sources.length >= 2 && canvasCritRef.current) {
      const labels = sources.map((s) => s.label || s.platformName);
      const sumSeries = (agg, key) => ((agg?.mensal_crit?.series?.[key]) || []).reduce((a, b) => a + b, 0);
      const critDefs = [
        { key: 'Gravíssimo', color: '#C62F2F' },
        { key: 'Grave', color: '#E8A020' },
        { key: 'Médio', color: '#2A8DD9' },
      ];

      chartCritRef.current = new Chart(canvasCritRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: critDefs.map((cd) => ({
            label: cd.key,
            data: sources.map((s) => sumSeries(s.data, cd.key)),
            backgroundColor: cd.color,
            borderWidth: 0,
            borderRadius: 4,
            maxBarThickness: 34,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { boxWidth: 10, boxHeight: 10, padding: 14, usePointStyle: true, pointStyle: 'rectRounded' },
            },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmt(c.parsed.y) } },
          },
          scales: {
            x: _ax({ stacked: true }),
            y: _ax({ stacked: true, beginAtZero: true, ticks: { callback: kf, padding: 8 } }),
          },
        },
      });
    }

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      if (chartCritRef.current) {
        chartCritRef.current.destroy();
        chartCritRef.current = null;
      }
    };
  }, [sources, selectedMonth, compareCompanies, selectedSeverity]);

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '28px 2px 14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ fontSize: '10px', letterSpacing: '1.6px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '16px', height: '2px', background: '#9E1A45', borderRadius: '2px', display: 'inline-block' }}></span>
          Comparação entre {compareMode === 'companies' ? 'empresas' : 'plataformas'} {selectedMonth && `(${formatMonthKey(selectedMonth)})`}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {sources.map((src) => {
            // Modo empresas: a coluna já É uma empresa — rótulo estático
            // (para trocar as empresas, reabra o modal de comparação).
            if (compareMode === 'companies') {
              return (
                <div
                  key={src.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface-1)', padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border)' }}
                >
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {src.label}
                  </span>
                </div>
              );
            }
            const pCompanies = src.availableCompanies || [];
            return (
              <div
                key={src.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--surface-1)',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {src.platformName}:
                </span>
                <select
                  value={compareCompanies[src.platformId] || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCompareCompanies((prev) => {
                      const next = { ...prev };
                      if (val) {
                        next[src.platformId] = val;
                      } else {
                        delete next[src.platformId];
                      }
                      return next;
                    });
                  }}
                  style={{
                    padding: '2px 4px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">Todas as empresas</option>
                  {pCompanies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
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
              {compareRows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                    Sem dados para comparação no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div data-card className="card" style={{ padding: '16px 18px', marginTop: '20px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Criticidade por plataforma</h4>
        <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '2px 0 14px' }}>
          Distribuição de Gravíssimo / Grave / Médio em cada fonte (eventos Leve ficam fora da análise).
        </p>
        <div style={{ position: 'relative', width: '100%', height: '280px' }}>
          <canvas ref={canvasCritRef}></canvas>
        </div>
      </div>
    </div>
  );
}
