import { apiFetch, buildAnalyticsQuery } from '../../../lib/analyticsApi.js';

/**
 * Exporta os dados atuais da plataforma ativa para CSV.
 */
export const exportToCSV = async ({
  activeSource,
  selectedCompany,
  selectedMonth,
  startDate,
  endDate,
  selectedSeverity,
  selectedClassification,
  selectedType,
  selectedUf,
  toast,
}) => {
  if (!activeSource) return;

  const qs = buildAnalyticsQuery({
    platformId: activeSource.platformId,
    company: selectedCompany,
    month: selectedMonth,
    startDate,
    endDate,
    severity: selectedSeverity,
    classification: selectedClassification,
    eventType: selectedType,
    uf: selectedUf,
  });

  try {
    const res = await apiFetch(`/api/analytics/csv?${qs}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Falha ao gerar o CSV');
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.setAttribute('download', `relatorio_fadiga_${activeSource.platformId}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error('[MedNet] Erro ao exportar CSV:', err);
    toast('Não foi possível exportar o CSV: ' + (err.message || String(err)), 'error');
  }
};

/**
 * Exporta a view atual do relatório para um arquivo HTML autônomo com gráficos ativos via Chart.js.
 */
export const exportToHTML = async (d) => {
  const container = document.querySelector('.analytics-container');
  if (!container) return;

  // Clone standard container to manipulate it offline
  const clone = container.cloneNode(true);

  // Replace selects with static span values showing selected option text
  const originalSelects = container.querySelectorAll('select');
  const clonedSelects = clone.querySelectorAll('select');
  originalSelects.forEach((origSelect, idx) => {
    const clonedSelect = clonedSelects[idx];
    if (clonedSelect) {
      const text = origSelect.options[origSelect.selectedIndex]?.text || '';
      const span = document.createElement('span');
      span.className = 'static-filter-val';
      span.textContent = text;
      span.style.cssText = 'padding: 6px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 12.5px; font-weight: 600; color: var(--text-primary); background: var(--surface-1); display: inline-block;';
      clonedSelect.replaceWith(span);
    }
  });

  // Replace date inputs with static span values
  const originalDates = container.querySelectorAll('input[type="date"]');
  const clonedDates = clone.querySelectorAll('input[type="date"]');
  originalDates.forEach((origDate, idx) => {
    const clonedDate = clonedDates[idx];
    if (clonedDate) {
      const span = document.createElement('span');
      span.className = 'static-filter-val';
      span.textContent = origDate.value || 'Não definido';
      span.style.cssText = 'padding: 5px 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; color: var(--text-primary); background: var(--surface-1); display: inline-block;';
      clonedDate.replaceWith(span);
    }
  });

  // Replace/remove buttons selectively (keep filter/tab buttons as static labels)
  const originalButtons = container.querySelectorAll('button');
  const clonedButtons = clone.querySelectorAll('button');
  originalButtons.forEach((origBtn, idx) => {
    const clonedBtn = clonedButtons[idx];
    if (clonedBtn) {
      if (origBtn.classList.contains('btn') || origBtn.querySelector('.ti-trash') || origBtn.title?.toLowerCase().includes('remover')) {
        clonedBtn.remove();
      } else {
        const isButtonActive = origBtn.style.background && origBtn.style.background !== 'transparent';
        const span = document.createElement('span');
        span.textContent = origBtn.textContent.trim();
        span.className = 'static-tab-val';
        
        if (isButtonActive) {
          span.style.cssText = 'padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 4px; background: var(--surface-2, rgba(255,255,255,0.05)); color: var(--text-primary); border: 1px solid var(--border-strong); display: inline-block; margin-right: 2px;';
        } else {
          span.style.cssText = 'padding: 4px 10px; font-size: 11px; font-weight: 500; border-radius: 4px; background: transparent; color: var(--text-muted); display: inline-block; margin-right: 2px; opacity: 0.6;';
        }
        clonedBtn.replaceWith(span);
      }
    }
  });

  // Gather stylesheet contents to make it self-contained
  let stylesHtml = '';

  // 1. Copy all style tag contents directly
  document.querySelectorAll('style').forEach((tag) => {
    stylesHtml += `<style>${tag.textContent || tag.innerHTML}</style>\n`;
  });

  // 2. Fetch external same-origin stylesheet contents and embed them, keep cross-origin link tags
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const linkStyles = await Promise.all(
    links.map(async (link) => {
      try {
        const href = link.href;
        // If it's a relative URL or on the same origin, we can fetch its content
        if (href.startsWith(window.location.origin) || !href.startsWith('http')) {
          const res = await fetch(href);
          if (res.ok) {
            const cssText = await res.text();
            return `<style data-href="${href}">${cssText}</style>`;
          }
        }
        // Fallback for cross-origin links
        return `<link rel="stylesheet" href="${href}" />`;
      } catch (err) {
        // If fetch fails, keep the link tag
        return `<link rel="stylesheet" href="${link.href}" />`;
      }
    })
  );
  stylesHtml += linkStyles.join('\n');

  // Capture active theme and other layout configuration attributes
  const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const activeDensity = document.documentElement.getAttribute('data-density') || '1';
  const activeMode = document.documentElement.getAttribute('data-mode') || '';
  const activeVibe = document.documentElement.getAttribute('data-vibe') || '';
  const activeRhythm = document.documentElement.getAttribute('data-rhythm') || '';
  const inlineStyles = document.documentElement.getAttribute('style') || '';

  // Define the script to initialize interactive Chart.js charts offline
  const chartInitScript = `<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script>
  (function() {
    const d = ${JSON.stringify(d)};
    if (!d) return;

    const DATA = {
      kpis: d.kpis || {},
      mensal: d.mensal || { meses: [], valores: [], variacao: [] },
      mensal_crit: d.mensal_crit || { meses: [], labels: [], series: {} },
      mensal_tipo: d.mensal_tipo || { meses: [], labels: [], series: {} },
      clf_total: d.clf_total || {},
      falso_pos_mensal: {
        meses: d.falso_mensal?.labels || d.mensal?.meses || [],
        pct: d.falso_mensal?.pct || []
      },
      top_motoristas: d.top_motoristas || { labels: [], valores: [] },
      top_placas: d.top_placas || { labels: [], valores: [] },
      top_frota: d.frota || { labels: [], valores: [] },
      uf: d.uf || { labels: [], valores: [] },
      hora: {
        horas: d.hora?.horas || Array.from({ length: 24 }, (_, i) => i),
        valores: d.hora?.valores || []
      },
      hora_pos: {
        valores: d.hora?.valores_pos || []
      },
      dow: d.dow || { labels: [], valores: [] },
      vel_hist: {
        labels: d.vel?.labels || [],
        valores: d.vel?.valores || []
      },
      evidencia: d.evidencia ? {
        'Evidências disponíveis': d.evidencia.disp,
        'Aguardando evidências': d.evidencia.aguard
      } : null
    };

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const C = {
      grid: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 25, 35, 0.025)',
      text: isDark ? '#9D98B5' : '#4A5568',
      vinho: '#9E1A45',
      danger: '#E24B4A',
      warning: '#E8A020',
      success: '#2DA75A',
      info: '#2A8DD9'
    };

    const fmt = n => n == null ? '—' : Number(n).toLocaleString('pt-BR');
    const kf = v => v >= 1000 ? v / 1000 + 'k' : v;
    const ax = (extra={}) => ({
      grid: { color: C.grid, drawTicks: false },
      border: { display: false },
      ticks: { padding: 8, color: C.text },
      ...extra
    });

    const mesLabel = m => {
      if (!m || !m.includes('-')) return m;
      const [y, mm] = m.split('-');
      return ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][+mm-1]+'/'+y.slice(2);
    };

    Chart.defaults.font.family = "'Poppins', sans-serif";
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = C.text;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = isDark ? '#161315' : '#0F1923';
    Chart.defaults.plugins.tooltip.borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,25,35,0.08)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = '#fff';
    Chart.defaults.plugins.tooltip.bodyColor = '#fff';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;

    // Map canvases
    document.querySelectorAll('.card').forEach(card => {
      const heading = card.querySelector('h2, h3, h4');
      const canvas = card.querySelector('canvas');
      if (!canvas || !heading) return;
      
      const title = heading.textContent.trim().toLowerCase();
      if (title.includes('mês') || title.includes('mensal')) {
        canvas.id = 'c_mensal';
      } else if (title.includes('criticidade') || title.includes('severidade')) {
        canvas.id = 'c_crit';
      } else if (title.includes('classificação')) {
        canvas.id = 'c_clf';
      } else if (title.includes('falso positivo')) {
        canvas.id = 'c_falso';
      } else if (title.includes('detecção') || title.includes('gatilho')) {
        canvas.id = 'c_tipo';
      } else if (title.includes('categoria')) {
        canvas.id = 'c_categoria';
      } else if (title.includes('hora')) {
        canvas.id = 'c_hora';
      } else if (title.includes('semana')) {
        canvas.id = 'c_dow';
      } else if (title.includes('velocidade')) {
        canvas.id = 'c_vel';
      } else if (title.includes('evidência') || title.includes('vídeo')) {
        canvas.id = 'c_evid';
      } else if (title.includes('motoristas')) {
        canvas.id = 'c_mot';
      } else if (title.includes('veículos') || title.includes('placa')) {
        canvas.id = 'c_placa';
      } else if (title.includes('uf') || title.includes('estado')) {
        canvas.id = 'c_uf';
      } else if (title.includes('frota') || title.includes('base')) {
        canvas.id = 'c_frota';
      }
    });

    // 1. Mensal
    const c_mensal = document.getElementById('c_mensal');
    if (c_mensal && DATA.mensal.valores.length) {
      new Chart(c_mensal, {
        type: 'bar',
        data: {
          labels: DATA.mensal.meses.map(mesLabel),
          datasets: [{
            data: DATA.mensal.valores,
            backgroundColor: 'rgba(158,26,69,0.55)',
            borderColor: C.vinho,
            borderWidth: 1.5,
            borderRadius: 8,
            maxBarThickness: 90
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 24 } },
          plugins: { tooltip: { callbacks: { label: c => fmt(c.parsed.y) + ' alertas' } } },
          scales: { x: ax(), y: ax({ beginAtZero: true, ticks: { callback: kf, padding: 8 } }) }
        }
      });
    }

    // 2. Criticidade
    const c_crit = document.getElementById('c_crit');
    if (c_crit && DATA.mensal_crit.meses.length) {
      const crColors = { 'Gravíssimo': C.danger, 'Grave': C.warning, 'Médio': C.info };
      new Chart(c_crit, {
        type: 'bar',
        data: {
          labels: DATA.mensal_crit.meses.map(mesLabel),
          datasets: Object.keys(DATA.mensal_crit.series).map(s => ({
            label: s,
            data: DATA.mensal_crit.series[s],
            backgroundColor: crColors[s],
            borderRadius: 4,
            maxBarThickness: 60
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 14, usePointStyle: true, pointStyle: 'rectRounded' } } },
          scales: { x: ax({ stacked: true }), y: ax({ stacked: true, beginAtZero: true, ticks: { callback: kf } }) }
        }
      });
    }

    // 3. Classificação
    const c_clf = document.getElementById('c_clf');
    if (c_clf && Object.keys(DATA.clf_total).length) {
      const clK = Object.keys(DATA.clf_total);
      const clColor = { 'Positivo': C.danger, 'Falso positivo': C.info, 'Não classificado': C.text };
      new Chart(c_clf, {
        type: 'doughnut',
        data: {
          labels: clK,
          datasets: [{
            data: clK.map(x => DATA.clf_total[x]),
            backgroundColor: clK.map(x => clColor[x]),
            borderColor: isDark ? '#161315' : '#fff',
            borderWidth: 3,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { display: true, position: 'bottom' } }
        }
      });
    }

    // 4. Falso positivo
    const c_falso = document.getElementById('c_falso');
    if (c_falso && DATA.falso_pos_mensal.pct.length) {
      new Chart(c_falso, {
        type: 'line',
        data: {
          labels: DATA.falso_pos_mensal.meses.map(mesLabel),
          datasets: [{
            data: DATA.falso_pos_mensal.pct,
            borderColor: C.warning,
            backgroundColor: 'rgba(232,160,32,0.12)',
            fill: true,
            tension: 0.35,
            pointBackgroundColor: C.warning,
            pointRadius: 4,
            borderWidth: 2.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax(), y: ax({ beginAtZero: true, ticks: { callback: v => v + '%' } }) }
        }
      });
    }

    // 5. Tipo detecção
    const c_tipo = document.getElementById('c_tipo');
    if (c_tipo && DATA.mensal_tipo.meses.length) {
      const tpColors = [C.danger, C.warning, C.info, C.success, C.vinho];
      new Chart(c_tipo, {
        type: 'line',
        data: {
          labels: DATA.mensal_tipo.meses.map(mesLabel),
          datasets: Object.keys(DATA.mensal_tipo.series).map((s, i) => ({
            label: s,
            data: DATA.mensal_tipo.series[s],
            borderColor: tpColors[i % tpColors.length],
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 3,
            borderWidth: 2
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, padding: 10, usePointStyle: true, pointStyle: 'circle' } } },
          scales: { x: ax(), y: ax({ beginAtZero: true, ticks: { callback: kf } }) }
        }
      });
    }

    // 6. Categoria
    const c_categoria = document.getElementById('c_categoria');
    if (c_categoria && d.categorias) {
      const catLabels = Object.keys(d.categorias);
      const catVals = Object.values(d.categorias);
      new Chart(c_categoria, {
        type: 'bar',
        data: {
          labels: catLabels,
          datasets: [{
            data: catVals,
            backgroundColor: 'rgba(158,26,69,0.55)',
            borderColor: C.vinho,
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax({ beginAtZero: true }), y: ax() }
        }
      });
    }

    // 7. Hora do dia
    const c_hora = document.getElementById('c_hora');
    if (c_hora && DATA.hora.valores.length) {
      new Chart(c_hora, {
        type: 'bar',
        data: {
          labels: DATA.hora.horas.map(h => h + 'h'),
          datasets: [
            { type: 'bar', label: 'Total', data: DATA.hora.valores, backgroundColor: 'rgba(79,160,255,0.25)', borderColor: C.info, borderWidth: 1, borderRadius: 4 },
            { type: 'line', label: 'Positivos', data: DATA.hora_pos.valores, borderColor: C.danger, backgroundColor: 'transparent', tension: 0.35, pointRadius: 0, borderWidth: 2.5 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom' } },
          scales: { x: ax(), y: ax({ beginAtZero: true, ticks: { callback: kf } }) }
        }
      });
    }

    // 8. Dia da semana
    const c_dow = document.getElementById('c_dow');
    if (c_dow && DATA.dow.valores.length) {
      new Chart(c_dow, {
        type: 'bar',
        data: {
          labels: DATA.dow.labels,
          datasets: [{
            data: DATA.dow.valores,
            backgroundColor: DATA.dow.valores.map((_, i) => (DATA.dow.labels[i] === 'Sáb' || DATA.dow.labels[i] === 'Dom') ? 'rgba(158,26,69,0.4)' : 'rgba(45,167,90,0.4)'),
            borderColor: DATA.dow.labels.map((_, i) => (DATA.dow.labels[i] === 'Sáb' || DATA.dow.labels[i] === 'Dom') ? C.vinho : C.success),
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax(), y: ax({ beginAtZero: true, ticks: { callback: kf } }) }
        }
      });
    }

    // 9. Velocidade
    const c_vel = document.getElementById('c_vel');
    if (c_vel && DATA.vel_hist.valores.length) {
      new Chart(c_vel, {
        type: 'bar',
        data: {
          labels: DATA.vel_hist.labels,
          datasets: [{
            data: DATA.vel_hist.valores,
            backgroundColor: DATA.vel_hist.labels.map((l, i) => i >= 3 ? 'rgba(226,75,74,0.55)' : 'rgba(79,160,255,0.45)'),
            borderColor: DATA.vel_hist.labels.map((l, i) => i >= 3 ? C.danger : C.info),
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax(), y: ax({ beginAtZero: true, ticks: { callback: kf } }) }
        }
      });
    }

    // 10. Evidência
    const c_evid = document.getElementById('c_evid');
    if (c_evid && DATA.evidencia) {
      const keys = Object.keys(DATA.evidencia);
      new Chart(c_evid, {
        type: 'doughnut',
        data: {
          labels: keys,
          datasets: [{
            data: keys.map(k => DATA.evidencia[k]),
            backgroundColor: [C.success, C.text],
            borderColor: isDark ? '#161315' : '#fff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { display: true, position: 'bottom' } }
        }
      });
    }

    // 11. Motoristas
    const c_mot = document.getElementById('c_mot');
    if (c_mot && DATA.top_motoristas.valores.length) {
      new Chart(c_mot, {
        type: 'bar',
        data: {
          labels: DATA.top_motoristas.labels,
          datasets: [{
            data: DATA.top_motoristas.valores,
            backgroundColor: 'rgba(158,26,69,0.55)',
            borderColor: C.vinho,
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax({ beginAtZero: true }), y: ax() }
        }
      });
    }

    // 12. Placas
    const c_placa = document.getElementById('c_placa');
    if (c_placa && DATA.top_placas.valores.length) {
      new Chart(c_placa, {
        type: 'bar',
        data: {
          labels: DATA.top_placas.labels,
          datasets: [{
            data: DATA.top_placas.valores,
            backgroundColor: 'rgba(158,26,69,0.55)',
            borderColor: C.vinho,
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax({ beginAtZero: true }), y: ax() }
        }
      });
    }

    // 13. UF
    const c_uf = document.getElementById('c_uf');
    if (c_uf && DATA.uf.valores.length) {
      new Chart(c_uf, {
        type: 'bar',
        data: {
          labels: DATA.uf.labels,
          datasets: [{
            data: DATA.uf.valores,
            backgroundColor: 'rgba(42,141,217,0.55)',
            borderColor: C.info,
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax(), y: ax({ beginAtZero: true }) }
        }
      });
    }

    // 14. Frota
    const c_frota = document.getElementById('c_frota');
    if (c_frota && DATA.top_frota.valores.length) {
      new Chart(c_frota, {
        type: 'bar',
        data: {
          labels: DATA.top_frota.labels,
          datasets: [{
            data: DATA.top_frota.valores,
            backgroundColor: 'rgba(45,167,90,0.55)',
            borderColor: C.success,
            borderWidth: 1.5,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: ax({ beginAtZero: true }) }
        }
      });
    }

  })();
</script>`;

  // Assemble the complete HTML document
  const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${activeTheme}" data-density="${activeDensity}" data-mode="${activeMode}" data-vibe="${activeVibe}" data-rhythm="${activeRhythm}" style="${inlineStyles}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Analytics - MedNet Fadiga Zero</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.33.0/dist/tabler-icons.min.css" rel="stylesheet" />
  ${stylesHtml}
  <style>
    html, body {
      height: auto !important;
      overflow: auto !important;
    }
    body {
      background-color: var(--bg-app, #0d0c0d);
      color: var(--text-primary, #ffffff);
      font-family: var(--font-sans, 'DM Sans', 'Poppins', sans-serif);
      margin: 0;
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .exported-wrapper {
      width: 100%;
      max-width: 1200px;
    }
    .card {
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="exported-wrapper">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-muted);">
      <div>
        <span>Relatório gerado em: <strong>${new Date().toLocaleString('pt-BR')}</strong></span>
      </div>
      <div>
        <span>Plataforma MedNet · Fadiga Zero</span>
      </div>
    </div>
    ${clone.outerHTML}
  </div>
  ${chartInitScript}
</body>
</html>`;

  // Trigger download
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `relatorio_analytics_fadiga_${new Date().toISOString().slice(0, 10)}.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
