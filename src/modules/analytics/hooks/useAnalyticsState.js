import { useState, useEffect, useMemo, useRef } from 'react';
import { PLATFORMS } from '../../../utils/fatigueParser.js';
import { supabase } from '../../../supabase.js';
import { useToast } from '../../../hooks/useToast.jsx';
import { apiFetch, buildAnalyticsQuery } from '../../../lib/analyticsApi.js';
import { exportToCSV as exportCSVUtil, exportToHTML as exportHTMLUtil } from '../utils/exportUtils.js';
import { formatMonthKey } from '../utils/formatUtils.js';

export function useAnalyticsState() {
  const [sources, setSources] = useState([]);
  const [d, setD] = useState(null);
  const [prevD, setPrevD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [platformCounts, setPlatformCounts] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableTypes, setAvailableTypes] = useState([]);

  // Restaura a fonte ativa direto no estado inicial
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

  // Sequência de carregamento
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

  // Modo de comparação: 'platforms' ou 'companies'
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
  
  // Opções para o modal, carregadas sob demanda.
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
    if (loadAbortRef.current) loadAbortRef.current.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;

    if (!isSilent) {
      setLoading(true);
    }
    try {
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

      const haveCounts = Object.keys(counts).length > 0;
      const savedCompareIds = comparePlatformIds || [];
      const validCompareIds = haveCounts
        ? savedCompareIds.filter((pid) => counts[pid] > 0)
        : savedCompareIds;
      if (compare && haveCounts && validCompareIds.length !== savedCompareIds.length) {
        setComparePlatformIds(validCompareIds);
      }

      let targetPlatformId = preferredPlatformId;
      if (!targetPlatformId && activeId) {
        const cleanId = activeId.replace('src-', '');
        if (counts[cleanId] > 0) {
          targetPlatformId = cleanId;
        }
      }

      if (!targetPlatformId && !compare) {
        setSources([]);
        setD(null);
        setPrevD(null);
        setLoading(false);
        setActiveId(null);
        return;
      }

      let activeMonth = selectedMonth;
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

      if (compare && compareSources.length < 2) {
        setSources([]);
        setD(null);
        setPrevD(null);
        setLoading(false);
        return;
      }

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
      if (!isStale()) setLoading(false);
    }
  };

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

  const activeSource = useMemo(() => {
    return sources.find((s) => s.id === activeId) || null;
  }, [sources, activeId]);

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

  const exportToCSV = () => {
    return exportCSVUtil({
      activeSource,
      selectedCompany,
      selectedMonth,
      startDate,
      endDate,
      selectedSeverity,
      selectedClassification,
      selectedType,
      toast
    });
  };

  const exportToHTML = () => {
    return exportHTMLUtil(d);
  };

  const onImportConfirm = async (rowsToInsert, platformId, platformName) => {
    setSaving(true);
    try {
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

      let chunkSize = 1000;
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

          i += chunk.length;

          // Recupera gradualmente o tamanho do lote em caso de sucesso
          if (chunkSize < 1000) {
            chunkSize = Math.min(1000, chunkSize + 100);
          }

          const progress = Math.min(Math.round((i / totalRows) * 100), 100);
          if (progress - lastReportedProgress >= 10 || progress === 100) {
            lastReportedProgress = progress;
            toast(`Gravando dados: ${progress}% concluído (${i.toLocaleString('pt-BR')}/${totalRows.toLocaleString('pt-BR')})...`, 'info');
          }

          await new Promise((resolve) => setTimeout(resolve, 60));
        } catch (err) {
          const errCodeStr = String(err?.code || '');
          const errMessageStr = String(err?.message || err || '').toLowerCase();
          const errStatus = err?.status;

          if ((errCodeStr === '57014' || 
               errMessageStr.includes('timeout') || 
               errMessageStr.includes('failed to fetch') ||
               errStatus === 500 || errStatus === 504) && chunkSize > 25) {
            const oldSize = chunkSize;
            chunkSize = Math.max(25, Math.floor(chunkSize / 2));
            console.warn(`[Import] Instabilidade/Timeout detectado com lote de ${oldSize}. Reduzindo lote para ${chunkSize} e retentando...`, err);
            toast(`Ajustando velocidade do banco (lote reduzido para ${chunkSize})...`, 'warning');
            
            await new Promise((resolve) => setTimeout(resolve, 1500));
          } else {
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
      toast('Não foi possível carregar as empresas para comparação. O modo por empresa pode ficar indisponível.', 'warning');
    }
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

  const noData = !d;

  return {
    sources,
    d,
    prevD,
    loading,
    saving,
    platformCounts,
    availableMonths,
    availableCompanies,
    availableTypes,
    activeId,
    setActiveId,
    activeKpi,
    setActiveKpi,
    selectedMonth,
    setSelectedMonth,
    compare,
    setCompare,
    comparePlatformIds,
    setComparePlatformIds,
    compareModalOpen,
    setCompareModalOpen,
    tempSelected,
    setTempSelected,
    selectedSeverity,
    setSelectedSeverity,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    modalOpen,
    setModalOpen,
    selectedCompany,
    setSelectedCompany,
    compareCompanies,
    setCompareCompanies,
    compareMode,
    setCompareMode,
    companyComparePlatform,
    setCompanyComparePlatform,
    companyCompareList,
    setCompanyCompareList,
    compareOptions,
    setCompareOptions,
    tempMode,
    setTempMode,
    tempCompanyPlatform,
    setTempCompanyPlatform,
    tempCompanyList,
    setTempCompanyList,
    selectedClassification,
    setSelectedClassification,
    selectedType,
    setSelectedType,
    activeSource,
    sourcesList,
    noData,
    loadFromDatabase,
    exportToCSV,
    exportToHTML,
    onImportConfirm,
    handleCompareClick,
    handleToggleTempCompare,
    handleSelectTempCompanyPlatform,
    handleToggleTempCompany,
    handleConfirmCompare,
    removeSource,
    formatMonthKey,
  };
}
