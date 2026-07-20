// deno-lint-ignore-file
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { supabase, isSupabaseConfigured, getFunctionErrorMessage } from '../supabase.js';
import { useToast } from '../hooks/useToast.jsx';
import { useConfirm } from '../hooks/useConfirm.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Modal from '../components/Modal.jsx';
import { useCarrierAliases } from '../hooks/useCarrierAliases.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { uploadDriverDocument, getDriverDocumentUrl, removeDriverDocument } from '../lib/uploadDriverDocument.js';
import {
  getDossierDriver,
  listDossierDrivers,
  normalizeDossierName,
  normalizeDossierPlate,
  saveDossierDriverHealth,
} from '../lib/dossierService.js';

const DOC_TYPES = [
  { id: 'cnh',             label: 'CNH',             icon: 'ti-id-badge-2' },
  { id: 'aso',              label: 'ASO',             icon: 'ti-stethoscope' },
  { id: 'polissonografia',  label: 'Polissonografia', icon: 'ti-moon' },
];
const DOC_STATUS = {
  pendente:   { label: 'Aguardando processamento', class: '' },
  processado: { label: 'Processado por IA',        class: 'info' },
  revisado:   { label: 'Revisado e aplicado',       class: 'success' },
  erro:       { label: 'Erro no processamento',     class: 'danger' },
};

// Campos extraídos por tipo de documento — usados no modal de revisão e no mapeamento para driver_health.
const REVIEW_FIELDS = {
  cnh: [
    { key: 'nome',             label: 'Nome (conferência)', type: 'text', readOnly: true },
    { key: 'cpf',              label: 'CPF',                type: 'text' },
    { key: 'rg',               label: 'RG',                 type: 'text' },
    { key: 'data_nascimento',  label: 'Data de Nascimento', type: 'date' },
    { key: 'cnh_numero',       label: 'CNH Número',         type: 'text' },
    { key: 'cnh_categoria',    label: 'CNH Categoria',      type: 'text' },
    { key: 'cnh_validade',     label: 'CNH Validade',       type: 'date' },
  ],
  aso: [
    { key: 'data_exame',   label: 'Data do Exame', type: 'date' },
    { key: 'aptidao',      label: 'Aptidão',        type: 'text' },
    { key: 'observacoes',  label: 'Observações',    type: 'textarea' },
  ],
  polissonografia: [
    { key: 'diagnostico',              label: 'Diagnóstico',                       type: 'text' },
    { key: 'indice_apneia_hipopneia',  label: 'Índice Apneia-Hipopneia (IAH)',      type: 'text' },
    { key: 'gravidade',                label: 'Gravidade',                          type: 'text' },
  ],
};

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
const DRIVER_DOCUMENT_COLUMNS = 'id, driver_health_id, motorista_nome, placa, tipo_documento, file_name, storage_path, status, extracted_data, error_message, created_at, reviewed_by, reviewed_at';

export default function DossiesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { profile } = useAuth();
  const canManageClinical = profile?.role === 'admin' || profile?.role === 'lider';
  const [searchParams, setSearchParams] = useSearchParams();
  const { tab = 'clinico' } = useParams();
  const navigate = useNavigate();
  const { resolveMonitorName } = useCarrierAliases();

  const initialDriverName = searchParams.get('driver') || '';
  const initialDriverPlate = searchParams.get('plate') || '';
  const initialDriverId = searchParams.get('driverId') || '';

  // Lista de motoristas e busca
  const [searchQuery, setSearchQuery] = useState('');
  const [driversList, setDriversList] = useState(() => cachedDriversList || []);
  const [loadingList, setLoadingList] = useState(() => !cachedDriversList);

  // Motorista selecionado
  const [selectedDriver, setSelectedDriver] = useState(null);

  // Ficha clínica / Dados de saúde / Dados cadastrais
  const [healthData, setHealthData] = useState({
    escala_epworth: 0,
    polissonografia: '',
    historico_clinico: '',
    ultimo_exame_em: '',
    placa: '',
    transportadora: '',
    frota: '',
    turno: 'diurno',
    cpf: '',
    rg: '',
    data_nascimento: '',
    cnh_numero: '',
    cnh_categoria: '',
    cnh_validade: '',
  });
  const [savingHealth, setSavingHealth] = useState(false);
  const [editingHealth, setEditingHealth] = useState(false);

  // Histórico de fadiga e atendimentos do motorista selecionado
  const [telemetryEvents, setTelemetryEvents] = useState([]);
  const [telemetryTotal, setTelemetryTotal] = useState(0);
  const [atendimentosList, setAtendimentosList] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Documentos do motorista (upload + OCR/IA)
  const [documents, setDocuments] = useState([]);
  const [uploadingType, setUploadingType] = useState(null);
  const [dragOverType, setDragOverType] = useState(null);
  const [processingDocId, setProcessingDocId] = useState(null);
  const [reviewingDoc, setReviewingDoc] = useState(null);
  const [reviewFields, setReviewFields] = useState({});
  const [applyingReview, setApplyingReview] = useState(false);

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

  // O banco consolida as fontes e devolve apenas identidades únicas. A tela não
  // baixa mais driver_events/atendimentos brutos para deduplicar no navegador.
  useEffect(() => {
    if (cachedDriversList) return;

    async function loadDrivers() {
      if (!isSupabaseConfigured) {
        setLoadingList(false);
        return;
      }
      try {
        setLoadingList(true);
        setDriversList(await listDossierDrivers({ limit: 500 }));
      } catch (err) {
        console.warn('Erro ao carregar lista de motoristas:', err);
      } finally {
        setLoadingList(false);
      }
    }
    loadDrivers();
  }, []);

  // Mantém o cache atualizado
  useEffect(() => {
    if (driversList.length > 0) {
      cachedDriversList = driversList;
    }
  }, [driversList]);

  // URLs novas carregam UUID ou nome + placa. Links legados contendo apenas o
  // nome só são aceitos quando esse nome identifica exatamente uma pessoa.
  useEffect(() => {
    if (loadingList) return;
    if (initialDriverId || initialDriverName) {
      let match = initialDriverId
        ? driversList.find(d => d.healthId === initialDriverId)
        : null;

      if (!match && initialDriverName) {
        const nameMatches = driversList.filter(
          d => normalizeDossierName(d.nome) === normalizeDossierName(initialDriverName),
        );
        match = initialDriverPlate
          ? nameMatches.find(d => normalizeDossierPlate(d.placa) === normalizeDossierPlate(initialDriverPlate))
          : (nameMatches.length === 1 ? nameMatches[0] : null);
      }

      if (match) {
        setSelectedDriver(match);
      } else {
        setSelectedDriver(null);
      }
    } else if (driversList.length > 0) {
      setSelectedDriver(driversList[0]);
    }
  }, [driversList, initialDriverId, initialDriverName, initialDriverPlate, loadingList]);

  // Carrega prontuário, telemetria e atendimentos do motorista selecionado
  useEffect(() => {
    if (!selectedDriver) return;
    let cancelled = false;
    
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
        cpf: '',
        rg: '',
        data_nascimento: '',
        cnh_numero: '',
        cnh_categoria: '',
        cnh_validade: '',
      });
      setTelemetryEvents([]);
      setTelemetryTotal(0);
      setAtendimentosList([]);
      setDocuments([]);

      if (!isSupabaseConfigured) {
        setLoadingHistory(false);
        return;
      }

      try {
        const dossier = await getDossierDriver(selectedDriver);
        if (cancelled) return;
        const healthRecord = dossier?.health;

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
            cpf: healthRecord.cpf ?? '',
            rg: healthRecord.rg ?? '',
            data_nascimento: healthRecord.data_nascimento ?? '',
            cnh_numero: healthRecord.cnh_numero ?? '',
            cnh_categoria: healthRecord.cnh_categoria ?? '',
            cnh_validade: healthRecord.cnh_validade ?? '',
          });
        }
        setTelemetryEvents(dossier?.telemetry_events || []);
        setTelemetryTotal(dossier?.telemetry_total || 0);
        setAtendimentosList(dossier?.atendimentos || []);
        setDocuments(dossier?.documents || []);
      } catch (err) {
        if (!cancelled) console.warn('Erro ao carregar prontuário do motorista:', err);
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    }

    loadDriverDossier();
    return () => {
      cancelled = true;
    };
  }, [selectedDriver]);

  // Salva alterações da ficha médica no Supabase
  const handleSaveHealth = async (e) => {
    e.preventDefault();
    if (!selectedDriver || !canManageClinical) return;
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
        cpf: healthData.cpf || null,
        rg: healthData.rg || null,
        data_nascimento: healthData.data_nascimento || null,
        cnh_numero: healthData.cnh_numero || null,
        cnh_categoria: healthData.cnh_categoria || null,
        cnh_validade: healthData.cnh_validade || null,
        updated_at: new Date().toISOString(),
      };

      const savedHealth = await saveDossierDriverHealth(selectedDriver, payload);

      toast('Dados clínicos de saúde salvos com sucesso!', 'success');
      setEditingHealth(false);

      const updatedDriver = {
        ...selectedDriver,
        healthId: savedHealth.id,
        identityKey: `health:${savedHealth.id}`,
        hasHealthRecord: true,
        placa: payload.placa || '',
        transportadora: payload.transportadora || '—',
        frota: payload.frota || '',
        turno: payload.turno || 'diurno',
      };

      setSelectedDriver(updatedDriver);
      setDriversList(prev => prev.map(d => d.identityKey === selectedDriver.identityKey ? updatedDriver : d));
      setSearchParams({
        driver: updatedDriver.nome,
        plate: updatedDriver.placa,
        driverId: updatedDriver.healthId,
      });
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
          driver_health_id: selectedDriver.healthId,
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

  // Upload de documento do motorista (CNH/ASO/Polissonografia) — OCR/IA chega na próxima etapa
  const handleUploadDocument = async (tipoDocumento, file) => {
    if (!selectedDriver || !file || !canManageClinical) return;
    setUploadingType(tipoDocumento);
    try {
      const doc = await uploadDriverDocument(file, {
        driverHealthId: selectedDriver.healthId,
        motorista: selectedDriver.nome,
        placa: selectedDriver.placa,
        tipoDocumento,
      });
      setDocuments(prev => [doc, ...prev]);
      toast('Documento enviado com sucesso!', 'success');
    } catch (err) {
      toast('Erro ao enviar documento: ' + err.message, 'error');
    } finally {
      setUploadingType(null);
    }
  };

  const handleViewDocument = async (doc) => {
    try {
      const url = await getDriverDocumentUrl(doc.storage_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast('Erro ao abrir documento: ' + err.message, 'error');
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!canManageClinical) return;
    if (!(await confirm({ title: 'Excluir documento', message: `Excluir "${doc.file_name}"?`, danger: true }))) return;
    try {
      await removeDriverDocument(doc);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast('Documento excluído.', 'success');
    } catch (err) {
      toast('Erro ao excluir documento: ' + err.message, 'error');
    }
  };

  // Envia o documento pro OCR (Mistral) + extração estruturada por IA; abre revisão ao final
  const handleProcessDocument = async (doc) => {
    if (!canManageClinical) return;
    setProcessingDocId(doc.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('process-driver-document', {
        body: { document_id: doc.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });

      if (error) {
        const errMsg = await getFunctionErrorMessage(error);
        throw new Error(errMsg);
      }
      if (data?.error) throw new Error(data.error);

      const updatedDoc = data.document;
      setDocuments(prev => prev.map(d => d.id === updatedDoc.id ? updatedDoc : d));
      setReviewFields(updatedDoc.extracted_data || {});
      setReviewingDoc(updatedDoc);
      toast('Documento processado! Revise os dados antes de aplicar.', 'success');
    } catch (err) {
      toast('Erro ao processar documento: ' + err.message, 'error');
      const { data: freshDoc } = await supabase.from('driver_documents').select(DRIVER_DOCUMENT_COLUMNS).eq('id', doc.id).maybeSingle();
      if (freshDoc) setDocuments(prev => prev.map(d => d.id === doc.id ? freshDoc : d));
    } finally {
      setProcessingDocId(null);
    }
  };

  const openReview = (doc) => {
    if (!canManageClinical) return;
    setReviewFields(doc.extracted_data || {});
    setReviewingDoc(doc);
  };

  // Grava os campos revisados na ficha do motorista (driver_health) e marca o documento como revisado
  const handleApplyReview = async () => {
    if (!reviewingDoc || !selectedDriver || !canManageClinical) return;
    setApplyingReview(true);
    try {
      let healthPatch = {};
      if (reviewingDoc.tipo_documento === 'cnh') {
        healthPatch = {
          cpf: reviewFields.cpf || null,
          rg: reviewFields.rg || null,
          data_nascimento: reviewFields.data_nascimento || null,
          cnh_numero: reviewFields.cnh_numero || null,
          cnh_categoria: reviewFields.cnh_categoria || null,
          cnh_validade: reviewFields.cnh_validade || null,
        };
      } else if (reviewingDoc.tipo_documento === 'aso') {
        const dataExameFmt = reviewFields.data_exame ? new Date(reviewFields.data_exame).toLocaleDateString('pt-BR') : null;
        const summary = `ASO${dataExameFmt ? ` (${dataExameFmt})` : ''}: ${reviewFields.aptidao || 'Sem resultado informado'}${reviewFields.observacoes ? ' — ' + reviewFields.observacoes : ''}`;
        healthPatch = {
          ultimo_exame_em: reviewFields.data_exame || null,
          historico_clinico: [summary, healthData.historico_clinico].filter(Boolean).join('\n'),
        };
      } else if (reviewingDoc.tipo_documento === 'polissonografia') {
        healthPatch = {
          polissonografia: [
            reviewFields.diagnostico,
            reviewFields.indice_apneia_hipopneia ? `IAH: ${reviewFields.indice_apneia_hipopneia}` : null,
            reviewFields.gravidade,
          ].filter(Boolean).join(' — '),
        };
      }

      const savedHealth = await saveDossierDriverHealth(selectedDriver, {
        motorista_nome: selectedDriver.nome,
        placa: healthData.placa || selectedDriver.placa || null,
        ...healthPatch,
        updated_at: new Date().toISOString(),
      });

      const { error: docErr } = await supabase.from('driver_documents').update({
        driver_health_id: savedHealth.id,
        status: 'revisado',
        reviewed_by: profile?.id || null,
        reviewed_at: new Date().toISOString(),
      }).eq('id', reviewingDoc.id);
      if (docErr) throw docErr;

      const previousIdentityKey = selectedDriver.identityKey;
      const updatedDriver = {
        ...selectedDriver,
        healthId: savedHealth.id,
        identityKey: `health:${savedHealth.id}`,
        hasHealthRecord: true,
      };
      setSelectedDriver(updatedDriver);
      setDriversList(prev => prev.map(d => d.identityKey === previousIdentityKey ? updatedDriver : d));
      setSearchParams({
        driver: updatedDriver.nome,
        plate: updatedDriver.placa,
        driverId: updatedDriver.healthId,
      });
      setHealthData(prev => ({ ...prev, ...healthPatch }));
      setDocuments(prev => prev.map(d => d.id === reviewingDoc.id ? {
        ...d,
        driver_health_id: savedHealth.id,
        status: 'revisado',
      } : d));
      toast('Dados aplicados na ficha do motorista!', 'success');
      setReviewingDoc(null);
    } catch (err) {
      toast('Erro ao aplicar dados na ficha: ' + err.message, 'error');
    } finally {
      setApplyingReview(false);
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

  // Linha do tempo única: alertas de telemetria + ações/tratativas, intercalados por data
  const combinedHistory = useMemo(() => {
    const events = telemetryEvents.map(e => ({
      kind: 'evento',
      id: `ev-${e.id}`,
      ts: e.ocorrido_em,
      severidade: e.severidade,
      label: e.nome_evento,
      meta: [e.platform_id, e.velocidade_kmh != null ? `${e.velocidade_kmh} km/h` : null].filter(Boolean).join(' · '),
    }));
    const actions = atendimentosList.map(a => ({
      kind: 'atendimento',
      id: `at-${a.id}`,
      ts: a.created_at,
      tipo: a.tipo,
      label: a.obs,
      meta: `Operador: ${a.operador_nome || a.operador || '—'}`,
    }));
    return [...events, ...actions].sort((x, y) => new Date(y.ts) - new Date(x.ts));
  }, [telemetryEvents, atendimentosList]);

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

  const getCnhWarning = (validade) => {
    if (!validade) return null;
    const days = Math.ceil((new Date(validade) - new Date()) / 86400000);
    if (days < 0) return { text: 'CNH Vencida', class: 'danger' };
    if (days <= 30) return { text: `CNH vence em ${days}d`, class: 'warning' };
    return null;
  };

  const epworthWarning = getEpworthWarning(healthData.escala_epworth);
  const cnhWarning = getCnhWarning(healthData.cnh_validade);

  return (
    <>
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', gap: 20 }}>
      {/* Painel Esquerdo: Busca e Lista de Motoristas */}
      <div className="card" style={{ width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <div className="card-title" style={{ fontSize: 14 }}>
            <i className="ti ti-users-group"></i> Motoristas
          </div>
        </div>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <div className="search-wrap">
            <i className="ti ti-search"></i>
            <input
              placeholder="Buscar por nome ou placa..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {loadingList ? (
          <div className="empty-state" style={{ flex: 1 }}><i className="ti ti-loader-2 ti-spin"></i></div>
        ) : filteredDrivers.length === 0 ? (
          <EmptyState msg="Nenhum motorista cadastrado." style={{ flex: 1, fontSize: 12 }} />
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filteredDrivers.map(d => (
              <div
                key={d.identityKey}
                onClick={() => {
                  setSelectedDriver(d);
                  const nextParams = { driver: d.nome, plate: d.placa };
                  if (d.healthId) nextParams.driverId = d.healthId;
                  setSearchParams(nextParams);
                }}
                style={{
                  padding: '7px 12px',
                  borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.03))',
                  cursor: 'pointer',
                  background: selectedDriver?.identityKey === d.identityKey ? 'var(--surface-1, rgba(255,255,255,0.05))' : 'transparent',
                  borderLeft: selectedDriver?.identityKey === d.identityKey ? '3px solid var(--accent-500)' : '3px solid transparent',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  if (selectedDriver?.identityKey !== d.identityKey) e.currentTarget.style.background = 'var(--surface-05, rgba(255,255,255,0.02))';
                }}
                onMouseLeave={e => {
                  if (selectedDriver?.identityKey !== d.identityKey) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 12, color: selectedDriver?.identityKey === d.identityKey ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.nome}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>{d.placa || 'Sem placa'}</span>
                  <span>{resolveMonitorName(d.transportadora)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Painel Direito: Dossiê e IA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 10 }}>
        {selectedDriver ? (
          <>
            {/* Header Motorista */}
            <div className="card" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="ti ti-steering-wheel" style={{ color: 'var(--accent-500)', fontSize: 15 }}></i>
                    {selectedDriver.nome}
                  </h2>
                  <div style={{ display: 'flex', gap: 8, color: 'var(--text-muted)', fontSize: 10.5, marginTop: 3, flexWrap: 'wrap' }}>
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
                      <i className={`ti ti-${selectedDriver.turno === 'diurno' ? 'sun' : 'moon'}`} style={{ marginLeft: 3, marginRight: 2, color: selectedDriver.turno === 'diurno' ? 'var(--warning-500)' : 'var(--accent-300)' }}></i>
                      {selectedDriver.turno === 'diurno' ? 'Diurno' : 'Noturno'}
                    </span>
                  </div>
                </div>

                {/* KPIs Rápidos — compactos, na mesma linha do nome em telas largas */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div className="stat-box" style={{ padding: '5px 10px', minWidth: 74, textAlign: 'center' }}>
                    <div className="stat-label" style={{ fontSize: 9, marginBottom: 1 }}>Alertas</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>{stats.total}</div>
                  </div>
                  <div className="stat-box" style={{ padding: '5px 10px', minWidth: 74, textAlign: 'center' }}>
                    <div className="stat-label" style={{ fontSize: 9, marginBottom: 1 }}>Críticos</div>
                    <div className={`stat-value${stats.critical > 0 ? ' danger' : ''}`} style={{ fontSize: 16 }}>{stats.critical}</div>
                  </div>
                  <div className="stat-box" style={{ padding: '5px 10px', minWidth: 74, textAlign: 'center' }}>
                    <div className="stat-label" style={{ fontSize: 9, marginBottom: 1 }}>Bocejos</div>
                    <div className="stat-value" style={{ fontSize: 16 }}>{stats.yawning}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Navegação de abas: Clínico × Documentos × Histórico & Tratativas (vira /dossies/:tab) */}
            <nav className="tabs" aria-label="Abas do Dossiê do Motorista" style={{ marginBottom: 10 }}>
              {[
                { id: 'clinico',     label: 'Clínico',              icon: 'ti-activity' },
                { id: 'documentos',  label: 'Documentos',            icon: 'ti-files', count: documents.length },
                { id: 'tratativas',  label: 'Histórico & Tratativas', icon: 'ti-history', count: combinedHistory.length },
              ].map(t => (
                <div
                  key={t.id}
                  className={`tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => navigate({ pathname: `/dossies/${t.id}`, search: searchParams.toString() })}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate({ pathname: `/dossies/${t.id}`, search: searchParams.toString() });
                    }
                  }}
                  aria-selected={tab === t.id}
                  style={{ padding: '7px 13px', fontSize: 12 }}
                >
                  <i className={`ti ${t.icon}`}></i> {t.label}
                  {t.count != null && <span className="tab-count">{t.count}</span>}
                </div>
              ))}
            </nav>

            {/* Ficha de Saúde (Dados Clínicos) */}
            {tab === 'clinico' && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="card-title">
                    <i className="ti ti-activity" style={{ color: 'var(--accent-500)' }}></i> Ficha Clínica & Dados Cadastrais
                  </div>
                  {!editingHealth && canManageClinical && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditingHealth(true)}>
                      <i className="ti ti-edit"></i> Editar Ficha
                    </button>
                  )}
                </div>
                
                <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {editingHealth ? (
                    <form onSubmit={handleSaveHealth} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dados Cadastrais</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div className="form-group">
                          <label className="form-label">CPF</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.cpf}
                            onChange={e => setHealthData(prev => ({ ...prev, cpf: e.target.value }))}
                            placeholder="000.000.000-00"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">RG</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.rg}
                            onChange={e => setHealthData(prev => ({ ...prev, rg: e.target.value }))}
                            placeholder="Número do RG"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Data de Nascimento</label>
                          <input
                            type="date"
                            className="form-control"
                            value={healthData.data_nascimento}
                            onChange={e => setHealthData(prev => ({ ...prev, data_nascimento: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                        <div className="form-group">
                          <label className="form-label">CNH (Número)</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.cnh_numero}
                            onChange={e => setHealthData(prev => ({ ...prev, cnh_numero: e.target.value }))}
                            placeholder="Número de registro"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">CNH (Categoria)</label>
                          <input
                            type="text"
                            className="form-control"
                            value={healthData.cnh_categoria}
                            onChange={e => setHealthData(prev => ({ ...prev, cnh_categoria: e.target.value }))}
                            placeholder="Ex: AE"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">CNH (Validade)</label>
                          <input
                            type="date"
                            className="form-control"
                            value={healthData.cnh_validade}
                            onChange={e => setHealthData(prev => ({ ...prev, cnh_validade: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Dados Clínicos</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                          style={{ minHeight: 56, height: '100%' }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                        <div style={{ background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CPF</span>
                          <div style={{ fontSize: 12, fontWeight: 600, color: healthData.cpf ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {healthData.cpf || '—'}
                          </div>
                        </div>
                        <div style={{ background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>RG</span>
                          <div style={{ fontSize: 12, fontWeight: 600, color: healthData.rg ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {healthData.rg || '—'}
                          </div>
                        </div>
                        <div style={{ background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nascimento</span>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {healthData.data_nascimento ? new Date(healthData.data_nascimento).toLocaleDateString('pt-BR') : '—'}
                          </div>
                        </div>
                        <div style={{ gridColumn: 'span 2', background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CNH</span>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            {healthData.cnh_numero ? `${healthData.cnh_numero}${healthData.cnh_categoria ? ' · ' + healthData.cnh_categoria : ''}` : '—'}
                            {cnhWarning && <span className={`badge badge-${cnhWarning.class}`} style={{ fontSize: 8 }}>{cnhWarning.text}</span>}
                          </div>
                        </div>
                        <div style={{ background: 'var(--surface-0, rgba(255,255,255,0.01))', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px' }}>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Epworth</span>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {healthData.escala_epworth} pts
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`badge badge-${epworthWarning.class}`} style={{ fontSize: 9 }}>{epworthWarning.text}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          Última revisão: {healthData.ultimo_exame_em ? new Date(healthData.ultimo_exame_em).toLocaleDateString('pt-BR') : 'sem registro'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flex: 1 }}>
                        <div>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Polissonografia / Apneia</span>
                          <div style={{ fontSize: 11.5, color: healthData.polissonografia ? 'var(--text-primary)' : 'var(--text-muted)', background: 'var(--surface-0)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 6, minHeight: 44 }}>
                            {healthData.polissonografia || 'Nenhum exame cadastrado.'}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>Histórico Clínico e Sintomas</span>
                          <div style={{ fontSize: 11.5, color: healthData.historico_clinico ? 'var(--text-primary)' : 'var(--text-muted)', background: 'var(--surface-0)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 6, minHeight: 44, maxHeight: 66, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {healthData.historico_clinico || 'Sem anotações.'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Documentos do motorista — upload (OCR + extração por IA chegam na próxima etapa) */}
            {tab === 'documentos' && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <i className="ti ti-files" style={{ color: 'var(--accent-500)' }}></i> Documentos do Motorista
                  </div>
                </div>

                {canManageClinical ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginBottom: 10 }}>
                  {DOC_TYPES.map(dt => (
                    <label
                      key={dt.id}
                      className={`upload-area collapsed${dragOverType === dt.id ? ' drag-over' : ''}`}
                      style={{ cursor: uploadingType ? 'wait' : 'pointer' }}
                      onDragOver={e => { e.preventDefault(); if (!uploadingType) setDragOverType(dt.id); }}
                      onDragLeave={() => setDragOverType(prev => (prev === dt.id ? null : prev))}
                      onDrop={e => {
                        e.preventDefault();
                        setDragOverType(null);
                        const file = e.dataTransfer.files?.[0];
                        if (file && !uploadingType) handleUploadDocument(dt.id, file);
                      }}
                    >
                      <div className="upload-icon">
                        <i className={`ti ${uploadingType === dt.id ? 'ti-loader-2 ti-spin' : dt.icon}`}></i>
                      </div>
                      <div className="upload-text">
                        <div className="upload-title">{dt.label}</div>
                        <div className="upload-hint">JPG, PNG, WebP ou PDF · até 10MB (ou arraste aqui)</div>
                      </div>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        hidden
                        disabled={!!uploadingType}
                        onChange={e => e.target.files[0] && handleUploadDocument(dt.id, e.target.files[0])}
                      />
                    </label>
                  ))}
                </div>
                ) : (
                  <div className="field-hint" style={{ marginBottom: 10 }}>
                    Documentos clínicos em modo somente leitura. Upload e alterações exigem perfil Líder ou Admin.
                  </div>
                )}

                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
                  Leitura automática por OCR e preenchimento assistido por I.A chegam na próxima etapa. Por enquanto, os documentos ficam arquivados aqui e os dados seguem sendo cadastrados manualmente na aba Clínico.
                </div>

                {documents.length === 0 ? (
                  <EmptyState icon="ti-file-off" msg="Nenhum documento enviado para este motorista ainda." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {documents.map(doc => {
                      const st = DOC_STATUS[doc.status] || DOC_STATUS.pendente;
                      const dt = DOC_TYPES.find(d => d.id === doc.tipo_documento);
                      return (
                        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: 6 }}>
                          <i className={`ti ${dt?.icon || 'ti-file'}`} style={{ fontSize: 15, color: 'var(--text-muted)', flexShrink: 0 }}></i>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {dt?.label || doc.tipo_documento} · {doc.file_name}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                              {new Date(doc.created_at).toLocaleString('pt-BR')}
                            </div>
                          </div>
                          {st.class ? (
                            <span className={`badge badge-${st.class}`} style={{ flexShrink: 0 }} title={doc.status === 'erro' ? doc.error_message : undefined}>{st.label}</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{st.label}</span>
                          )}
                          {canManageClinical && (doc.status === 'pendente' || doc.status === 'erro') && (
                            <button className="btn btn-sm btn-primary" onClick={() => handleProcessDocument(doc)} disabled={processingDocId === doc.id}>
                              {processingDocId === doc.id ? (
                                <><i className="ti ti-loader-2 ti-spin"></i> Processando...</>
                              ) : (
                                <><i className="ti ti-sparkles"></i> {doc.status === 'erro' ? 'Tentar novamente' : 'Processar com IA'}</>
                              )}
                            </button>
                          )}
                          {canManageClinical && doc.status === 'processado' && (
                            <button className="btn btn-sm btn-primary" onClick={() => openReview(doc)}>
                              <i className="ti ti-clipboard-check"></i> Revisar
                            </button>
                          )}
                          <button className="btn btn-sm btn-ghost btn-icon-only" onClick={() => handleViewDocument(doc)} title="Visualizar">
                            <i className="ti ti-eye"></i>
                          </button>
                          {canManageClinical && (
                            <button className="btn btn-sm btn-ghost btn-icon-only btn-danger" onClick={() => handleDeleteDocument(doc)} title="Excluir">
                              <i className="ti ti-trash"></i>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Histórico & Tratativas — telemetria (alertas de fadiga) e ações operacionais unificadas numa única linha do tempo */}
            {tab === 'tratativas' && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="card-title">
                    <i className="ti ti-history" style={{ color: 'var(--accent-500)' }}></i> Histórico & Tratativas
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    {telemetryTotal} alerta{telemetryTotal === 1 ? '' : 's'} · {atendimentosList.length} ação{atendimentosList.length === 1 ? '' : 'ões'}
                    {telemetryTotal > telemetryEvents.length && ` · exibindo ${telemetryEvents.length} alertas mais recentes`}
                  </span>
                </div>

                <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                  {loadingHistory ? (
                    <div className="empty-state" style={{ height: 150 }}><i className="ti ti-loader-2 ti-spin"></i></div>
                  ) : combinedHistory.length === 0 ? (
                    <EmptyState msg="Nenhum alerta ou tratativa registrada para este motorista." style={{ height: 150, fontSize: 12 }} />
                  ) : (
                    combinedHistory.map(item => {
                      const isEvento = item.kind === 'evento';
                      const icon = isEvento
                        ? 'ti-activity-heartbeat'
                        : item.tipo === 'intervencao' ? 'ti-phone-call' : item.tipo === 'reportar' ? 'ti-building' : 'ti-history';
                      const badgeClass = isEvento
                        ? (String(item.severidade).toLowerCase().includes('graviss') || String(item.severidade).toLowerCase() === 'grave' ? 'danger' : 'info')
                        : item.tipo === 'intervencao' ? 'danger' : item.tipo === 'reportar' ? 'warning' : 'info';
                      const badgeLabel = isEvento ? (item.severidade || 'Normal') : String(item.tipo).toUpperCase();
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border-light, rgba(255,255,255,0.03))' }}>
                          <i className={`ti ${icon}`} style={{ fontSize: 13, width: 15, textAlign: 'center', flexShrink: 0, color: isEvento ? severityColor(item.severidade) : 'var(--accent-500)' }}></i>
                          <span className={`badge badge-${badgeClass}`} style={{ fontSize: 8, flexShrink: 0 }}>{badgeLabel}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: isEvento ? 400 : 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.label}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.meta}
                          </span>
                          <span style={{ fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                            {new Date(item.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Laudo Integrado por IA (clínico) */}
            {tab === 'clinico' && (
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
              
              <div style={{ padding: 12 }}>
                {generatingReport ? (
                  <div className="empty-state" style={{ minHeight: 90, padding: '20px 24px' }}>
                    <i className="ti ti-loader-2 ti-spin" style={{ fontSize: 20, marginBottom: 6 }}></i>
                    Cruzar histórico de {stats.total} alertas de fadiga com exames médicos...
                  </div>
                ) : aiReport ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                      <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(aiReport); toast('Laudo copiado!', 'success'); }}>
                        <i className="ti ti-copy"></i> Copiar Laudo
                      </button>
                    </div>
                    <div
                      className="report-body"
                      style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-primary)', background: 'var(--surface-0)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(aiReport) }}
                    />
                  </div>
                ) : (
                  <div className="empty-state" style={{ minHeight: 70, fontSize: 11.5, padding: '18px 24px' }}>
                    <i className="ti ti-sparkles" style={{ fontSize: 24, marginBottom: 6, color: 'var(--text-muted)' }}></i>
                    Clique no botão acima para consolidar os alertas de fadiga do condutor e o prontuário de exames médicos em uma análise de perfil clínico-operacional.
                  </div>
                )}
              </div>
            </div>
            )}

          </>
        ) : (
          <div className="card empty-state" style={{ flex: 1 }}>
            <i className="ti ti-steering-wheel" style={{ fontSize: 48, color: 'var(--text-muted)' }}></i>
            Selecione um motorista na lista ao lado para carregar o seu prontuário clínico e histórico de fadiga.
          </div>
        )}
      </div>
    </div>

    {/* Modal de revisão dos dados extraídos por OCR/IA antes de aplicar na ficha */}
    {reviewingDoc && (
      <Modal open onClose={() => setReviewingDoc(null)} width={560} labelledBy="ocr-review-modal-title" closeOnOverlay={false}>
          <div className="modal-header">
            <div className="modal-title" id="ocr-review-modal-title">
              <i className="ti ti-sparkles" style={{ color: 'var(--accent-500)' }}></i>
              Revisar dados extraídos — {DOC_TYPES.find(d => d.id === reviewingDoc.tipo_documento)?.label || reviewingDoc.tipo_documento}
            </div>
            <button className="btn-icon" onClick={() => setReviewingDoc(null)}><i className="ti ti-x"></i></button>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            Confira e corrija os dados lidos por OCR antes de aplicar na ficha do motorista. Nada é salvo até você confirmar.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
            {(REVIEW_FIELDS[reviewingDoc.tipo_documento] || []).map(f => (
              <div className="form-group" key={f.key} style={{ marginBottom: 0 }}>
                <label className="form-label">{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea
                    className="form-control"
                    value={reviewFields[f.key] || ''}
                    onChange={e => setReviewFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    disabled={f.readOnly}
                  />
                ) : (
                  <input
                    type={f.type}
                    className="form-control"
                    value={reviewFields[f.key] || ''}
                    onChange={e => setReviewFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    disabled={f.readOnly}
                  />
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-ghost" onClick={() => handleViewDocument(reviewingDoc)}>
              <i className="ti ti-eye"></i> Ver documento original
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setReviewingDoc(null)} disabled={applyingReview}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleApplyReview} disabled={applyingReview}>
                {applyingReview ? <><i className="ti ti-loader-2 ti-spin"></i> Aplicando...</> : <><i className="ti ti-check"></i> Confirmar e aplicar na ficha</>}
              </button>
            </div>
          </div>
      </Modal>
    )}
    </>
  );
}
