import { useState, useEffect, useMemo, useRef } from 'react';
import { PLATFORMS } from '../../../utils/fatigueParser.js';
import { supabase } from '../../../supabase.js';
import { useToast } from '../../../hooks/useToast.jsx';
import { useConfirm } from '../../../hooks/useConfirm.jsx';
import { useSavedViews } from '../../../hooks/useSavedViews.js';
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
  const [availableUfs, setAvailableUfs] = useState([]);

  // Restaura a fonte ativa direto no estado inicial
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_active_id') || null;
    } catch {
      return null;
    }
  });
  const [activeKpi, setActiveKpi] = useState(null);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_selected_month') || null;
    } catch {
      return null;
    }
  });

  const [compare, setCompare] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_compare') === 'true';
    } catch {
      return false;
    }
  });

  const [comparePlatformIds, setComparePlatformIds] = useState(() => {
    try {
      const saved = localStorage.getItem('mednet_analytics_compare_platform_ids');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem('mednet_analytics_compare_platform_ids', JSON.stringify(comparePlatformIds));
    } catch {
      // Storage may be unavailable in hardened/private browser contexts.
    }
  }, [comparePlatformIds]);

  const [selectedSeverity, setSelectedSeverity] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_severity') || 'all';
    } catch {
      return 'all';
    }
  });

  const [startDate, setStartDate] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_start_date') || '';
    } catch {
      return '';
    }
  });

  const [endDate, setEndDate] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_end_date') || '';
    } catch {
      return '';
    }
  });

  const [modalOpen, setModalOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

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
  const platformCountsCacheRef = useRef({ data: {}, loadedAt: 0 });

  const [selectedCompany, setSelectedCompany] = useState('');
  const [compareCompanies, setCompareCompanies] = useState(() => {
    try {
      const saved = localStorage.getItem('mednet_analytics_compare_companies');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Modo de comparação: 'platforms' ou 'companies'
  const [compareMode, setCompareMode] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_compare_mode') || 'platforms';
    } catch {
      return 'platforms';
    }
  });
  const [companyComparePlatform, setCompanyComparePlatform] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_company_cmp_platform') || '';
    } catch {
      return '';
    }
  });
  const [companyCompareList, setCompanyCompareList] = useState(() => {
    try {
      const saved = localStorage.getItem('mednet_analytics_company_cmp_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
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
    } catch {
      // Storage may be unavailable in hardened/private browser contexts.
    }
  }, [compareMode, companyComparePlatform, companyCompareList]);

  useEffect(() => {
    try {
      localStorage.setItem('mednet_analytics_compare_companies', JSON.stringify(compareCompanies));
    } catch {
      // Storage may be unavailable in hardened/private browser contexts.
    }
  }, [compareCompanies]);

  const [selectedClassification, setSelectedClassification] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_classification') || 'all';
    } catch {
      return 'all';
    }
  });
  const [selectedType, setSelectedType] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_type') || '';
    } catch {
      return '';
    }
  });
  const [selectedUf, setSelectedUf] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_uf') || '';
    } catch {
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
    if (selectedUf) {
      localStorage.setItem('mednet_analytics_uf', selectedUf);
    } else {
      localStorage.removeItem('mednet_analytics_uf');
    }
  }, [selectedUf]);

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

  // Aplicar uma visão salva seta activeId + filtros juntos; sem este flag, o
  // efeito abaixo (que zera os filtros ao trocar de fonte manualmente)
  // apagaria os próprios filtros que a visão acabou de restaurar.
  const applyingViewRef = useRef(false);

  useEffect(() => {
    if (applyingViewRef.current) {
      applyingViewRef.current = false;
      return;
    }
    setSelectedCompany('');
    setSelectedClassification('all');
    setSelectedType('');
    setSelectedUf('');
    setActiveKpi(null);
  }, [activeId, compare]);

  const savedViewsStore = useSavedViews('mn_saved_views_analytics');

  const saveCurrentView = (name) => {
    savedViewsStore.saveView(name, {
      activeId, selectedMonth, startDate, endDate,
      selectedCompany, selectedSeverity, selectedClassification, selectedType, selectedUf,
    });
  };

  const applySavedView = (snapshot) => {
    // Só precisa pular o reset se a fonte (activeId) realmente vai mudar —
    // do contrário o efeito [activeId, compare] nem dispara e a flag ficaria
    // presa em true, atrapalhando a próxima troca manual de fonte.
    if ((snapshot.activeId ?? null) !== activeId) applyingViewRef.current = true;
    setActiveId(snapshot.activeId ?? null);
    setSelectedMonth(snapshot.selectedMonth ?? null);
    setStartDate(snapshot.startDate ?? '');
    setEndDate(snapshot.endDate ?? '');
    setSelectedCompany(snapshot.selectedCompany ?? '');
    setSelectedSeverity(snapshot.selectedSeverity ?? 'all');
    setSelectedClassification(snapshot.selectedClassification ?? 'all');
    setSelectedType(snapshot.selectedType ?? '');
    setSelectedUf(snapshot.selectedUf ?? '');
  };

  const loadFromDatabase = async (
    preferredPlatformId = null,
    isSilent = false,
    forceCountsRefresh = false,
  ) => {
    if (loadAbortRef.current) loadAbortRef.current.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;

    if (!isSilent) {
      setLoading(true);
    }
    try {
      const cachedCounts = platformCountsCacheRef.current;
      const cacheIsFresh = cachedCounts.loadedAt > 0
        && Date.now() - cachedCounts.loadedAt < 60_000;
      let counts = cachedCounts.data;

      if (forceCountsRefresh || !cacheIsFresh) {
        try {
          const res = await apiFetch('/api/platforms', { signal: controller.signal });
          if (!res.ok) throw new Error(`Falha ao obter contagem do servidor (${res.status})`);
          counts = await res.json();
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.warn('[MedNet] API de contagens indisponivel; tentando RPC agregada:', err);

          // Uma falha do backend antes abria oito HEADs paralelos na mesma VPS.
          // A RPC entrega o mesmo rollup em uma unica requisicao e respeita o
          // AbortController da carga atual.
          const { data: fallbackCounts, error: fallbackError } = await supabase
            .rpc('analytics_platform_counts')
            .abortSignal(controller.signal)
            .retry(false);
          if (fallbackError) {
            if (controller.signal.aborted) return;
            throw fallbackError;
          }
          counts = fallbackCounts && typeof fallbackCounts === 'object'
            ? fallbackCounts
            : {};
        }

        if (isStale()) return;
        platformCountsCacheRef.current = {
          data: counts,
          loadedAt: Date.now(),
        };
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
        uf: selectedUf,
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
      setAvailableUfs(data.availableUfs || []);

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
        const platformName = PLATFORMS.find(p => p.id === targetPlatformId)?.name || (targetPlatformId === 'auto' ? 'Automático' : targetPlatformId);
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
    selectedType,
    selectedUf
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
          platformName: platform ? platform.name : (pid === 'auto' ? 'Automático' : pid),
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
      selectedUf,
      toast
    });
  };

  const exportToHTML = () => {
    return exportHTMLUtil(d);
  };

  const onImportConfirm = async (files, platformId, platformName, mapping, operatorEmail) => {
    setSaving(true);
    try {
      toast('Enviando planilhas e iniciando processamento no servidor...', 'info');

      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file);
      }
      formData.append('platformId', platformId);
      formData.append('platformName', platformName);
      formData.append('mapping', JSON.stringify(mapping));
      formData.append('operatorEmail', operatorEmail);

      const response = await apiFetch('/api/analytics/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Erro no servidor (Código HTTP: ${response.status})`);
      }

      const resData = await response.json();
      const { uniqueSavedCount, dupsFiltered } = resData;

      setModalOpen(false);
      toast(
        `Importação concluída com sucesso! · ${platformName} · ${uniqueSavedCount.toLocaleString('pt-BR')} registros salvos no banco${dupsFiltered > 0 ? ` (${dupsFiltered.toLocaleString('pt-BR')} duplicados ignorados)` : ''}.`,
        'success'
      );

      await loadFromDatabase(platformId, false, true);
    } catch (err) {
      console.error('Erro ao realizar importação no backend:', err);
      const errMsg = err?.message || String(err);
      toast(`Falha na importação: ${errMsg}`, 'error');
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

    const confirmed = await confirm({
      title: 'Excluir registros',
      message: `Deseja realmente excluir todos os registros de "${targetSource.platformName}" do banco de dados? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir',
      danger: true
    });
    if (!confirmed) return;

    let deletedTotal = 0;
    try {
      setLoading(true);
      while (true) {
        const { data, error } = await supabase.rpc('delete_driver_events_platform_batch', {
          p_platform_id: targetSource.platformId,
          p_batch_size: 250,
        });

        if (error) throw error;

        const deleted = Number(data || 0);
        deletedTotal += deleted;
        if (deleted === 0) break;
      }

      toast(`${deletedTotal} registros de ${targetSource.platformName} foram excluídos.`, 'success');
      if (activeId === id) {
        setActiveId(null);
        localStorage.removeItem('mednet_analytics_active_id');
      }
      await loadFromDatabase(null, false, true);
    } catch (err) {
      console.error('Erro ao excluir registros:', err);
      const partialDeletion = deletedTotal > 0
        ? ` ${deletedTotal} registro(s) já foram excluídos; atualize a tela antes de tentar novamente.`
        : '';
      toast('Erro ao excluir registros do banco de dados: ' + (err.message || String(err)) + partialDeletion, 'error');
    } finally {
      setLoading(false);
    }
  };

  const promptSaveCurrentView = async () => {
    const name = await confirm({
      title: 'Salvar visão',
      message: 'Dê um nome para esta combinação de filtros. Você poderá recarregá-la depois com um clique.',
      confirmText: 'Salvar',
      input: { placeholder: 'Ex: Gravíssimos · Últimos 30 dias' },
    });
    if (!name) return;
    saveCurrentView(name);
    toast(`Visão "${name}" salva.`, 'success');
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
    availableUfs,
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
    selectedUf,
    setSelectedUf,
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
    savedViews: savedViewsStore.views,
    promptSaveCurrentView,
    applySavedView,
    removeSavedView: savedViewsStore.removeView,
  };
}
