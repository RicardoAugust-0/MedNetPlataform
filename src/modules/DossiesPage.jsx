// deno-lint-ignore-file
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured, getFunctionErrorMessage } from '../supabase.js';
import { useToast } from '../hooks/useToast.jsx';
import { useApp } from '../context.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAtendimentos } from '../hooks/useAtendimentos.js';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';

// Converte markdown simples em HTML
function renderMarkdown(md) {
  if (!md) return '';
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\//g, '<strong>$1</strong>') // Handle bold *
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/^- (.+)$/gm,  '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = html.replace(/(<li>.*?<\/li>(?:<br>)?)+/gs, m => '<ul>' + m.replace(/<br>/g, '') + '</ul>');
  return '<p>' + html + '</p>';
}

let cachedDriversList = null;

export default function DossiesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, session } = useAuth();
  const { theme } = useApp();
  const { resolveMonitorName } = useCarrierAliases();
  const { history: atendimentosHistory } = useAtendimentos();

  const initialDriverName = searchParams.get('driver') || '';

  // Lista de motoristas e busca
  const [searchQuery, setSearchQuery] = useState('');
  const [driversList, setDriversList] = useState(() => cachedDriversList || []);
  const [loadingList, setLoadingList] = useState(() => !cachedDriversList);

  // Motorista selecionado
  const [selectedDriver, setSelectedDriver] = useState(null);

  // Ficha clínica / Dados de saúde
  const [healthData, setHealthData] = useState({
    escala_epworth: 0,
    polissonografia: '',
    historico_clinico: '',
    ultimo_exame_em: '',
    placa: '',
    transportadora: '',
    frota: '',
    turno: 'diurno',
  });
  const [savingHealth, setSavingHealth] = useState(false);
  const [editingHealth, setEditingHealth] = useState(false);

  // Histórico de fadiga e atendimentos do motorista selecionado
  const [telemetryEvents, setTelemetryEvents] = useState([]);
  const [telemetryTotal, setTelemetryTotal] = useState(0);
  const [atendimentosList, setAtendimentosList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Geração de Laudo Clínico IA
  const [generatingReport, setGeneratingReport] = useState(false);
  const [aiReport, setAiReport] = useState(null);
  const [aiCfg, setAiCfg] = useState({ provider: 'anthropic', model: 'claude-sonnet-4-6' });

  // Carrega configurações de IA da plataforma ao iniciar
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.from('app_settings').select('value').eq('key', 'ai_config').maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return;
        const cfg = data.value;
        const p = cfg.provider || 'anthropic';
        const m = p === 'google' ? (cfg.google_model || 'gemini-2.5-flash') : (cfg.anthropic_model || 'claude-sonnet-4-6');
        setAiCfg({ provider: p, model: m });
      });
  }, []);

  // Busca lista de motoristas únicos cadastrados nas tabelas do Supabase (roda apenas na montagem)
  useEffect(() => {
    if (cachedDriversList) return;

    async function loadDrivers() {
      if (!isSupabaseConfigured) {
        setLoadingList(false);
        return;
      }
      try {
        setLoadingList(true);

        // 1. Puxa prontuários já cadastrados (contendo possíveis edições manuais)
        const { data: healthList } = await supabase
          .from('driver_health')
          .select('motorista_nome, placa, transportadora, frota, turno');

        // 2. Puxa motoristas de driver_events
        const { data: eventsData } = await supabase
          .from('driver_events')
          .select('nome, placa, transportadora, frota, turno')
          .not('nome', 'is', null);

        // 3. Puxa motoristas de atendimentos do cache local (ou fallback se vazio)
        const atendData = atendimentosHistory.length > 0
          ? atendimentosHistory
          : (await supabase.from('atendimentos').select('motorista, placa, transportadora')).data || [];

        // Consolida e remove duplicados
        const map = new Map();

        // Insere prontuários do driver_health primeiro (dados prioritários)
        if (healthList) {
          healthList.forEach(r => {
            const key = String(r.motorista_nome).trim().toUpperCase();
            if (key) {
              map.set(key, {
                nome: r.motorista_nome,
                placa: r.placa || '',
                transportadora: r.transportadora || '—',
                frota: r.frota || '',
                turno: r.turno || 'diurno',
                isEdited: true, // flag de prioridade
              });
            }
          });
        }

        // Adiciona dados do driver_events
        if (eventsData) {
          eventsData.forEach(r => {
            const key = String(r.nome).trim().toUpperCase();
            if (key) {
              const existing = map.get(key);
              if (!existing) {
                map.set(key, {
                  nome: r.nome,
                  placa: r.placa || '',
                  transportadora: r.transportadora || '—',
                  frota: r.frota || '',
                  turno: r.turno || 'diurno',
                });
              } else if (!existing.isEdited) {
                // Se ainda não editado no prontuário, complementa dados vazios
                if (r.placa && !existing.placa) existing.placa = r.placa;
                if (r.transportadora && existing.transportadora === '—') existing.transportadora = r.transportadora;
                if (r.frota && !existing.frota) existing.frota = r.frota;
              }
            }
          });
        }

        // Adiciona dados do atendimentos
        if (atendData) {
          atendData.forEach(r => {
            const key = String(r.motorista).trim().toUpperCase();
            if (key) {
              const existing = map.get(key);
              if (!existing) {
                map.set(key, {
                  nome: r.motorista,
                  placa: r.placa || '',
                  transportadora: r.transportadora || '—',
                  frota: '',
                  turno: 'diurno',
                });
              } else if (!existing.isEdited) {
                if (r.placa && !existing.placa) existing.placa = r.placa;
                if (r.transportadora && existing.transportadora === '—') existing.transportadora = r.transportadora;
              }
            }
          });
        }

        const consolidated = Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
        setDriversList(consolidated);
      } catch (err) {
        console.warn('Erro ao carregar lista de motoristas:', err);
      } finally {
        setLoadingList(false);
      }
    }
    loadDrivers();
  }, [atendimentosHistory]); // Dependência atualizada

  // Mantém o cache atualizado
  useEffect(() => {
    if (driversList.length > 0) {
      cachedDriversList = driversList;
    }
  }, [driversList]);

  // Seleciona o motorista com base no initialDriverName ou na lista carregada (decupado de loadDrivers)
  useEffect(() => {
    if (loadingList) return;
    if (initialDriverName) {
      const match = driversList.find(d => d.nome.toLowerCase() === initialDriverName.toLowerCase());
      if (match) {
        setSelectedDriver(match);
      } else if (driversList.length > 0) {
        // Cria motorista temporário se veio parametrizado mas não está na listagem
        setSelectedDriver({ nome: initialDriverName, placa: '', transportadora: '—', frota: '', turno: 'diurno' });
      }
    } else if (driversList.length > 0) {
      setSelectedDriver(driversList[0]);
    }
  }, [driversList, initialDriverName, loadingList]);

  // Carrega prontuário, telemetria e atendimentos do motorista selecionado
  useEffect(() => {
    if (!selectedDriver) return;
    
    async function loadDriverDossier() {
      setLoadingHistory(true);
      setEditingHealth(false);
      setAiReport(null);

      // Reset
      setHealthData({
        escala_epworth: 0,
        polissonografia: '',
        historico_clinico: '',
        ultimo_exame_em: '',
        placa: selectedDriver.placa || '',
        transportadora: selectedDriver.transportadora || '',
        frota: selectedDriver.frota || '',
        turno: selectedDriver.turno || 'diurno',
      });
      setTelemetryEvents([]);
      setTelemetryTotal(0);
      setAtendimentosList([]);

      if (!isSupabaseConfigured) {
        setLoadingHistory(false);
        return;
      }

      try {
        const name = selectedDriver.nome;
        const placa = selectedDriver.placa;

        // 1. Busca prontuário clínico
        const { data: healthRecord } = await supabase
          .from('driver_health')
          .select('*')
          .eq('motorista_nome', name)
          .maybeSingle();

        if (healthRecord) {
          setHealthData({
            escala_epworth: healthRecord.escala_epworth ?? 0,
            polissonografia: healthRecord.polissonografia ?? '',
            historico_clinico: healthRecord.historico_clinico ?? '',
            ultimo_exame_em: healthRecord.ultimo_exame_em ?? '',
            placa: healthRecord.placa ?? selectedDriver.placa ?? '',
            transportadora: healthRecord.transportadora ?? selectedDriver.transportadora ?? '',
            frota: healthRecord.frota ?? selectedDriver.frota ?? '',
            turno: healthRecord.turno ?? selectedDriver.turno ?? 'diurno',
          });
        }

        // 2. Busca eventos de telemetria — count real + primeiros 200 para exibição
        const buildTeleFilter = (q) => placa
          ? q.or(`placa.eq.${placa},nome.eq.${name}`)
          : q.eq('nome', name);

        const [{ count: teleCount }, { data: teleData }] = await Promise.all([
          buildTeleFilter(supabase.from('driver_events').select('*', { count: 'exact', head: true })),
          buildTeleFilter(supabase.from('driver_events').select('*'))
            .order('ocorrido_em', { ascending: false })
            .limit(200),
        ]);

        if (teleData) setTelemetryEvents(teleData);
        setTelemetryTotal(teleCount ?? teleData?.length ?? 0);

        // 3. Busca atendimentos anteriores
        let atendQuery = supabase.from('atendimentos').select('*');
        if (placa) {
          atendQuery = atendQuery.or(`placa.eq.${placa},motorista.eq.${name}`);
        } else {
          atendQuery = atendQuery.eq('motorista', name);
        }

        const { data: atendData } = await atendQuery
          .order('created_at', { ascending: false })
          .limit(100);

        if (atendData) setAtendimentosList(atendData);

      } catch (err) {
        console.warn('Erro ao carregar prontuário do motorista:', err);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadDriverDossier();
  }, [selectedDriver]);

  // Salva alterações da ficha médica no Supabase
  const handleSaveHealth = async (e) => {
    e.preventDefault();
    if (!selectedDriver) return;
    setSavingHealth(true);

    try {
      const payload = {
        motorista_nome: selectedDriver.nome,
        escala_epworth: Number(healthData.escala_epworth),
        polissonografia: healthData.polissonografia || null,
        historico_clinico: healthData.historico_clinico || null,
        ultimo_exame_em: healthData.ultimo_exame_em || null,
        placa: healthData.placa || null,
        transportadora: healthData.transportadora || null,
        frota: healthData.frota || null,
        turno: healthData.turno || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('driver_health')
        .upsert(payload, { onConflict: 'motorista_nome' });

      if (error) throw error;

      toast('Dados clínicos de saúde salvos com sucesso!', 'success');
      setEditingHealth(false);

      // Atualiza o motorista selecionado e a lista na memória para refletir imediatamente!
      setSelectedDriver(prev => ({
        ...prev,
        placa: payload.placa || '',
        transportadora: payload.transportadora || '—',
        frota: payload.frota || '',
        turno: payload.turno || 'diurno',
      }));
      setDriversList(prev => prev.map(d => d.nome.toUpperCase() === selectedDriver.nome.toUpperCase() ? {
        ...d,
        placa: payload.placa || '',
        transportadora: payload.transportadora || '—',
        frota: payload.frota || '',
        turno: payload.turno || 'diurno',
      } : d));
    } catch (err) {
      toast('Erro ao salvar prontuário: ' + err.message, 'error');
    } finally {
      setSavingHealth(false);
    }
  };

  // Aciona a geração do Laudo de IA
  const handleGenerateAIReport = async () => {
    if (!selectedDriver) return;
    setGeneratingReport(true);
    setAiReport(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const { data, error } = await supabase.functions.invoke('generate-dossier-report', {
        body: {
          motorista: selectedDriver.nome,
          placa: selectedDriver.placa,
          clinicalData: healthData,
          provider: aiCfg.provider,
          model: aiCfg.model,
        },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        const errMsg = await getFunctionErrorMessage(error);
        throw new Error(errMsg);
      }
      if (data?.error) throw new Error(data.error);

      setAiReport(data.report);
      toast('Laudo de Inteligência Artificial gerado!', 'success');
    } catch (err) {
      toast('Erro ao gerar laudo de IA: ' + err.message, 'error');
    } finally {
      setGeneratingReport(false);
    }
  };

  // Filtragem local da lista de motoristas do sidebar
  const filteredDrivers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return driversList;
    return driversList.filter(d => 
      d.nome.toLowerCase().includes(q) || 
      d.placa.toLowerCase().includes(q) ||
      d.transportadora.toLowerCase().includes(q)
    );
  }, [driversList, searchQuery]);

  // Agrupamento de estatísticas rápidas do motorista ativo
  const stats = useMemo(() => {
    const total = telemetryTotal;
    const critical = telemetryEvents.filter(e => e.severidade === 'Gravíssimo' || e.severidade === 'Grave').length;
    const yawning = telemetryEvents.filter(e => String(e.nome_evento).toLowerCase().includes('bocejo')).length;
    return { total, critical, yawning };
  }, [telemetryEvents, telemetryTotal]);

  const severityColor = (sev) => {
    const s = String(sev).toLowerCase();
    if (s.includes('graviss') || s === 'grave') return 'var(--danger-500)';
    return 'var(--text-muted)';
  };

  const getEpworthWarning = (score) => {
    if (score >= 16) return { text: 'Sonolência Crítica / Grave', class: 'danger' };
    if (score >= 10) return { text: 'Sonolência Moderada / Atenção', class: 'warning' };
    return { text: 'Sonolência Normal', class: 'success' };
  };

  const epworthWarning = getEpworthWarning(healthData.escala_epworth);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 20 }}>
      {/* Painel Esquerdo: Busca e Lista de Motoristas */}
      <div className="card" style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <div className="card-title" style={{ fontSize: 14 }}>
            <i className="ti ti-users-group"></i> Motoristas
          </div>
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <input
            className="form-control"
            placeholder="Buscar por nome ou placa..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontSize: 12.5 }}
          />
        </div>
        
        {loadingList ? (
          <div className="empty-state" style={{ flex: 1 }}><i className="ti ti-loader-2 ti-spin"></i></div>
        ) : filteredDrivers.length === 0 ? (
          <div className="empty-state" style={{ flex: 1, fontSize: 12 }}>Nenhum motorista cadastrado.</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filteredDrivers.map(d => (
              <div
                key={d.nome + d.placa}
                onClick={() => {
                  setSelectedDriver(d);
                  setSearchParams({ driver: d.nome });
                }}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.03))',
                  cursor: 'pointer',
                  background: selectedDriver?.nome === d.nome ? 'var(--surface-1, rgba(255,255,255,0.05))' : 'transparent',
                  borderLeft: selectedDriver?.nome === d.nome ? '3px solid var(--accent-500)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  if (selectedDriver?.nome !== d.nome) e.currentTarget.style.background = 'var(--surface-05, rgba(255,255,255,0.02))';
                }}
                onMouseLeave={e => {
                  if (selectedDriver?.nome !== d.nome) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 12.5, color: selectedDriver?.nome === d.nome ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.nome}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>{d.placa || 'Sem placa'}</span>
                  <span>{resolveMonitorName(d.transportadora)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Painel Direito: Dossiê e IA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 16 }}>
        {selectedDriver ? (
          <>
            {/* Header Motorista */}
            <div className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="ti ti-steering-wheel" style={{ color: 'var(--accent-500)' }}></i>
                    {selectedDriver.nome}
                  </h2>
                  <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)', fontSize: 12, marginTop: 6, flexWrap: 'wrap' }}>
                    <span><strong style={{ color: 'var(--text-primary)' }}>Placa:</strong> {selectedDriver.placa || '—'}</span>
                    <span>·</span>
                    <span><strong style={{ color: 'var(--text-primary)' }}>Transportadora:</strong> {resolveMonitorName(selectedDriver.transportadora)}</span>
                    {selectedDriver.frota && (
                      <>
                        <span>·</span>
                        <span><strong style={{ color: 'var(--text-primary)' }}>Frota:</strong> {selectedDriver.frota}</span>
                      </>
                    )}
                    <span>·</span>
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>Turno:</strong> 
                      <i className={`ti ti-${selectedDriver.turno === 'diurno' ? 'sun' : 'moon'}`} style={{ marginLeft: 4, marginRight: 2, color: selectedDriver.turno === 'diurno' ? 'var(--warning-500)' : 'var(--accent-300)' }}></i>
                      {selectedDriver.turno === 'diurno' ? 'Diurno' : 'Noturno'}
                    </span>
                  </div>
                </div>
                
                {/* KPIs Rápidos */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ textAlign: 'center', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', minWidth: 90 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.total}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>Alertas Totais</div>
                  </div>
                  <div style={{ textAlign: 'center', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', minWidth: 90 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: stats.critical > 0 ? 'var(--danger-500)' : 'var(--text-primary)' }}>{stats.critical}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>Críticos</div>
                  </div>
                  <div style={{ textAlign: 'center', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', minWidth: 90 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.yawning}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 2 }}>Bocejos</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Layout dos cards de Prontuário e Histórico */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Card de Ficha de Saúde (Dados Clínicos) */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="card-title">
                    <i className="ti ti-activity" style={{ color: 'var(--accent-500)' }}></i> Ficha Clínica & Dados de Saúde
                  </div>
                  {!editingHealth && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditingHealth(true)}>
                      <i className="ti ti-edit"></i> Editar Ficha
                    </button>
                  )}
                </div>
                
                <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {editingHealth ? (
                    <form onSubmit={handleSaveHealth} style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                          <label className="form-label">Epworth (Sonolência)</label>
                          <input
                            type="number"
                            min="0"
                            max="24"
                            className="form-control"
                            value={healthData.escala_epworth}
                            onChange={e => setHealthData(prev => ({ ...prev, escala_epworth: Number(e.target.value) }))}
                            required
                          />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>Valor de 0 a 24</span>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Data Último Exame</label>
                          <input
                            type="date"
                            className="form-control"
                            value={healthData.ultimo_exame_em}
                            onChange={e => setHealthData(prev => ({ ...prev, ultimo_exame_em: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Polissonografia (Apneia)</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Ex: Apneia Obstrutiva do Sono Moderada..."
                          value={healthData.polissonografia}
                          onChange={e => setHealthData(prev => ({ ...prev, polissonografia: e.target.value }))}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Histórico Clínico & Medicação</label>
                        <textarea
                          className="form-control"
                          placeholder="Fadiga crônica, hipertensão, faz uso de medicação reguladora, queixa de sono insatisfatório..."
                          value={healthData.historico_clinico}
                          onChange={e => setHealthData(prev => ({ ...prev, historico_clinico: e.target.value }))}
                          style={{ minHeight: 90, height: '100%' }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                          <label className="form-label">Placa</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.placa}
                            onChange={e => setHealthData(prev => ({ ...prev, placa: e.target.value }))}
                            placeholder="Placa do veículo"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Transportadora</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.transportadora}
                            onChange={e => setHealthData(prev => ({ ...prev, transportadora: e.target.value }))}
                            placeholder="Nome da transportadora"
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                          <label className="form-label">Frota</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.frota}
                            onChange={e => setHealthData(prev => ({ ...prev, frota: e.target.value }))}
                            placeholder="Identificação da frota"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Turno predominante</label>
                          <select
                            className="form-control"
                            value={healthData.turno}
                            onChange={e => setHealthData(prev => ({ ...prev, turno: e.target.value }))}
                          >
                            <option value="diurno">Diurno</option>
                            <option value="noturno">Noturno</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                        <button type="button" className="btn btn-ghost" onClick={() => setEditingHealth(false)} disabled={savingHealth}>Cancelar</button>
                        <button type="submit" className="btn btn-primary" disabled={savingHealth}>
                          {savingHealth ? <><i className="ti ti-loader-2 ti-spin"></i> Salvando...</> : <><i className="ti ti-device-floppy"></i> Salvar</>}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Escala Epworth</span>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {healthData.escala_epworth} pts
                            <span className={`badge badge-${epworthWarning.class}`} style={{ fontSize: 9.5 }}>{epworthWarning.text}</span>
                          </div>
                        </div>
                        <div style={{ background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Última Revisão Clínica</span>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 8 }}>
                            {healthData.ultimo_exame_em ? new Date(healthData.ultimo_exame_em).toLocaleDateString('pt-BR') : 'Sem registro'}
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Polissonografia / Apneia</span>
                        <div style={{ fontSize: 13, color: healthData.polissonografia ? 'var(--text-primary)' : 'var(--text-muted)', background: 'var(--surface-0)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8 }}>
                          {healthData.polissonografia || 'Nenhum exame cadastrado no prontuário.'}
                        </div>
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Histórico Clínico e Sintomas</span>
                        <div style={{ fontSize: 13, color: healthData.historico_clinico ? 'var(--text-primary)' : 'var(--text-muted)', background: 'var(--surface-0)', border: '1px solid var(--border)', padding: '10px 12px', borderRadius: 8, minHeight: 90, whiteSpace: 'pre-wrap' }}>
                          {healthData.historico_clinico || 'Sem anotações de sintomas ou medicamentos.'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Histórico Operacional de Contatos */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 400 }}>
                <div className="card-header">
                  <div className="card-title">
                    <i className="ti ti-history" style={{ color: 'var(--accent-500)' }}></i> Atendimentos & Ações Realizadas
                  </div>
                </div>
                
                <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
                  {loadingHistory ? (
                    <div className="empty-state" style={{ height: '100%' }}><i className="ti ti-loader-2 ti-spin"></i></div>
                  ) : atendimentosList.length === 0 ? (
                    <div className="empty-state" style={{ height: '100%', fontSize: 12 }}>Nenhum contato operacional registrado para este motorista.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {atendimentosList.map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: 10, borderLeft: `2px solid var(--${item.tipo === 'intervencao' ? 'danger' : item.tipo === 'reportar' ? 'warning' : 'border-md'})`, paddingLeft: 10, paddingBottom: 4 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                              <span>
                                <span className={`badge badge-${item.tipo === 'intervencao' ? 'danger' : item.tipo === 'reportar' ? 'warning' : 'info'}`} style={{ marginRight: 6, fontSize: 8.5 }}>{item.tipo.toUpperCase()}</span>
                                {item.obs}
                              </span>
                              <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 400 }}>
                                {new Date(item.created_at).toLocaleDateString('pt-BR')} {item.hora}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              Operador: {item.operador_nome || item.operador || '—'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Laudo Clínico / Relatório Integrado */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title">
                  <i className="ti ti-sparkles" style={{ color: 'var(--accent-500)' }}></i> Laudo Integrado de Perfil por IA (Fadiga + Saúde)
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleGenerateAIReport}
                  disabled={generatingReport}
                >
                  {generatingReport ? (
                    <><i className="ti ti-loader-2 ti-spin"></i> Analisando...</>
                  ) : (
                    <><i className="ti ti-sparkles"></i> Analisar com I.A</>
                  )}
                </button>
              </div>
              
              <div style={{ padding: 20 }}>
                {generatingReport ? (
                  <div className="empty-state" style={{ minHeight: 200 }}>
                    <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 24, marginBottom: 8 }}></i>
                    Cruzar histórico de {stats.total} alertas de fadiga com exames médicos...
                  </div>
                ) : aiReport ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                      <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(aiReport); toast('Laudo copiado!', 'success'); }}>
                        <i className="ti ti-copy"></i> Copiar Laudo
                      </button>
                    </div>
                    <div
                      className="report-body"
                      style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', background: 'var(--surface-0)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(aiReport) }}
                    />
                  </div>
                ) : (
                  <div className="empty-state" style={{ minHeight: 180, fontSize: 12.5 }}>
                    <i className="ti ti-sparkles" style={{ fontSize: 32, marginBottom: 8, color: 'var(--text-muted)' }}></i>
                    Clique no botão acima para consolidar os alertas de fadiga do condutor e o prontuário de exames médicos em uma análise de perfil clínico-operacional.
                  </div>
                )}
              </div>
            </div>

            {/* Linha do tempo dos alertas brutos de fadiga (telemetria) */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="card-title">
                  <i className="ti ti-activity-heartbeat" style={{ color: 'var(--accent-500)' }}></i> Histórico de Telemetria (Eventos Brutos de Fadiga)
                </div>
                {telemetryTotal > telemetryEvents.length && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Exibindo {telemetryEvents.length} de {telemetryTotal} eventos
                  </span>
                )}
              </div>
              
              <div style={{ padding: 16, maxHeight: 400, overflowY: 'auto' }}>
                {loadingHistory ? (
                  <div className="empty-state" style={{ height: 150 }}><i className="ti ti-loader-2 ti-spin"></i></div>
                ) : telemetryEvents.length === 0 ? (
                  <div className="empty-state" style={{ height: 150, fontSize: 12 }}>Nenhum evento registrado no histórico permanente para este veículo/placa.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: 8 }}>Evento</th>
                        <th style={{ padding: 8 }}>Severidade</th>
                        <th style={{ padding: 8 }}>Plataforma</th>
                        <th style={{ padding: 8 }}>Velocidade</th>
                        <th style={{ padding: 8 }}>Turno</th>
                        <th style={{ padding: 8 }}>Data/Hora Ocorrido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {telemetryEvents.map(e => (
                        <tr key={e.id} style={{ borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.02))' }}>
                          <td style={{ padding: 8, fontWeight: 600, color: 'var(--text-primary)' }}>{e.nome_evento}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ color: severityColor(e.severidade), fontWeight: 600 }}>{e.severidade || 'Normal'}</span>
                          </td>
                          <td style={{ padding: 8, textTransform: 'capitalize' }}>{e.platform_id}</td>
                          <td style={{ padding: 8 }}>{e.velocidade_kmh != null ? `${e.velocidade_kmh} km/h` : '—'}</td>
                          <td style={{ padding: 8, textTransform: 'capitalize' }}>{e.turno || 'Diurno'}</td>
                          <td style={{ padding: 8, fontFamily: 'var(--font-mono)' }}>
                            {new Date(e.ocorrido_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card empty-state" style={{ flex: 1 }}>
            <i className="ti ti-steering-wheel" style={{ fontSize: 48, color: 'var(--text-muted)' }}></i>
            Selecione um motorista na lista ao lado para carregar o seu prontuário clínico e histórico de fadiga.
          </div>
        )}
      </div>
    </div>
  );
}
