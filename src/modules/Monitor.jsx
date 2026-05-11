// deno-lint-ignore-file
import { useState, useEffect } from 'react';
import { useApp } from '../context';
import { useAuth } from '../auth/AuthContext';
import { useAtendimentos } from '../hooks/useAtendimentos';
import { useTemplates } from '../hooks/useTemplates';
import { useConfirm } from '../hooks/useConfirm';
import { parseSheetFile } from '../parseSheet';

// Monitor Subcomponents
import { EmptyState, applyTemplate } from './monitor/utils';
import DriverCard from './monitor/DriverCard';
import MonitorFilters from './monitor/MonitorFilters';
import UploadArea from './monitor/UploadArea';
import MonitorModals from './monitor/MonitorModals';
import HistoryTab from './monitor/HistoryTab';

/* ── Google Sheets via Supabase Edge Function ── */
async function postToSheets(payload, accessToken) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/append-sheet`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) console.warn('[Sheets]', data.error);
  } catch (e) {
    console.warn('[Sheets] falha ao registrar na planilha:', e.message);
  }
}

/* ── Push Notifications ── */
async function notificarCriticos(criticos) {
  if (!criticos.length || !('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return;
  new Notification(`⚠️ ${criticos.length} motorista${criticos.length > 1 ? 's' : ''} em intervenção`, {
    body: criticos.slice(0, 3).map(d => `${d.nome.split(' ')[0]} · ${d.alertas} evento${d.alertas > 1 ? 's' : ''}`).join('\n'),
    icon: '/favicon.ico',
    tag: 'alerta-intervencao',
  });
}

export default function Monitor() {
  const { drivers, setDrivers, filters, setFilters, setActivePanel } = useApp();
  const { profile, session } = useAuth();
  const { history, loading: histLoading, error: histError, registrar, loadByRange, loadDriverHistory, loadAtendimentosForFilter } = useAtendimentos();
  const { templates } = useTemplates();
  const confirm = useConfirm();

  const [templateModal, setTemplateModal] = useState(null);
  const [dossieDriver, setDossieDriver] = useState(null);
  const [dossieData, setDossieData] = useState([]);
  const [dossieLoading, setDossieLoading] = useState(false);

  useEffect(() => {
    if (!templateModal) return;
    const onKey = (e) => { if (e.key === 'Escape') setTemplateModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [templateModal]);

  const [activeTab,  setActiveTab]  = useState('intervencao');
  const [currentPage, setCurrentPage] = useState(1);
  useEffect(() => setCurrentPage(1), [activeTab]);
  const [statusMsg,  setStatusMsg]  = useState(drivers.length > 0 ? `${drivers.length} motoristas na fila (planilha anterior)` : 'Aguardando carga da planilha (.xlsx ou .csv)');
  const [statusKind, setStatusKind] = useState(drivers.length > 0 ? 'active' : 'idle');
  const [loadStats,  setLoadStats]  = useState(null);
  const [loading,    setLoading]    = useState(false);

  const [sheetLoadedAt, setSheetLoadedAt] = useState(() => localStorage.getItem('mn_sheet_loaded_at'));
  const [sheetAgeMin,   setSheetAgeMin]   = useState(() => {
    const ts = localStorage.getItem('mn_sheet_loaded_at');
    return ts ? Math.floor((Date.now() - new Date(ts)) / 60000) : null;
  });

  useEffect(() => {
    if (!sheetLoadedAt) return;
    const id = setInterval(() => {
      setSheetAgeMin(Math.floor((Date.now() - new Date(sheetLoadedAt)) / 60000));
    }, 60000);
    return () => clearInterval(id);
  }, [sheetLoadedAt]);

  /* ── Filtros fila ── */
  const filtered = drivers.filter(d => {
    const f = filters;
    if (f.turno && d.turno !== f.turno) return false;
    if (f.empresa && d.transportadora !== f.empresa) return false;
    if (f.comportamento) {
      const todos = [...(d.tipos || []), ...(d.tiposReportar || [])];
      if (!todos.some(t => t.includes(f.comportamento))) return false;
    }
    if (f.prioridade === 'gravissimo' && d.severidade !== 'Gravíssimo') return false;
    if (f.prioridade === 'grave'      && d.severidade !== 'Grave')      return false;
    if (f.prioridade === 'normal'     && d.severidade !== 'Normal')     return false;
    return true;
  });

  const intervencaoList = filtered.filter(d => d.alertas > 0).sort((a, b) => b.alertas - a.alertas);
  const reportarList    = filtered.filter(d => d.alertas === 0 && d.reportaveis > 0).sort((a, b) => b.reportaveis - a.reportaveis);
  const tecList         = filtered.filter(d => d.alertas === 0 && d.reportaveis === 0 && d.tecnicos > 0);
  const transps         = [...new Set(drivers.map(d => d.transportadora))].sort();

  /* ── Upload ── */
  const handleFile = async (file) => {
    setLoading(true); setStatusKind('idle'); setStatusMsg(`Processando ${file.name}…`);
    try {
      const filterHistory = await loadAtendimentosForFilter(90);
      const { drivers: newDrivers, stats } = await parseSheetFile(file, filterHistory);
      const loadedAt = new Date().toISOString();
      const timestamped = newDrivers.map(d => ({ ...d, _loadedAt: loadedAt }));
      setDrivers(timestamped);
      localStorage.setItem('mn_sheet_loaded_at', loadedAt);
      setSheetLoadedAt(loadedAt);
      setSheetAgeMin(0);
      setLoadStats(stats);
      setStatusKind('active');
      const filtroMsg = stats.filtradosPorHistorico > 0 ? ` · ${stats.filtradosPorHistorico} eventos pré-atendimento ignorados` : '';
      setStatusMsg(`${file.name} · ${stats.comIntervencao} para intervenção · ${stats.soReportar} para reportar · ${stats.falsosPositivos} falsos positivos removidos${filtroMsg}`);
      setActiveTab('intervencao');
      notificarCriticos(timestamped.filter(d => d.alertas >= 5));
    } catch (err) {
      setStatusKind('error');
      setStatusMsg(`Erro ao ler planilha: ${err.message}`);
    } finally { setLoading(false); }
  };

  const handleDrop = (e) => {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  /* ── Ações ── */
  const attend = async (d) => {
    if (!(await confirm({ title: 'Iniciar contato', message: `Iniciar contato com ${d.nome}?` }))) return;
    const obs = `${d.alertas} evento(s) de intervenção (${d.tipos.join(', ') || '—'})`;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'intervencao', obs });
    setDrivers(drivers.map(x => x === d ? { ...x, alertas: 0, tipos: [] } : x));
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const data = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
    const sev = d.severidade || 'Normal';
    const criticidade = sev === 'Gravíssimo' ? 'GRAVÍSSIMO' : sev === 'Grave' ? 'GRAVE' : 'MÉDIO';
    const classificacao = (sev === 'Gravíssimo' || sev === 'Grave') ? 'IMEDIATA' : 'PREVENTIVA';
    postToSheets({
      data,
      empresa:         d.transportadora || '',
      sistema:         'SASCAR',
      colaborador:     d.nome,
      placa:           d.placa || '',
      frota:           d.frota || '',
      criticidade,
      classificacao,
      motivo:          'FADIGA',
      solicitadoPor:   profile?.nome || '',
      horaSolicitacao: hora,
    }, session?.access_token);
  };

  const reportar = async (d) => {
    if (!(await confirm({ title: 'Registrar notificação', message: `Registrar notificação para a empresa: ${d.nome}?` }))) return;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'reportar', obs: `Reportado à transportadora · ${d.reportaveis} evento(s) (${d.tiposReportar.join(', ') || '—'})` });
    setDrivers(drivers.map(x => x === d ? { ...x, reportaveis: 0, tiposReportar: [] } : x));
  };

  const deleteAlert = async (d) => {
    if (!(await confirm({ title: 'Descartar alerta', message: `Descartar alerta de intervenção de ${d.nome}?`, danger: true }))) return;
    await registrar({ motorista: d.nome, placa: d.placa, transportadora: d.transportadora, tipo: 'descarte', obs: `Alerta descartado · ${d.alertas} evento(s) removidos` });
    setDrivers(drivers.map(x => x === d ? { ...x, alertas: 0, tipos: [] } : x));
  };

  const clearQueue = async () => {
    if (!(await confirm({ title: 'Limpar fila', message: 'Tem certeza que deseja limpar toda a fila de motoristas?', danger: true }))) return;
    setDrivers([]);
    setLoadStats(null);
    setStatusKind('idle');
    setStatusMsg('Fila limpa. Aguardando nova planilha.');
    localStorage.removeItem('mn_sheet_loaded_at');
    setSheetLoadedAt(null);
    setSheetAgeMin(null);
  };

  const resetFilters = () => setFilters({ empresa: '', comportamento: '', turno: '', prioridade: '' });

  const openDossie = async (nome) => {
    setDossieDriver(nome);
    setDossieLoading(true);
    const { data } = await loadDriverHistory(nome);
    setDossieData(data || []);
    setDossieLoading(false);
  };

  const openTemplate = (d) => {
    if (templates.length === 0) { setTemplateModal({ driver: d, templateId: null, text: null }); return; }
    let defaultTemplate = templates.find(t => t.tag === 'contato') || templates[0];
    const text = applyTemplate(defaultTemplate.text, d);
    setTemplateModal({ driver: d, templateId: defaultTemplate.id, text });
  };

  const handlers = { openDossie, openTemplate, attend, deleteAlert, reportar };

  const sheetAgeColor = sheetAgeMin === null ? null
    : sheetAgeMin < 30  ? 'var(--success-500, #22c55e)'
    : sheetAgeMin < 60  ? 'var(--warning-500)'
    : 'var(--danger-500)';

  const sheetAgeLabel = sheetAgeMin === null ? null
    : sheetAgeMin === 0 ? 'agora'
    : sheetAgeMin < 60  ? `${sheetAgeMin} min atrás`
    : `${Math.floor(sheetAgeMin / 60)}h${sheetAgeMin % 60 > 0 ? ` ${sheetAgeMin % 60}min` : ''} atrás`;

  // Pagination fila
  const pageSize = 10;
  const activeList = activeTab === 'intervencao' ? intervencaoList :
                     activeTab === 'reportar'    ? reportarList :
                     activeTab === 'tecnicos'    ? tecList : [];
                     
  const totalPages = activeTab !== 'historico' ? Math.ceil(activeList.length / pageSize) || 1 : 1;
  const paginate = (list) => list.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="monitor-grid">
      
      <UploadArea 
        statusKind={statusKind} statusMsg={statusMsg} loading={loading}
        sheetAgeMin={sheetAgeMin} sheetAgeColor={sheetAgeColor} sheetAgeLabel={sheetAgeLabel}
        clearQueue={clearQueue} handleDrop={handleDrop} handleFile={handleFile} loadStats={loadStats}
      />

      <MonitorFilters
        profile={profile} filters={filters} setFilters={setFilters}
        transps={transps} resetFilters={resetFilters}
      />

      {/* Tabs */}
      <div className="tabs">
        {[
          ['intervencao', 'ti-phone-call',  'Intervenção',       intervencaoList.length, 'var(--danger-500)'],
          ['reportar',    'ti-building',    'Reportar à empresa', reportarList.length,    'var(--warning-500)'],
          ['tecnicos',    'ti-camera-off',  'Só técnico',        tecList.length,          null],
          ['historico',   'ti-history',     'Histórico',         history.length,     null],
        ].map(([id, icon, lbl, cnt, color]) => (
          <div key={id} className={`tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
            <i className={`ti ${icon}`} style={color ? { color } : {}}></i> {lbl}
            <span className="tab-count">{cnt}</span>
          </div>
        ))}
      </div>

      {/* Tab: Intervenção */}
      {activeTab === 'intervencao' && (
        intervencaoList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum motorista requer intervenção" sub="Bocejo ou Olho fechado" />
          : <div className="driver-list">
              {paginate(intervencaoList).map(d => (
                <DriverCard key={d.placa} d={d} type="intervencao" handlers={handlers} />
              ))}
            </div>
      )}

      {/* Tab: Reportar */}
      {activeTab === 'reportar' && (
        reportarList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum motorista para reportar" sub="Distração, uso de celular" />
          : <div className="driver-list">
              {paginate(reportarList).map(d => (
                <DriverCard key={d.placa} d={d} type="reportar" handlers={handlers} />
              ))}
            </div>
      )}

      {/* Tab: Só técnico */}
      {activeTab === 'tecnicos' && (
        tecList.length === 0
          ? <EmptyState icon="ti-mood-smile" msg="Nenhum evento técnico isolado" />
          : <div className="driver-list">
              {paginate(tecList).map(d => (
                <DriverCard key={d.placa} d={d} type="tecnicos" handlers={handlers} />
              ))}
            </div>
      )}

      {/* Tab: Histórico */}
      {activeTab === 'historico' && (
        <HistoryTab 
          history={history} histLoading={histLoading} histError={histError}
          loadByRange={loadByRange} 
          currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize}
        />
      )}

      {/* Queue Pagination */}
      {activeTab !== 'historico' && totalPages > 1 && (
        <div className="pagination" style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
            <i className="ti ti-chevron-left"></i>
          </button>
          <span style={{ fontSize: 13, alignSelf: 'center', color: 'var(--text-muted)' }}>Página {currentPage} de {totalPages}</span>
          <button className="btn btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
            <i className="ti ti-chevron-right"></i>
          </button>
        </div>
      )}

      <MonitorModals 
        templateModal={templateModal} setTemplateModal={setTemplateModal}
        templates={templates} applyTemplate={applyTemplate} setActivePanel={setActivePanel}
        dossieDriver={dossieDriver} setDossieDriver={setDossieDriver}
        dossieLoading={dossieLoading} dossieData={dossieData}
      />

    </div>
  );
}
