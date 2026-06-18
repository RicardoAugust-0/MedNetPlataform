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

export default function Analytics() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [platformCounts, setPlatformCounts] = useState({});
  const [availableMonths, setAvailableMonths] = useState([]);

  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem('mednet_analytics_active_id') || null;
    } catch (e) {
      return null;
    }
  });

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

  // Group database events by platform_id and shape them as sources format
  const eventsToSources = (events) => {
    const groups = {};
    for (const ev of events) {
      const pid = ev.platform_id || 'auto';
      if (!groups[pid]) {
        groups[pid] = [];
      }
      groups[pid].push(ev);
    }

    return Object.keys(groups).map((pid) => {
      const platformName = PLATFORMS.find((p) => p.id === pid)?.name || pid;
      const groupEvents = groups[pid];

      const headers = [
        'datetime',
        'driver',
        'plate',
        'criticality',
        'type',
        'classification',
        'speed',
        'location',
        'fleet',
        'description'
      ];

      const mapping = {
        datetime: 'datetime',
        driver: 'driver',
        plate: 'plate',
        criticality: 'criticality',
        type: 'type',
        classification: 'classification',
        speed: 'speed',
        location: 'location',
        fleet: 'fleet',
        description: 'description'
      };

      const dataRows = groupEvents.map((ev) => [
        ev.ocorrido_em,
        ev.nome || '',
        ev.placa || '',
        ev.severidade || '',
        ev.nome_evento || '',
        ev.analise_ia_plataforma || '',
        ev.velocidade_kmh != null ? String(ev.velocidade_kmh) : '',
        ev.localidade || '',
        ev.frota || ev.transportadora || '',
        ev.descricao || ''
      ]);

      const aggregatedData = aggregate(headers, dataRows, mapping, null);

      return {
        id: 'src-' + pid,
        name: platformName,
        platformId: pid,
        platformName,
        rows: dataRows.length,
        headers,
        dataRows,
        mapping,
        data: aggregatedData
      };
    });
  };

  const loadFromDatabase = async (preferredPlatformId = null) => {
    setLoading(true);
    setLoadProgress(0);
    setTotalCount(0);
    try {
      // 1. Fetch exact total counts for all platforms in parallel
      const counts = {};
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
      setPlatformCounts(counts);

      // Determine active platform ID to load
      let targetPlatformId = preferredPlatformId;
      if (!targetPlatformId) {
        const savedActiveId = localStorage.getItem('mednet_analytics_active_id') || activeId;
        if (savedActiveId && counts[savedActiveId.replace('src-', '')] > 0) {
          targetPlatformId = savedActiveId.replace('src-', '');
        } else {
          // Find first platform with count > 0
          const firstAvailable = Object.keys(counts).find((pid) => counts[pid] > 0);
          targetPlatformId = firstAvailable || null;
        }
      }

      // If there are no platforms with records, clear and return
      if (!targetPlatformId && !compare) {
        setSources([]);
        setLoading(false);
        const nextActiveId = null;
        if (activeId !== nextActiveId) {
          setActiveId(nextActiveId);
        }
        return;
      }

      // 2. Fetch the latest date to generate available months list (last 12 months)
      let activeMonth = selectedMonth;
      if (targetPlatformId) {
        const { data: latestRecord, error: latestErr } = await supabase
          .from('driver_events')
          .select('ocorrido_em')
          .eq('platform_id', targetPlatformId)
          .order('ocorrido_em', { ascending: false })
          .limit(1);

        if (!latestErr && latestRecord && latestRecord.length > 0) {
          const latestDate = new Date(latestRecord[0].ocorrido_em);
          const monthsList = [];
          const currYear = latestDate.getFullYear();
          const currMonth = latestDate.getMonth();
          
          for (let i = 0; i < 12; i++) {
            const d = new Date(Date.UTC(currYear, currMonth - i, 1));
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            monthsList.push(`${y}-${m}`);
          }
          setAvailableMonths(monthsList);

          if (activeMonth === null || (activeMonth !== 'all' && activeMonth !== 'custom' && !monthsList.includes(activeMonth))) {
            // Default to latest month on initial load or if the active month is invalid
            activeMonth = monthsList[0];
            setSelectedMonth(monthsList[0]);
          }
        } else {
          setAvailableMonths([]);
        }
      }

      let allEvents = [];
      const limit = 1000; // Optimized: Fetch 1000 records per page (PostgREST server-side max-rows limit)

      // Calculate total records we are actually loading (scoped by activeMonth if set)
      let loadingTotal = 0;
      let startISO = null;
      let endISO = null;

      if (activeMonth === 'custom' && startDate && endDate) {
        startISO = new Date(startDate + 'T00:00:00.000Z').toISOString();
        endISO = new Date(endDate + 'T23:59:59.999Z').toISOString();
      } else if (activeMonth && activeMonth !== 'all' && activeMonth.indexOf('-') > -1) {
        const [y, m] = activeMonth.split('-');
        const year = parseInt(y);
        const month = parseInt(m);
        if (!isNaN(year) && !isNaN(month)) {
          // Query current month AND previous month (2 months total)
          startISO = new Date(Date.UTC(year, month - 2, 1)).toISOString();
          endISO = new Date(Date.UTC(year, month, 1)).toISOString();
        }
      }

      if (compare) {
        if (startISO && endISO) {
          const { count: monthCount, error: monthCountErr } = await supabase
            .from('driver_events')
            .select('*', { count: 'exact', head: true })
            .gte('ocorrido_em', startISO)
            .lt('ocorrido_em', endISO);

          if (!monthCountErr) {
            loadingTotal = monthCount || 0;
          }
        } else {
          loadingTotal = Object.values(counts).reduce((a, b) => a + b, 0);
        }
      } else {
        if (startISO && endISO) {
          const { count: monthCount, error: monthCountErr } = await supabase
            .from('driver_events')
            .select('*', { count: 'exact', head: true })
            .eq('platform_id', targetPlatformId)
            .gte('ocorrido_em', startISO)
            .lt('ocorrido_em', endISO);

          if (!monthCountErr) {
            loadingTotal = monthCount || 0;
          }
        } else {
          loadingTotal = counts[targetPlatformId] || 0;
        }
      }
      setTotalCount(loadingTotal);

      if (loadingTotal > 0) {
        const numPages = Math.ceil(loadingTotal / limit);
        console.log(`[MedNet] loadingTotal: ${loadingTotal}, numPages: ${numPages}, platform: ${targetPlatformId}, month: ${activeMonth}`);
        
        const fetchPage = async (pageIdx) => {
          const pageFrom = pageIdx * limit;
          const pageTo = pageFrom + limit - 1;
          
          let query = supabase
            .from('driver_events')
            .select('platform_id,placa,nome,severidade,nome_evento,analise_ia_plataforma,velocidade_kmh,localidade,frota,transportadora,ocorrido_em,descricao')
            .order('ocorrido_em', { ascending: false });

          if (!compare && targetPlatformId) {
            query = query.eq('platform_id', targetPlatformId);
          }

          if (startISO && endISO) {
            query = query.gte('ocorrido_em', startISO).lt('ocorrido_em', endISO);
          }

          const { data, error } = await query.range(pageFrom, pageTo);
          if (error) throw error;
          return data || [];
        };

        // Query pages in batches of 10 parallel connections to maximize speed while preventing DB pool exhaustion
        const BATCH_SIZE = 10;
        for (let i = 0; i < numPages; i += BATCH_SIZE) {
          const batchPromises = [];
          for (let j = i; j < Math.min(i + BATCH_SIZE, numPages); j++) {
            batchPromises.push(fetchPage(j));
          }
          const results = await Promise.all(batchPromises);
          for (const res of results) {
            allEvents.push(...res);
          }
          setLoadProgress(allEvents.length);
        }
      }

      const nextSources = eventsToSources(allEvents);
      setSources(nextSources);

      const nextActiveId = targetPlatformId ? 'src-' + targetPlatformId : null;
      if (activeId !== nextActiveId) {
        setActiveId(nextActiveId);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do banco:', err);
      toast('Erro ao carregar banco: ' + (err.message || String(err)), 'error');
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
  }, [activeId, compare, selectedMonth, startDate, endDate]);

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

  // Process loaded sources to resolve raw fleet names to clean carrier/company names
  const processedSources = useMemo(() => {
    return sources.map(src => ({
      ...src,
      dataRows: src.dataRows.map(row => {
        const copy = [...row];
        // Resolve raw fleet name (row[8]) to clean company name
        copy[8] = resolveMonitorName(row[8]) || 'Não informado';
        return copy;
      })
    }));
  }, [sources, resolveMonitorName]);

  // Compute active source and its aggregated data reactively
  const activeSource = useMemo(() => {
    return processedSources.find((s) => s.id === activeId) || null;
  }, [processedSources, activeId]);

  // Calculate unique clean companies present in the active data
  const availableCompanies = useMemo(() => {
    const set = new Set();
    const targets = compare ? processedSources : (activeSource ? [activeSource] : []);
    targets.forEach(src => {
      src.dataRows.forEach(row => {
        if (row[8] && row[8] !== 'Não informado') {
          set.add(row[8]);
        }
      });
    });
    return Array.from(set).sort();
  }, [processedSources, activeSource, compare]);

  const d = useMemo(() => {
    if (!activeSource) return null;
    let filteredRows = activeSource.dataRows;
    if (selectedCompany) {
      filteredRows = filteredRows.filter(row => row[8] === selectedCompany);
    }
    if (selectedSeverity && selectedSeverity !== 'all') {
      if (selectedSeverity === 'high') {
        filteredRows = filteredRows.filter(row => row[3] === 'Grave' || row[3] === 'Gravíssimo');
      } else if (selectedSeverity === 'medium') {
        filteredRows = filteredRows.filter(row => row[3] === 'Médio');
      } else {
        filteredRows = filteredRows.filter(row => row[3] === selectedSeverity);
      }
    }
    return aggregate(
      activeSource.headers,
      filteredRows,
      activeSource.mapping,
      selectedMonth === 'all' || selectedMonth === 'custom' ? null : selectedMonth
    );
  }, [activeSource, selectedMonth, selectedCompany, selectedSeverity]);

  const prevD = useMemo(() => {
    if (!activeSource || !selectedMonth || selectedMonth === 'all' || selectedMonth === 'custom' || selectedMonth.indexOf('-') === -1) return null;
    
    const [y, m] = selectedMonth.split('-');
    const year = parseInt(y);
    const month = parseInt(m);
    const prevDate = new Date(Date.UTC(year, month - 2, 1));
    const py = prevDate.getUTCFullYear();
    const pm = String(prevDate.getUTCMonth() + 1).padStart(2, '0');
    const prevMonthKey = `${py}-${pm}`;

    let filteredRows = activeSource.dataRows;
    if (selectedCompany) {
      filteredRows = filteredRows.filter(row => row[8] === selectedCompany);
    }
    if (selectedSeverity && selectedSeverity !== 'all') {
      if (selectedSeverity === 'high') {
        filteredRows = filteredRows.filter(row => row[3] === 'Grave' || row[3] === 'Gravíssimo');
      } else if (selectedSeverity === 'medium') {
        filteredRows = filteredRows.filter(row => row[3] === 'Médio');
      } else {
        filteredRows = filteredRows.filter(row => row[3] === selectedSeverity);
      }
    }
    return aggregate(
      activeSource.headers,
      filteredRows,
      activeSource.mapping,
      prevMonthKey
    );
  }, [activeSource, selectedMonth, selectedCompany, selectedSeverity]);

  const exportToCSV = () => {
    if (!activeSource) return;
    let rowsToExport = activeSource.dataRows;
    
    if (selectedMonth && selectedMonth !== 'all' && selectedMonth !== 'custom' && selectedMonth.indexOf('-') > -1) {
      rowsToExport = rowsToExport.filter(row => {
        const dt = new Date(row[0]);
        if (isNaN(dt.getTime())) return false;
        const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
        return mk === selectedMonth;
      });
    }

    if (selectedCompany) {
      rowsToExport = rowsToExport.filter(row => row[8] === selectedCompany);
    }
    if (selectedSeverity && selectedSeverity !== 'all') {
      if (selectedSeverity === 'high') {
        rowsToExport = rowsToExport.filter(row => row[3] === 'Grave' || row[3] === 'Gravíssimo');
      } else if (selectedSeverity === 'medium') {
        rowsToExport = rowsToExport.filter(row => row[3] === 'Médio');
      } else {
        rowsToExport = rowsToExport.filter(row => row[3] === selectedSeverity);
      }
    }
    if (!rowsToExport.length) {
      toast('Nenhum dado disponível para exportar com os filtros atuais.', 'warning');
      return;
    }
    const headers = ['Data/Hora', 'Motorista', 'Placa', 'Severidade', 'Evento', 'Classificação', 'Velocidade (km/h)', 'Localidade', 'Frota/Empresa'];
    const csvEscape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(';') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const lines = rowsToExport.map(row => row.map(csvEscape).join(';'));
    const csvContent = '\uFEFF' + [headers.join(';'), ...lines].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_fadiga_${activeSource.platformId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Relatório CSV exportado com sucesso!', 'success');
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
                onClick={() => setCompare(!compare)}
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

        {/* KPIs Row */}
        <FadigaKPIs d={d} prevD={prevD} />

        {/* Comparação */}
        {compare && sources.length >= 2 ? (
          <ComparisonView
            sources={processedSources}
            selectedMonth={selectedMonth}
            formatMonthKey={formatMonthKey}
            selectedCompany={selectedCompany}
            selectedSeverity={selectedSeverity}
          />
        ) : (
          /* Gráficos Individuais */
          <FadigaCharts
            d={d}
            noData={noData}
            selectedMonth={selectedMonth}
            formatMonthKey={formatMonthKey}
            selectedSeverity={selectedSeverity}
            setSelectedSeverity={setSelectedSeverity}
          />
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
    </div>
  );
}
