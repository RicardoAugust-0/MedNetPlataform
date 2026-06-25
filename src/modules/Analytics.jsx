import { useState, useEffect, useMemo, useRef } from 'react';
import { PLATFORMS } from '../utils/fatigueParser.js';
import { supabase } from '../supabase.js';
import { useToast } from '../hooks/useToast.jsx';
import { apiFetch, buildAnalyticsQuery } from '../lib/analyticsApi.js';

import '../styles/analytics.css';

// Subcomponents
import FadigaKPIs from './analytics/FadigaKPIs.jsx';
import ComparisonView from './analytics/ComparisonView.jsx';
import FadigaCharts from './analytics/FadigaCharts.jsx';
import ImportModal from './analytics/ImportModal.jsx';
import FadigaKPIsDrill from './analytics/components/FadigaKPIsDrill.jsx';

// Modular components
import AnalyticsHeader from './analytics/components/AnalyticsHeader.jsx';
import SourceChips from './analytics/components/SourceChips.jsx';
import ComparisonModal from './analytics/components/ComparisonModal.jsx';

export default function Analytics() {
  const [sources, setSources] = useState([]);
  const [d, setD] = useState(null);
  const [prevD, setPrevD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [platformCounts, setPlatformCounts] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableTypes, setAvailableTypes] = useState([]);

  // Restaura a fonte ativa direto no estado inicial: assim o effect reativo já
  // faz a carga inicial correta, sem precisar de um segundo effect de mount
  // (que causava duplo fetch concorrente).
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_active_id') || null;
    } catch (e) {
      return null;
    }
  });
  const [activeKpi, setActiveKpi] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_selected_month') || null;
    } catch (e) {
      return null;
    }
  });

  const [compare, setCompare] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_compare') === 'true';
    } catch (e) {
      return false;
    }
  });

  const [comparePlatformIds, setComparePlatformIds] = useState(() => {
    try {
      const saved = localStorage.getItem('mednet_analytics_compare_platform_ids');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem('mednet_analytics_compare_platform_ids', JSON.stringify(comparePlatformIds));
    } catch (e) {}
  }, [comparePlatformIds]);

  const [selectedSeverity, setSelectedSeverity] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_severity') || 'all';
    } catch (e) {
      return 'all';
    }
  });

  const [startDate, setStartDate] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_start_date') || '';
    } catch (e) {
      return '';
    }
  });

  const [endDate, setEndDate] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_end_date') || '';
    } catch (e) {
      return '';
    }
  });

  const [modalOpen, setModalOpen] = useState(false);
  const toast = useToast();
  const lastLoadedRef = useRef({
    activeId: null,
    compare: false,
    comparePlatformIds: [],
    compareMode: 'platforms',
    companyComparePlatform: '',
    companyCompareList: [],
    selectedMonth: null,
    startDate: '',
    endDate: ''
  });
  // Sequência de carregamento: descarta respostas fora de ordem (a última
  // requisição emitida vence, não a última a resolver).
  const loadSeqRef = useRef(0);
  const loadAbortRef = useRef(null);

  const [selectedCompany, setSelectedCompany] = useState('');
  const [compareCompanies, setCompareCompanies] = useState(() => {
    try {
      const saved = localStorage.getItem('mednet_analytics_compare_companies');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  // Modo de comparação: 'platforms' (plataformas entre si) ou 'companies'
  // (empresas de UMA plataforma entre si).
  const [compareMode, setCompareMode] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_compare_mode') || 'platforms';
    } catch (e) {
      return 'platforms';
    }
  });
  const [companyComparePlatform, setCompanyComparePlatform] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_company_cmp_platform') || '';
    } catch (e) {
      return '';
    }
  });
  const [companyCompareList, setCompanyCompareList] = useState(() => {
    try {
      const saved = localStorage.getItem('mednet_analytics_company_cmp_list');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  // Opções para o modal (plataformas + suas empresas), carregadas sob demanda.
  const [compareOptions, setCompareOptions] = useState([]);
  // Estado temporário do modal.
  const [tempMode, setTempMode] = useState('platforms');
  const [tempCompanyPlatform, setTempCompanyPlatform] = useState('');
  const [tempCompanyList, setTempCompanyList] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem('mednet_analytics_compare_mode', compareMode);
      localStorage.setItem('mednet_analytics_company_cmp_platform', companyComparePlatform);
      localStorage.setItem('mednet_analytics_company_cmp_list', JSON.stringify(companyCompareList));
    } catch (e) {}
  }, [compareMode, companyComparePlatform, companyCompareList]);

  useEffect(() => {
    try {
      localStorage.setItem('mednet_analytics_compare_companies', JSON.stringify(compareCompanies));
    } catch (e) {}
  }, [compareCompanies]);
  const [selectedClassification, setSelectedClassification] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_classification') || 'all';
    } catch (e) {
      return 'all';
    }
  });
  const [selectedType, setSelectedType] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_type') || '';
    } catch (e) {
      return '';
    }
  });

  useEffect(() => {
    localStorage.setItem('mednet_analytics_severity', selectedSeverity);
  }, [selectedSeverity]);

  useEffect(() => {
    localStorage.setItem('mednet_analytics_classification', selectedClassification);
  }, [selectedClassification]);

  useEffect(() => {
    if (selectedType) {
      localStorage.setItem('mednet_analytics_type', selectedType);
    } else {
      localStorage.removeItem('mednet_analytics_type');
    }
  }, [selectedType]);

  useEffect(() => {
    if (startDate) {
      localStorage.setItem('mednet_analytics_start_date', startDate);
    } else {
      localStorage.removeItem('mednet_analytics_start_date');
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      localStorage.setItem('mednet_analytics_end_date', endDate);
    } else {
      localStorage.removeItem('mednet_analytics_end_date');
    }
  }, [endDate]);

  useEffect(() => {
    setSelectedCompany('');
    setSelectedClassification('all');
    setSelectedType('');
    setActiveKpi(null);
  }, [activeId, compare]);



  const loadFromDatabase = async (preferredPlatformId = null, isSilent = false) => {
    // Guard de corrida: cancela a requisição anterior e marca esta como a atual.
    // Respostas fora de ordem (de uma seleção antiga) são descartadas.
    if (loadAbortRef.current) loadAbortRef.current.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;

    if (!isSilent) {
      setLoading(true);
    }
    try {
      // 1. Fetch platform counts from backend
      let counts = {};
      try {
        const res = await apiFetch('/api/platforms', { signal: controller.signal });
        if (res.ok) {
          counts = await res.json();
        } else {
          throw new Error('Falha ao obter contagem do servidor');
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('[MedNet] Fallback para Supabase local para contagem:', err);
        // Fallback client-side. `.or(severidade.is.null,severidade.neq.Leve)`
        // preserva linhas com severidade NULL — mesma semântica do rollup e do
        // excludeLeve; `.neq` sozinho descartaria os NULLs e subnotificaria.
        const promises = PLATFORMS.map(async (p) => {
          const { count, error } = await supabase
            .from('driver_events')
            .select('*', { count: 'exact', head: true })
            .eq('platform_id', p.id)
            .or('severidade.is.null,severidade.neq.Leve');
          if (!error && count !== null) {
            counts[p.id] = count;
          }
        });
        await Promise.all(promises);
      }
      if (isStale()) return;
      setPlatformCounts(counts);

      // Mantém apenas plataformas de comparação que realmente têm dados — evita
      // ids "órfãos" salvos no localStorage (ex.: fonte excluída) que deixariam a
      // comparação em branco. Só sanitiza quando as contagens vieram de fato
      // (se a contagem falhou, preserva a seleção do usuário em vez de zerá-la).
      const haveCounts = Object.keys(counts).length > 0;
      const savedCompareIds = comparePlatformIds || [];
      const validCompareIds = haveCounts
        ? savedCompareIds.filter((pid) => counts[pid] > 0)
        : savedCompareIds;
      if (compare && haveCounts && validCompareIds.length !== savedCompareIds.length) {
        setComparePlatformIds(validCompareIds);
      }

      // Determine active platform ID to load
      let targetPlatformId = preferredPlatformId;
      if (!targetPlatformId && activeId) {
        const cleanId = activeId.replace('src-', '');
        if (counts[cleanId] > 0) {
          targetPlatformId = cleanId;
        }
      }

      // If we don't have a target platform selected and aren't in comparison mode, do not load any events
      if (!targetPlatformId && !compare) {
        setSources([]);
        setD(null);
        setPrevD(null);
        setLoading(false);
        setActiveId(null);
        return;
      }

      let activeMonth = selectedMonth;

      // Monta a lista de fontes a comparar conforme o modo.
      // - 'platforms': uma fonte por plataforma (com filtro de empresa opcional).
      // - 'companies': uma fonte por empresa de UMA mesma plataforma.
      let compareSources = [];
      if (compare) {
        if (compareMode === 'companies') {
          const pid = companyComparePlatform;
          if (pid && counts[pid] > 0) {
            compareSources = (companyCompareList || []).map((c) => ({ platformId: pid, company: c }));
          }
        } else {
          compareSources = validCompareIds.map((pid) => ({ platformId: pid, company: compareCompanies[pid] || '' }));
        }
      }

      // Precisa de pelo menos duas fontes válidas para comparar.
      if (compare && compareSources.length < 2) {
        setSources([]);
        setD(null);
        setPrevD(null);
        setLoading(false);
        return;
      }

      // Load analytics from backend Express server (builder unificado).
      const qs = buildAnalyticsQuery({
        compare,
        sources: compareSources,
        platformId: targetPlatformId,
        company: selectedCompany,
        month: activeMonth,
        startDate,
        endDate,
        severity: selectedSeverity,
        classification: selectedClassification,
        eventType: selectedType,
      });

      const res = await apiFetch(`/api/analytics?${qs}`, { signal: controller.signal });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro no servidor de analytics');
      }

      const data = await res.json();
      if (isStale()) return;

      setAvailableMonths(data.availableMonths || []);
      setAvailableCompanies(data.availableCompanies || []);
      setAvailableTypes(data.availableTypes || []);

      const monthsList = data.availableMonths || [];
      if (monthsList.length > 0) {
        if (activeMonth === null || (activeMonth !== 'all' && activeMonth !== 'custom' && !monthsList.includes(activeMonth))) {
          // Default to latest month on initial load or if the active month is invalid
          setSelectedMonth(monthsList[0]);
        }
      }

      setD(data.d || null);
      setPrevD(data.prevD || null);

      if (compare) {
        setSources(data.sources || []);
      } else {
        const platformName = PLATFORMS.find(p => p.id === targetPlatformId)?.name || targetPlatformId;
        const singleSource = {
          id: 'src-' + targetPlatformId,
          platformId: targetPlatformId,
          platformName,
          rows: data.d,
          prevD: data.prevD
        };
        setSources([singleSource]);
        if (activeId !== 'src-' + targetPlatformId) {
          setActiveId('src-' + targetPlatformId);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[MedNet] Erro ao carregar analíticos:', err);
      toast('Não foi possível carregar os dados de analytics: ' + (err.message || String(err)), 'error');
    } finally {
      // Só a requisição atual controla o loading — uma obsoleta que terminou
      // (ou foi abortada) não deve desligar o spinner de uma carga mais nova.
      if (!isStale()) setLoading(false);
    }
  };

  // A carga inicial é feita pelo effect reativo abaixo (activeId já vem
  // restaurado do localStorage no useState), evitando um segundo fetch de mount.

  // Update dates automatically when selecting a dynamic month
  useEffect(() => {
    if (selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const newStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const pad = (n) => String(n).padStart(2, '0');
      const newEnd = `${year}-${pad(month)}-${pad(lastDay)}`;
      if (newStart !== startDate) setStartDate(newStart);
      if (newEnd !== endDate) setEndDate(newEnd);
    }
  }, [selectedMonth]);

  // Swap dates if custom range has start after end
  useEffect(() => {
    if (selectedMonth === 'custom' && startDate && endDate && startDate > endDate) {
      const tmp = startDate;
      setStartDate(endDate);
      setEndDate(tmp);
    }
  }, [selectedMonth, startDate, endDate]);

  useEffect(() => {
    const last = lastLoadedRef.current;
    const platformChanged = last.activeId !== activeId ||
                           last.compare !== compare ||
                           JSON.stringify(last.comparePlatformIds) !== JSON.stringify(comparePlatformIds) ||
                           last.compareMode !== compareMode ||
                           last.companyComparePlatform !== companyComparePlatform ||
                           JSON.stringify(last.companyCompareList) !== JSON.stringify(companyCompareList) ||
                           last.selectedMonth !== selectedMonth ||
                           last.startDate !== startDate ||
                           last.endDate !== endDate;

    lastLoadedRef.current = { activeId, compare, comparePlatformIds, compareMode, companyComparePlatform, companyCompareList, selectedMonth, startDate, endDate };

    if (selectedMonth === 'custom') {
      if (startDate && endDate) {
        loadFromDatabase(null, !platformChanged);
      }
    } else {
      loadFromDatabase(null, !platformChanged);
    }
  }, [
    activeId,
    compare,
    comparePlatformIds,
    compareMode,
    companyComparePlatform,
    companyCompareList,
    selectedMonth,
    startDate,
    endDate,
    selectedCompany,
    compareCompanies,
    selectedSeverity,
    selectedClassification,
    selectedType
  ]);

  useEffect(() => {
    if (activeId) {
      localStorage.setItem('mednet_analytics_active_id', activeId);
    } else {
      localStorage.removeItem('mednet_analytics_active_id');
    }
  }, [activeId]);

  useEffect(() => {
    if (selectedMonth) {
      localStorage.setItem('mednet_analytics_selected_month', selectedMonth);
    } else {
      localStorage.removeItem('mednet_analytics_selected_month');
    }
  }, [selectedMonth]);

  useEffect(() => {
    localStorage.setItem('mednet_analytics_compare', String(compare));
  }, [compare]);

  // Compute active source and its aggregated data reactively
  const activeSource = useMemo(() => {
    return sources.find((s) => s.id === activeId) || null;
  }, [sources, activeId]);

  const exportToCSV = async () => {
    if (!activeSource) return;
    // Via fetch+blob (não window.location.href) para enviar o header de auth —
    // o endpoint de CSV agora exige token admin.
    const qs = buildAnalyticsQuery({
      platformId: activeSource.platformId,
      company: selectedCompany,
      month: selectedMonth,
      startDate,
      endDate,
      severity: selectedSeverity,
      classification: selectedClassification,
      eventType: selectedType,
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

  const exportToHTML = async () => {
    const container = document.querySelector('.analytics-container');
    if (!container) return;

    // Clone the container to manipulate it offline
    const clone = container.cloneNode(true);

    // Convert canvases to base64 images
    const originalCanvases = container.querySelectorAll('canvas');
    const clonedCanvases = clone.querySelectorAll('canvas');
    originalCanvases.forEach((origCanvas, idx) => {
      const clonedCanvas = clonedCanvases[idx];
      if (clonedCanvas) {
        try {
          const img = document.createElement('img');
          img.src = origCanvas.toDataURL('image/png');
          img.style.cssText = clonedCanvas.style.cssText;
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.width = origCanvas.width;
          img.height = origCanvas.height;
          img.className = clonedCanvas.className;
          clonedCanvas.replaceWith(img);
        } catch (e) {
          console.error('[MedNet] Erro ao converter canvas para imagem:', e);
        }
      }
    });

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

  const onImportConfirm = async (rowsToInsert, platformId, platformName) => {
    setSaving(true);
    try {
      // 1. Deduplicar em memória antes de enviar ao banco de dados
      const uniqueRows = [];
      const seenKeys = new Set();
      for (const r of rowsToInsert) {
        const key = `${r.platform_id}|${r.placa}|${r.ocorrido_em}|${r.nome_evento}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueRows.push(r);
        }
      }

      const dupsFiltered = rowsToInsert.length - uniqueRows.length;
      console.log(`[Import] De ${rowsToInsert.length} linhas, ${uniqueRows.length} são únicas. ${dupsFiltered} duplicados locais ignorados.`);

      // 2. Inserir no banco de dados usando chunks adaptativos para evitar statement timeout
      let chunkSize = 400; // Começa com 400
      let i = 0;
      const totalRows = uniqueRows.length;
      let lastReportedProgress = 0;

      while (i < totalRows) {
        const chunk = uniqueRows.slice(i, i + chunkSize);
        
        try {
          const { error: upsertError } = await supabase
            .from('driver_events')
            .upsert(chunk, {
              onConflict: 'platform_id,placa,ocorrido_em,nome_evento',
              ignoreDuplicates: true,
            });

          if (upsertError) {
            throw upsertError;
          }

          // Se teve sucesso, avança no vetor
          i += chunk.length;

          // Dar feedback visual a cada ~10% de progresso
          const progress = Math.min(Math.round((i / totalRows) * 100), 100);
          if (progress - lastReportedProgress >= 10 || progress === 100) {
            lastReportedProgress = progress;
            toast(`Gravando dados: ${progress}% concluído (${i.toLocaleString('pt-BR')}/${totalRows.toLocaleString('pt-BR')})...`, 'info');
          }

          // Delay curto de respiro
          await new Promise((resolve) => setTimeout(resolve, 60));
        } catch (err) {
          const errCodeStr = String(err?.code || '');
          const errMessageStr = String(err?.message || err || '').toLowerCase();
          const errStatus = err?.status;

          // Se for erro de timeout ou erro de gateway (500/504), e o lote ainda for redutível
          if ((errCodeStr === '57014' || 
               errMessageStr.includes('timeout') || 
               errMessageStr.includes('failed to fetch') ||
               errStatus === 500 || errStatus === 504) && chunkSize > 25) {
            const oldSize = chunkSize;
            chunkSize = Math.max(25, Math.floor(chunkSize / 2));
            console.warn(`[Import] Instabilidade/Timeout detectado com lote de ${oldSize}. Reduzindo lote para ${chunkSize} e retentando...`, err);
            toast(`Ajustando velocidade do banco (lote reduzido para ${chunkSize})...`, 'warning');
            
            // Pausa de 1.5s antes de retentar com lote menor
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } else {
            // Se for outro erro definitivo ou o lote já estiver no tamanho mínimo (25), falha definitivamente
            throw err;
          }
        }
      }

      try {
        await apiFetch('/api/clear-cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platformId }),
        });
      } catch (cacheErr) {
        console.warn('[MedNet] Falha ao limpar cache no backend:', cacheErr);
      }

      setModalOpen(false);
      toast(
        `Planilha processada · ${platformName} · ${uniqueRows.length.toLocaleString(
          'pt-BR'
        )} registros únicos salvos${dupsFiltered > 0 ? ` (${dupsFiltered.toLocaleString('pt-BR')} duplicados locais filtrados)` : ''}.`,
        'success'
      );

      await loadFromDatabase(platformId);
    } catch (err) {
      console.error('Erro ao salvar no banco:', err);
      const errMsg = err?.message || String(err);
      const errDetails = err?.details ? ` | Detalhes: ${err.details}` : '';
      const errHint = err?.hint ? ` | Dica: ${err.hint}` : '';
      const errCode = err?.code ? ` (Código: ${err.code})` : '';
      toast(`Erro ao salvar no banco de dados: ${errMsg}${errDetails}${errHint}${errCode}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCompareClick = async () => {
    if (compare) {
      setCompare(false);
      setComparePlatformIds([]);
      const firstAvailable = sourcesList[0]?.id || null;
      setActiveId(firstAvailable);
      return;
    }
    // Carrega opções (plataformas + suas empresas) para o modal.
    try {
      const res = await apiFetch('/api/compare-options');
      if (res.ok) {
        const opts = await res.json();
        setCompareOptions(Array.isArray(opts) ? opts : []);
      } else {
        throw new Error('Falha ao obter opções de comparação');
      }
    } catch (e) {
      console.warn('[MedNet] Falha ao carregar opções de comparação:', e);
      // Modo "plataformas" ainda funciona sem as opções; só o modo "empresas"
      // depende delas. Avisa o usuário em vez de abrir o modal mudo.
      toast('Não foi possível carregar as empresas para comparação. O modo por empresa pode ficar indisponível.', 'warning');
    }
    // Inicializa o estado temporário do modal a partir da seleção atual.
    setTempMode(compareMode);
    setTempSelected(comparePlatformIds.length ? comparePlatformIds : (activeId ? [activeId.replace('src-', '')] : []));
    setTempCompanyPlatform(companyComparePlatform || (activeId ? activeId.replace('src-', '') : ''));
    setTempCompanyList(companyCompareList);
    setCompareModalOpen(true);
  };

  const handleToggleTempCompare = (pid) => {
    setTempSelected((prev) => {
      if (prev.includes(pid)) {
        return prev.filter((x) => x !== pid);
      } else {
        return [...prev, pid];
      }
    });
  };

  const handleSelectTempCompanyPlatform = (pid) => {
    setTempCompanyPlatform(pid);
    setTempCompanyList([]);
  };

  const handleToggleTempCompany = (companyName) => {
    setTempCompanyList((prev) =>
      prev.includes(companyName) ? prev.filter((x) => x !== companyName) : [...prev, companyName]
    );
  };

  const handleConfirmCompare = () => {
    if (tempMode === 'companies') {
      if (!tempCompanyPlatform || tempCompanyList.length < 2) {
        toast('Selecione uma plataforma e pelo menos duas empresas para comparar.', 'warning');
        return;
      }
      setCompareMode('companies');
      setCompanyComparePlatform(tempCompanyPlatform);
      setCompanyCompareList(tempCompanyList);
      setCompare(true);
      setCompareModalOpen(false);
    } else {
      if (tempSelected.length < 2) {
        toast('Por favor, selecione pelo menos duas plataformas para comparar.', 'warning');
        return;
      }
      setCompareMode('platforms');
      setComparePlatformIds(tempSelected);
      setCompare(true);
      setCompareModalOpen(false);
    }
  };

  const removeSource = async (id, event) => {
    event.stopPropagation();
    const targetSource = sourcesList.find((s) => s.id === id);
    if (!targetSource) return;

    const confirmed = window.confirm(
      `Deseja realmente excluir todos os registros de "${targetSource.platformName}" do banco de dados? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('driver_events')
        .delete()
        .eq('platform_id', targetSource.platformId);

      if (error) throw error;

      toast(`Todos os registros de ${targetSource.platformName} foram excluídos.`, 'success');
      if (activeId === id) {
        setActiveId(null);
        localStorage.removeItem('mednet_analytics_active_id');
      }
      await loadFromDatabase();
    } catch (err) {
      console.error('Erro ao excluir registros:', err);
      toast('Erro ao excluir registros do banco de dados: ' + (err.message || String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatMonthKey = (mk) => {
    if (!mk || mk === 'all') return 'Todos os meses';
    const [y, m] = mk.split('-');
    const MESES_COMPLETOS = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    return `${MESES_COMPLETOS[parseInt(m) - 1]} de ${y}`;
  };

  const noData = !d;

  const sourcesList = useMemo(() => {
    return Object.keys(platformCounts)
      .filter((pid) => platformCounts[pid] > 0)
      .map((pid) => {
        const platform = PLATFORMS.find((p) => p.id === pid);
        return {
          id: 'src-' + pid,
          platformId: pid,
          platformName: platform ? platform.name : pid,
          rows: platformCounts[pid]
        };
      });
  }, [platformCounts]);

  if (loading) {
    return (
      <div style={{ width: '100%', minHeight: '60vh', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <i className="ti ti-loader-2 fz-spin" style={{ fontSize: '38px', color: '#9E1A45' }}></i>
          <span style={{ fontSize: '13.5px', fontWeight: 500 }}>Agregando dados...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '4px 0 24px' }}>
      <div className="analytics-container">
        
        <AnalyticsHeader
          activeId={activeId}
          compare={compare}
          availableMonths={availableMonths}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          formatMonthKey={formatMonthKey}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          d={d}
          sourcesList={sourcesList}
          handleCompareClick={handleCompareClick}
          activeSource={activeSource}
          exportToCSV={exportToCSV}
          exportToHTML={exportToHTML}
          setModalOpen={setModalOpen}
          selectedCompany={selectedCompany}
          setSelectedCompany={setSelectedCompany}
          availableCompanies={availableCompanies}
        />

        <SourceChips
          sourcesList={sourcesList}
          activeId={activeId}
          compare={compare}
          setCompare={setCompare}
          setActiveId={setActiveId}
          removeSource={removeSource}
        />

        {/* Hero de Sem Dados */}
        {sourcesList.length === 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #5A0F25, #1A0308)',
            color: '#fff',
            borderRadius: '12px',
            padding: '24px 26px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            marginBottom: '22px',
            border: '1px solid rgba(158,26,69,0.3)',
            flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <div style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#E09AB5', fontWeight: 600, marginBottom: '5px' }}>
                Importação universal
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Nenhuma planilha carregada</h3>
              <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.72)', marginTop: '6px', maxWidth: '620px', lineHeight: 1.6, margin: '6px 0 0' }}>
                Importe um relatório de qualquer plataforma — MaxTrack, Sascar, Sascar JD, Sighra, Horizon, AutoTrac, OmniLink ou Trimble. O sistema detecta o layout, mapeia as colunas e preenche os indicadores automaticamente. Os gráficos abaixo mostram a estrutura final dos dados.
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                border: 'none',
                backgroundColor: '#F26931',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-upload" style={{ fontSize: '16px' }}></i> Importar planilha
            </button>
          </div>
        )}

        {/* Placeholder para Selecionar Fonte */}
        {sourcesList.length > 0 && !activeId && !compare && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(158, 26, 69, 0.04), rgba(15, 25, 35, 0.01))',
            borderRadius: '12px',
            padding: '46px 20px',
            textAlign: 'center',
            border: '1px dashed var(--border)',
            marginBottom: '22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}>
            <i className="ti ti-hand-finger" style={{ fontSize: '36px', color: '#9E1A45' }}></i>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Nenhum relatório selecionado</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, maxWidth: '500px', lineHeight: '1.5' }}>
              Selecione uma das fontes de dados acima para carregar o relatório e visualizar os gráficos e indicadores de fadiga.
            </p>
          </div>
        )}

        {/* KPIs Row */}
        {(activeId || compare) && (
          <>
            <FadigaKPIs
              d={d}
              prevD={prevD}
              activeKpi={activeKpi}
              setActiveKpi={setActiveKpi}
            />
            <FadigaKPIsDrill
              activeKpi={activeKpi}
              d={d}
              prevD={prevD}
              selectedMonth={selectedMonth}
              startDate={startDate}
              endDate={endDate}
              selectedCompany={selectedCompany}
              selectedSeverity={selectedSeverity}
              selectedType={selectedType}
              activeId={activeId}
              compare={compare}
              comparePlatformIds={comparePlatformIds}
              compareCompanies={compareCompanies}
            />
          </>
        )}

        {/* Comparação */}
        {compare && sources.length >= 2 && (
          <ComparisonView
            sources={sources}
            selectedMonth={selectedMonth}
            formatMonthKey={formatMonthKey}
            compareCompanies={compareCompanies}
            setCompareCompanies={setCompareCompanies}
            selectedSeverity={selectedSeverity}
            compareMode={compareMode}
          />
        )}

        {(activeId || compare) && (
          <FadigaCharts
            d={d}
            noData={noData}
            selectedMonth={selectedMonth}
            formatMonthKey={formatMonthKey}
            selectedSeverity={selectedSeverity}
            setSelectedSeverity={setSelectedSeverity}
            selectedClassification={selectedClassification}
            setSelectedClassification={setSelectedClassification}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            availableTypes={availableTypes}
            selectedCompany={selectedCompany}
            setSelectedCompany={setSelectedCompany}
            availableCompanies={availableCompanies}
            compare={compare}
          />
        )}

        {/* Nota explicativa de rodapé */}
        <div style={{ marginTop: '24px', fontSize: '11.5px', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px', background: 'var(--surface-0)', lineHeight: '1.7' }}>
          <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Como ler. </b>
          Os indicadores são recalculados a cada importação e filtragem. Criticidades com grafias divergentes são unificadas em Gravíssimo / Grave / Médio; a classificação é normalizada em Positivo / Falso positivo / Não classificado. Eventos de criticidade <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Leve</b> são preservados no banco, mas ficam fora da análise. A UF é extraída do texto da localidade. Use <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Comparar plataformas</b> para confrontar duas ou mais fontes e <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Exportar PDF</b> para gerar o relatório completo para impressão.
        </div>

      </div>

      <ImportModal
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        saving={saving}
        onImportConfirm={onImportConfirm}
      />

      {compareModalOpen && (
        <ComparisonModal
          sourcesList={sourcesList}
          compareOptions={compareOptions}
          tempMode={tempMode}
          setTempMode={setTempMode}
          tempSelected={tempSelected}
          handleToggleTempCompare={handleToggleTempCompare}
          tempCompanyPlatform={tempCompanyPlatform}
          handleSelectTempCompanyPlatform={handleSelectTempCompanyPlatform}
          tempCompanyList={tempCompanyList}
          handleToggleTempCompany={handleToggleTempCompany}
          handleConfirmCompare={handleConfirmCompare}
          setCompareModalOpen={setCompareModalOpen}
        />
      )}
    </div>
  );
}
