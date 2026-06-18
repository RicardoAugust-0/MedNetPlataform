import { useState, useEffect, useMemo, useRef } from 'react';
import { PLATFORMS, aggregate } from '../utils/fatigueParser.js';
import { supabase } from '../supabase.js';
import { useToast } from '../hooks/useToast.jsx';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';
import '../styles/analytics.css';

// Subcomponents
import FadigaKPIs from './analytics/FadigaKPIs.jsx';
import ComparisonView from './analytics/ComparisonView.jsx';
import FadigaCharts from './analytics/FadigaCharts.jsx';
import ImportModal from './analytics/ImportModal.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';


export default function Analytics() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [platformCounts, setPlatformCounts] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);
  const [availableCompanies, setAvailableCompanies] = useState([]);

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
  const { resolveMonitorName } = useCarrierAliases();
  const [selectedCompany, setSelectedCompany] = useState('');

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
  }, [activeId, compare]);

  // Tick clock
  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('pt-BR', {
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

  const loadFromDatabase = async (preferredPlatformId = null) => {
    setLoading(true);
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
        setLoading(false);
        setActiveId(null);
        return;
      }

      let activeMonth = selectedMonth;

      if (compare && (!comparePlatformIds || comparePlatformIds.length === 0)) {
        setSources([]);
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

      const res = await fetch(url);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Erro no servidor de analytics');
      }

      const data = await res.json();
      
      setAvailableMonths(data.availableMonths || []);
      setAvailableCompanies(data.availableCompanies || []);

      const monthsList = data.availableMonths || [];
      if (monthsList.length > 0) {
        if (activeMonth === null || (activeMonth !== 'all' && activeMonth !== 'custom' && !monthsList.includes(activeMonth))) {
          // Default to latest month on initial load or if the active month is invalid
          setSelectedMonth(monthsList[0]);
        }
      }

      if (compare) {
        setSources(data.sources || []);
      } else {
        const platformName = PLATFORMS.find(p => p.id === targetPlatformId)?.name || targetPlatformId;
        const singleSource = {
          id: 'src-' + targetPlatformId,
          platformId: targetPlatformId,
          platformName,
          data: data.d,
          prevD: data.prevD
        };
        setSources([singleSource]);
      }

      const nextActiveId = targetPlatformId ? 'src-' + targetPlatformId : null;
      if (activeId !== nextActiveId) {
        setActiveId(nextActiveId);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do banco/servidor:', err);
      toast('Erro ao carregar dados: ' + (err.message || String(err)), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMonth === 'custom' && (!startDate || !endDate)) {
      let year, month;
      if (availableMonths.length > 0) {
        const [y, m] = availableMonths[0].split('-');
        year = parseInt(y);
        month = parseInt(m);
      } else {
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth() + 1;
      }
      const pad = (n) => String(n).padStart(2, '0');
      const start = `${year}-${pad(month)}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const end = `${year}-${pad(month)}-${pad(lastDay)}`;
      setStartDate(start);
      setEndDate(end);
    }
  }, [selectedMonth, availableMonths, startDate, endDate]);

  useEffect(() => {
    if (selectedMonth === 'custom') {
      if (startDate && endDate) {
        loadFromDatabase();
      }
    } else {
      loadFromDatabase();
    }
  }, [activeId, compare, comparePlatformIds, selectedMonth, startDate, endDate, selectedCompany, selectedSeverity]);

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

  const d = useMemo(() => {
    return activeSource ? activeSource.data : null;
  }, [activeSource]);

  const prevD = useMemo(() => {
    return activeSource ? activeSource.prevD : null;
  }, [activeSource]);

  const exportToCSV = () => {
    if (!activeSource) return;
    let url = `${API_URL}/api/analytics/csv?platformId=${activeSource.platformId}`;
    if (selectedMonth) url += `&month=${selectedMonth}`;
    if (selectedMonth === 'custom' && startDate && endDate) {
      url += `&startDate=${startDate}&endDate=${endDate}`;
    }
    if (selectedCompany) url += `&company=${encodeURIComponent(selectedCompany)}`;
    if (selectedSeverity) url += `&severity=${selectedSeverity}`;

    // Open download link directly in the browser
    window.location.href = url;
  };

  const onImportConfirm = async (rowsToInsert, platformId, platformName) => {
    setSaving(true);
    try {
      // Bulk upsert in chunks of 2500 for optimized performance
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

      // Clear cache on the backend to reflect imported data immediately
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
    const targetSource = processedSources.find((s) => s.id === id);
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
        
        {/* Header da Página */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Análise de Fadiga</h2>
            <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Consolidação multi-plataforma de alertas de fadiga e desatenção
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            
            {/* Seletor Dinâmico de Mês */}
            {activeId && (availableMonths.length > 0 || selectedMonth === 'custom') && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Filtrar Mês:</span>
                <select
                  value={selectedMonth || 'all'}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    background: 'var(--surface-0)',
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <option value="all">Todos os meses</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthKey(m)}
                    </option>
                  ))}
                  <option value="custom">Período Customizado...</option>
                </select>
              </div>
            )}

            {/* Seletor de Período Customizado */}
            {activeId && selectedMonth === 'custom' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginRight: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>De:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{
                      padding: '5px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      background: 'var(--surface-0)',
                      fontFamily: 'inherit',
                      outline: 'none'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Até:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{
                      padding: '5px 8px',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      background: 'var(--surface-0)',
                      fontFamily: 'inherit',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>
            )}

            {/* Seletor Dinâmico de Empresa */}
            {activeSource && availableCompanies.length > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Empresa:</span>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '12.5px',
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    background: 'var(--surface-0)',
                    cursor: 'pointer',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <option value="">Todas as empresas</option>
                  {availableCompanies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)', background: 'var(--surface-1)', border: '1px solid var(--border)', padding: '6px 11px', borderRadius: '99px' }}>
              <i className="ti ti-calendar" style={{ fontSize: '13px', color: 'var(--text-muted)' }}></i>
              {d && d.meta.periodo ? `${d.meta.periodo[0]} – ${d.meta.periodo[1]}` : 'Sem período definido'}
            </span>
            

            
            {sourcesList.length >= 2 && (
              <button
                onClick={handleCompareClick}
                className="btn btn-sm"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'inherit',
                  border: compare ? '1px solid #9E1A45' : '1px solid var(--border)',
                  background: compare ? 'rgba(158, 26, 69, 0.05)' : 'var(--surface-0)',
                  color: compare ? '#9E1A45' : 'var(--text-primary)',
                  fontWeight: 500,
                  borderRadius: '8px',
                  padding: '7px 12px',
                  cursor: 'pointer',
                }}
              >
                <i className="ti ti-arrows-diff" style={{ fontSize: '14px' }}></i> Comparar plataformas
              </button>
            )}
            
            {activeSource && (
              <button
                onClick={exportToCSV}
                className="btn btn-sm btn-ghost"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-0)',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <i className="ti ti-download" style={{ fontSize: '14px' }}></i> Exportar CSV
              </button>
            )}

            <button
              onClick={() => window.print()}
              className="btn btn-sm btn-ghost"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                border: '1px solid var(--border)',
                background: 'var(--surface-0)',
                color: 'var(--text-primary)',
                fontWeight: 500,
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-file-type-pdf" style={{ fontSize: '14px' }}></i> Exportar PDF
            </button>
            
            <button
              onClick={() => setModalOpen(true)}
              className="btn btn-sm btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 13px',
                fontWeight: 500,
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <i className="ti ti-upload" style={{ fontSize: '14px' }}></i> Importar planilha
            </button>
          </div>
        </div>

        {/* Chips de Fontes */}
        {sourcesList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <span style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', fontWeight: 600 }}>
              Fontes
            </span>
            {sourcesList.map((src) => (
              <div
                key={src.id}
                onClick={() => {
                  setCompare(false);
                  setActiveId(src.id);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '7px 10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: 'var(--surface-0)',
                  border: src.id === activeId && !compare ? '1px solid #9E1A45' : '1px solid var(--border)',
                  boxShadow: src.id === activeId && !compare ? '0 0 0 1px rgba(158,26,69,0.15)' : 'none',
                  transition: 'all .15s ease',
                }}
              >
                <i className="ti ti-table" style={{ fontSize: '14px', flexShrink: 0, color: '#9E1A45' }}></i>
                <div style={{ minWidth: 0, lineHeight: 1.25 }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{src.platformName}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                    {src.rows.toLocaleString('pt-BR')} reg.
                  </div>
                </div>
                <button
                  onClick={(e) => removeSource(src.id, e)}
                  title="Remover fonte"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '2px',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger-500, #E24B4A)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                >
                  <i className="ti ti-x" style={{ fontSize: '13px' }}></i>
                </button>
              </div>
            ))}
          </div>
        )}

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
        {compare && sources.length >= 2 ? (
          <ComparisonView
            sources={sources}
            selectedMonth={selectedMonth}
            formatMonthKey={formatMonthKey}
            selectedCompany={selectedCompany}
            selectedSeverity={selectedSeverity}
          />
        ) : (
          /* Gráficos Individuais */
          (activeId || compare) && (
            <FadigaCharts
              d={d}
              noData={noData}
              selectedMonth={selectedMonth}
              formatMonthKey={formatMonthKey}
              selectedSeverity={selectedSeverity}
              setSelectedSeverity={setSelectedSeverity}
            />
          )
        )}

        {/* Nota explicativa de rodapé */}
        <div style={{ marginTop: '24px', fontSize: '11.5px', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px', background: 'var(--surface-0)', lineHeight: '1.7' }}>
          <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Como ler. </b>
          Os indicadores são recalculados a cada importação e filtragem. Criticidades com grafias divergentes são unificadas em Gravíssimo / Grave / Médio; a classificação é normalizada em Positivo / Falso positivo / Não classificado. A UF é extraída do texto da localidade. Use <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Comparar plataformas</b> para confrontar duas ou mais fontes e <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Exportar PDF</b> para gerar o relatório completo para impressão.
        </div>

      </div>

      {/* MODAL DE IMPORTAÇÃO */}
      <ImportModal
        modalOpen={modalOpen}
        setModalOpen={setModalOpen}
        saving={saving}
        onImportConfirm={onImportConfirm}
      />

      {/* MODAL DE SELEÇÃO PARA COMPARAÇÃO */}
      {compareModalOpen && (
        <div data-noprint style={{ position: 'fixed', inset: 0, background: 'rgba(10,7,23,0.55)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="fz-in" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px 24px', width: '450px', maxWidth: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 40px rgba(15,25,35,0.14)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ti ti-arrows-diff" style={{ fontSize: '18px', color: '#9E1A45' }}></i> Selecionar plataformas para comparar
              </div>
              <button
                onClick={() => setCompareModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '18px', padding: '4px', display: 'flex' }}
              >
                <i className="ti ti-x"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Escolha pelo menos duas plataformas com dados importados para comparar seus volumes, criticidades e distribuições de alertas:
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sourcesList.map((src) => {
                  const pid = src.platformId;
                  const isChecked = tempSelected.includes(pid);
                  return (
                    <label
                      key={src.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isChecked ? 'rgba(158, 26, 69, 0.03)' : 'var(--surface-1)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTempCompare(pid)}
                          style={{
                            cursor: 'pointer',
                            accentColor: '#9E1A45',
                            width: '15px',
                            height: '15px'
                          }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                          {src.platformName}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {src.rows.toLocaleString('pt-BR')} reg.
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <button
                onClick={() => setCompareModalOpen(false)}
                className="btn btn-sm btn-ghost"
                style={{ borderRadius: '8px', padding: '8px 14px', fontSize: '12.5px', cursor: 'pointer', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmCompare}
                disabled={tempSelected.length < 2}
                className="btn btn-sm btn-primary"
                style={{
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  cursor: tempSelected.length >= 2 ? 'pointer' : 'not-allowed',
                  opacity: tempSelected.length >= 2 ? 1 : 0.6,
                  border: 'none',
                  background: '#9E1A45',
                  color: '#fff'
                }}
              >
                Comparar ({tempSelected.length})
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
