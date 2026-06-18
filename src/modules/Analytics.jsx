import { useState, useEffect, useMemo, useRef } from 'react';
import { PLATFORMS } from '../utils/fatigueParser.js';
import { supabase } from '../supabase.js';
import { useToast } from '../hooks/useToast.jsx';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';
import '../styles/analytics.css';

// Subcomponents
import FadigaKPIs from './analytics/FadigaKPIs.jsx';
import ComparisonView from './analytics/ComparisonView.jsx';
import FadigaCharts from './analytics/FadigaCharts.jsx';
import ImportModal from './analytics/ImportModal.jsx';

// Modular components
import AnalyticsHeader from './analytics/components/AnalyticsHeader.jsx';
import SourceChips from './analytics/components/SourceChips.jsx';
import ComparisonModal from './analytics/components/ComparisonModal.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Analytics() {
  const [sources, setSources] = useState([]);
  const [d, setD] = useState(null);
  const [prevD, setPrevD] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [platformCounts, setPlatformCounts] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [availableTypes, setAvailableTypes] = useState([]);

  const [activeId, setActiveId] = useState(null);

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
  const [clock, setClock] = useState('');
  const toast = useToast();
  const lastLoadedRef = useRef({
    activeId: null,
    compare: false,
    comparePlatformIds: [],
    selectedMonth: null,
    startDate: '',
    endDate: ''
  });
  const { resolveMonitorName } = useCarrierAliases();
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedClassification, setSelectedClassification] = useState('all');
  const [selectedType, setSelectedType] = useState('');

  useEffect(() => {
    localStorage.setItem('mednet_analytics_severity', selectedSeverity);
  }, [selectedSeverity]);

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
  }, [activeId, compare]);

  // Tick clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadFromDatabase = async (preferredPlatformId = null, isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    setLoadProgress(0);
    setTotalCount(0);
    try {
      // 1. Fetch platform counts from backend
      let counts = {};
      try {
        const res = await fetch(`${API_URL}/api/platforms`);
        if (res.ok) {
          counts = await res.json();
        } else {
          throw new Error('Falha ao obter contagem do servidor');
        }
      } catch (err) {
        console.warn('[MedNet] Fallback para Supabase local para contagem:', err);
        // Fallback to client-side Supabase query
        const promises = PLATFORMS.map(async (p) => {
          const { count, error } = await supabase
            .from('driver_events')
            .select('*', { count: 'exact', head: true })
            .eq('platform_id', p.id);
          if (!error && count !== null) {
            counts[p.id] = count;
          }
        });
        await Promise.all(promises);
      }
      setPlatformCounts(counts);

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

      if (compare && (!comparePlatformIds || comparePlatformIds.length === 0)) {
        setSources([]);
        setD(null);
        setPrevD(null);
        setLoading(false);
        return;
      }

      // Load analytics from backend Express server
      let url = `${API_URL}/api/analytics?`;
      if (compare) {
        url += `compare=true&platformIds=${comparePlatformIds.join(',')}`;
      } else {
        url += `platformId=${targetPlatformId}`;
      }

      if (activeMonth) url += `&month=${activeMonth}`;
      if (activeMonth === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      if (selectedCompany) url += `&company=${encodeURIComponent(selectedCompany)}`;
      if (selectedSeverity) url += `&severity=${selectedSeverity}`;
      if (selectedClassification && selectedClassification !== 'all') url += `&classification=${selectedClassification}`;
      if (selectedType) url += `&eventType=${encodeURIComponent(selectedType)}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro no servidor de analytics');
      }

      const data = await res.json();
      
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
      console.error('[MedNet] Erro ao carregar analíticos:', err);
      toast('Não foi possível carregar os dados de analytics: ' + (err.message || String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Read saved active_id if present
    const saved = localStorage.getItem('mednet_analytics_active_id');
    if (saved && !activeId && !compare) {
      setActiveId(saved);
      loadFromDatabase(saved.replace('src-', ''), false);
    } else {
      loadFromDatabase(null, false);
    }
  }, []);

  // Update dates automatically when selecting a dynamic month
  useEffect(() => {
    if (selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom') {
      const [year, month] = selectedMonth.split('-').map(Number);
      const start = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const pad = (n) => String(n).padStart(2, '0');
      const end = `${year}-${pad(month)}-${pad(lastDay)}`;
      setStartDate(start);
      setEndDate(end);
    }
  }, [selectedMonth, availableMonths, startDate, endDate]);

  useEffect(() => {
    const last = lastLoadedRef.current;
    const platformChanged = last.activeId !== activeId || 
                           last.compare !== compare || 
                           JSON.stringify(last.comparePlatformIds) !== JSON.stringify(comparePlatformIds) ||
                           last.selectedMonth !== selectedMonth ||
                           last.startDate !== startDate ||
                           last.endDate !== endDate;
    
    lastLoadedRef.current = { activeId, compare, comparePlatformIds, selectedMonth, startDate, endDate };

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
    selectedMonth,
    startDate,
    endDate,
    selectedCompany,
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

  const exportToCSV = () => {
    if (!activeSource) return;
    let url = `${API_URL}/api/analytics/csv?platformId=${activeSource.platformId}`;
    if (selectedMonth) url += `&month=${selectedMonth}`;
    if (selectedMonth === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    if (selectedCompany) url += `&company=${encodeURIComponent(selectedCompany)}`;
    if (selectedSeverity) url += `&severity=${selectedSeverity}`;
    if (selectedClassification && selectedClassification !== 'all') url += `&classification=${selectedClassification}`;
    if (selectedType) url += `&eventType=${encodeURIComponent(selectedType)}`;

    window.location.href = url;
  };

  const onImportConfirm = async (rowsToInsert, platformId, platformName) => {
    setSaving(true);
    try {
      const CHUNK_SIZE = 2500;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
        const { error: upsertError } = await supabase
          .from('driver_events')
          .upsert(chunk, {
            onConflict: 'platform_id,placa,ocorrido_em,nome_evento',
            ignoreDuplicates: true,
          });

        if (upsertError) throw upsertError;
      }

      try {
        await fetch(`${API_URL}/api/clear-cache`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platformId }),
        });
      } catch (cacheErr) {
        console.warn('[MedNet] Falha ao limpar cache no backend:', cacheErr);
      }

      setModalOpen(false);
      toast(
        `Planilha processada · ${platformName} · ${rowsToInsert.length.toLocaleString(
          'pt-BR'
        )} registros salvos.`,
        'success'
      );

      await loadFromDatabase(platformId);
    } catch (err) {
      console.error('Erro ao salvar no banco:', err);
      toast('Erro ao salvar no banco de dados: ' + (err.message || String(err)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCompareClick = () => {
    if (compare) {
      setCompare(false);
      setComparePlatformIds([]);
      const firstAvailable = sourcesList[0]?.id || null;
      setActiveId(firstAvailable);
    } else {
      const initialSelected = activeId ? [activeId.replace('src-', '')] : [];
      setTempSelected(initialSelected);
      setCompareModalOpen(true);
    }
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

  const handleConfirmCompare = () => {
    if (tempSelected.length < 2) {
      toast('Por favor, selecione pelo menos duas plataformas para comparar.', 'warning');
      return;
    }
    setComparePlatformIds(tempSelected);
    setCompare(true);
    setCompareModalOpen(false);
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
          <span style={{ fontSize: '13.5px', fontWeight: 500 }}>Carregando dados da plataforma...</span>
          {totalCount > 0 && (
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {loadProgress.toLocaleString('pt-BR')} de {totalCount.toLocaleString('pt-BR')} registros carregados
            </span>
          )}
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
          setModalOpen={setModalOpen}
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
        {(activeId || compare) && <FadigaKPIs d={d} prevD={prevD} />}

        {/* Comparação */}
        {compare && sources.length >= 2 && (
          <ComparisonView
            sources={sources}
            selectedMonth={selectedMonth}
            formatMonthKey={formatMonthKey}
            selectedCompany={selectedCompany}
            setSelectedCompany={setSelectedCompany}
            availableCompanies={availableCompanies}
            selectedSeverity={selectedSeverity}
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
          Os indicadores são recalculados a cada importação e filtragem. Criticidades com grafias divergentes são unificadas em Gravíssimo / Grave / Médio; a classificação é normalizada em Positivo / Falso positivo / Não classificado. A UF é extraída do texto da localidade. Use <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Comparar plataformas</b> para confrontar duas ou mais fontes e <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Exportar PDF</b> para gerar o relatório completo para impressão.
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
          tempSelected={tempSelected}
          handleToggleTempCompare={handleToggleTempCompare}
          handleConfirmCompare={handleConfirmCompare}
          setCompareModalOpen={setCompareModalOpen}
        />
      )}
    </div>
  );
}
