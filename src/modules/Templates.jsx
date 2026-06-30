import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTemplates } from '../hooks/useTemplates';
import { useConfirm } from '../hooks/useConfirm';
import { getCustomVars, setCustomVars } from './monitor/utils';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../hooks/useToast.jsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const TABS = ['todos','contato','questionario','alerta','encerramento','whatsapp','variaveis'];
const TAB_LABELS = { todos:'Todos', contato:'Contato', questionario:'Questionário', alerta:'Alerta', encerramento:'Encerramento', whatsapp: 'WhatsApp (Meta)', variaveis:'Variáveis' };
const TAG_OPTIONS = [
  { value:'contato', label:'Contato' },
  { value:'questionario', label:'Questionário' },
  { value:'alerta', label:'Alerta' },
  { value:'encerramento', label:'Encerramento' },
];

const BUILTIN_VARS = [
  { name: 'NOME',           desc: 'Nome do motorista (automático)' },
  { name: 'PLACA',          desc: 'Placa do veículo (automático)' },
  { name: 'HORA',           desc: 'Horário atual no momento do envio (automático)' },
  { name: 'TRANSPORTADORA', desc: 'Transportadora / empresa do motorista (automático)' },
  { name: 'SAUDACAO',       desc: 'Bom dia / Boa tarde / Boa noite conforme horário (automático)' },
];

// Formatter to render WhatsApp style tags (*bold*, _italic_, ~strikethrough~, `code`, \n) as HTML
const formatWhatsAppText = (text) => {
  if (!text) return '';
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  // bold *text*
  formatted = formatted.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
  // italic _text_
  formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
  // strikethrough ~text~
  formatted = formatted.replace(/~(.*?)_/g, '<del>$1</del>');
  // code `code`
  formatted = formatted.replace(/`(.*?)`/g, '<code class="bg-slate-100/80 dark:bg-slate-800 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
  // line breaks
  formatted = formatted.replace(/\n/g, '<br />');
  
  return formatted;
};

export default function Templates() {
  const { templates, loading, add, update, remove, reorder } = useTemplates();
  const { profile, session } = useAuth();
  const authHeader = () => ({ Authorization: `Bearer ${session?.access_token}` });
  const canEdit = profile?.role === 'admin' || profile?.role === 'lider';
  const confirm = useConfirm();
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);

  // WhatsApp Templates Meta integration states
  const toast = useToast();
  const [whatsappTemplates, setWhatsappTemplates] = useState([]);
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false);
  const [syncingWhatsapp, setSyncingWhatsapp] = useState(false);

  // Selected WhatsApp template for simulation and test dispatch
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [testVariables, setTestVariables] = useState({});
  const [testPhone, setTestPhone] = useState('');
  const [testName, setTestName] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const fetchWhatsappTemplates = async (force = false) => {
    setLoadingWhatsapp(true);
    if (force) setSyncingWhatsapp(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/templates${force ? '?forceSync=true' : ''}`, { headers: authHeader() });
      if (!res.ok) throw new Error('Falha ao carregar templates.');
      const data = await res.json();
      setWhatsappTemplates(data.templates || []);
      if (data.error) {
        toast(data.error, 'info');
      } else if (force) {
        toast('Templates sincronizados com a Meta!', 'success');
      }
    } catch (err) {
      console.error('Erro ao buscar templates do WhatsApp:', err);
      if (force) toast('Erro ao sincronizar templates: ' + err.message, 'error');
    } finally {
      setLoadingWhatsapp(false);
      setSyncingWhatsapp(false);
    }
  };

  const getTemplateVariables = (template) => {
    if (!template) return [];
    const bodyComponent = template.components?.find(c => c.type === 'BODY');
    if (!bodyComponent || !bodyComponent.text) return [];
    
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = [];
    let match;
    while ((match = regex.exec(bodyComponent.text)) !== null) {
      matches.push(match[1]);
    }
    const unique = [];
    for (const m of matches) {
      if (!unique.includes(m)) {
        unique.push(m);
      }
    }
    return unique;
  };

  const handleSendTest = async () => {
    if (!testPhone) {
      toast('Insira o número de telefone de teste.', 'error');
      return;
    }
    if (!selectedTemplate) {
      toast('Nenhum template selecionado.', 'error');
      return;
    }
    
    const variables = getTemplateVariables(selectedTemplate);
    
    const varsArray = [];
    for (const placeholder of variables) {
      const val = testVariables[placeholder];
      if (val === undefined || val === '') {
        toast(`Por favor, preencha a variável {{${placeholder}}}.`, 'error');
        return;
      }
      varsArray.push(val);
    }
    
    setSendingTest(true);
    try {
      const res = await fetch(`${API_URL}/api/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          recipient_phone: testPhone,
          recipient_name: testName || 'Teste Manual',
          template_name: selectedTemplate.name,
          language_code: selectedTemplate.language,
          variables: varsArray,
          userId: profile?.id
        })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao disparar mensagem.');
      }
      
      toast('Mensagem disparada com sucesso!', 'success');
      setTestPhone('');
      setTestName('');
      setTestVariables({});
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSendingTest(false);
    }
  };

  useEffect(() => {
    fetchWhatsappTemplates();
  }, []);

  const counts = { todos: templates.length };
  TABS.slice(1).filter(t => t !== 'variaveis' && t !== 'whatsapp').forEach(t => { counts[t] = templates.filter(x => x.tag === t).length; });
  counts['whatsapp'] = whatsappTemplates.length;

  const list = templates.filter(t => {
    if (filter !== 'todos' && t.tag !== filter) return false;
    if (search && !(t.title.toLowerCase().includes(search) || t.text.toLowerCase().includes(search))) return false;
    return true;
  });

  const filteredWhatsappTemplates = whatsappTemplates.filter(t => {
    if (!search) return true;
    const body = t.components?.find(c => c.type === 'BODY')?.text || '';
    return t.name.toLowerCase().includes(search.toLowerCase()) || body.toLowerCase().includes(search.toLowerCase());
  });

  const copy = (text, btn) => {
    navigator.clipboard?.writeText(text);
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-check"></i> Copiado';
    btn.style.background = 'var(--success-500)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 1400);
  };

  const handleDragStart = (e, tpl) => {
    e.dataTransfer.setData('tplId', tpl.id);
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetTpl) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('tplId');
    if (draggedId === targetTpl.id) return;

    const newList = [...templates];
    const draggedIdx = newList.findIndex(t => t.id === draggedId);
    const targetIdx = newList.findIndex(t => t.id === targetTpl.id);

    const [draggedItem] = newList.splice(draggedIdx, 1);
    newList.splice(targetIdx, 0, draggedItem);

    reorder(newList);
  };

  const handleRemove = async (id) => {
    if (!(await confirm({ title: 'Excluir template', message: 'Tem certeza que deseja excluir este template?', danger: true }))) return;
    remove(id);
  };

  const save = (data) => {
    if (modal && modal !== 'new') {
      update(modal.id, data);
    } else {
      add(data);
    }
    setModal(null);
  };

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div>
      <div className="search-row">
        <div className="search-wrap">
          <i className="ti ti-search"></i>
          <input 
            aria-label="Buscar templates" 
            placeholder="Buscar templates..." 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            disabled={filter === 'variaveis'} 
          />
        </div>
        {filter === 'whatsapp' ? (
          <button 
            className="btn btn-primary" 
            onClick={() => fetchWhatsappTemplates(true)} 
            disabled={syncingWhatsapp}
          >
            <i className={`ti ${syncingWhatsapp ? 'ti-refresh animate-spin' : 'ti-refresh'}`}></i>
            {syncingWhatsapp ? 'Sincronizando...' : 'Sincronizar Meta'}
          </button>
        ) : (
          canEdit && filter !== 'variaveis' && (
            <button className="btn btn-primary" onClick={() => setModal('new')}><i className="ti ti-plus"></i> Novo template</button>
          )
        )}
      </div>

      <nav aria-label="Abas de templates" className="tabs" role="tablist">
        {TABS.map(f => (
          <div 
            key={f} 
            className={`tab ${filter === f ? 'active' : ''}`} 
            role="tab"
            tabIndex={0}
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFilter(f);
              }
            }}
          >
            {f === 'variaveis' ? <><i className="ti ti-variable"></i> {TAB_LABELS[f]}</> : TAB_LABELS[f]}
            {counts[f] != null && <span className="tab-count">{counts[f]}</span>}
          </div>
        ))}
      </nav>

      {filter === 'variaveis' ? (
        <VariaveisPanel canEdit={canEdit} />
      ) : filter === 'whatsapp' ? (
        <div className="templates-split-layout" style={{ display: 'flex', gap: '20px', width: '100%', alignItems: 'stretch' }}>
          {/* Left Column: Templates List (40% width) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '40%', flexShrink: 0 }}>
            {loadingWhatsapp && whatsappTemplates.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <i className="ti ti-loader-2 animate-spin"></i> Carregando...
              </div>
            ) : filteredWhatsappTemplates.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <i className="ti ti-file-unknown"></i> Nenhum template encontrado.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: 'calc(100vh - 250px)', paddingRight: '4px' }}>
                {filteredWhatsappTemplates.map(tpl => {
                  const categoryLabel = tpl.category === 'MARKETING' ? 'Marketing' : tpl.category === 'UTILITY' ? 'Utilidade' : 'Autenticação';
                  const isApproved = tpl.status === 'APPROVED';
                  const isSelected = selectedTemplate?.id === tpl.id;
                  
                  return (
                    <div 
                      key={tpl.id} 
                      style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        display: 'flex',
                        gap: '12px',
                        transition: 'all 0.15s',
                        backgroundColor: isSelected ? 'var(--accent-50)' : 'var(--surface-0)',
                        border: `1.5px solid ${isSelected ? 'var(--accent-500)' : 'var(--border)'}`
                      }}
                      onClick={() => {
                        setSelectedTemplate(tpl);
                        setTestVariables({});
                      }}
                      className="template-card-hover"
                    >
                      <div style={{ marginTop: '2px', flexShrink: 0 }}>
                        <div 
                          style={{ 
                            width: '16px', height: '16px', borderRadius: '50%', border: '2px solid transparent', 
                            borderColor: isSelected ? 'var(--accent-500)' : 'var(--border-strong)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center' 
                          }}
                        >
                          {isSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-500)' }}></div>}
                        </div>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span 
                            style={{ 
                              fontWeight: '800', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              color: isSelected ? 'var(--accent-600)' : 'var(--text-primary)' 
                            }}
                          >
                            {tpl.name}
                          </span>
                          <span 
                            style={{
                              padding: '2px 8px', borderRadius: '99px', fontSize: '9px', fontWeight: 'bold', border: '1px solid transparent',
                              backgroundColor: isApproved ? 'var(--success-bg || rgba(45, 167, 90, 0.15))' : 'var(--warning-bg || rgba(232, 160, 32, 0.15))',
                              color: isApproved ? 'var(--success-600 || #2da75a)' : 'var(--warning-600 || #e8a020)',
                              borderColor: isApproved ? 'rgba(45, 167, 90, 0.22)' : 'rgba(232, 160, 32, 0.22)'
                            }}
                          >
                            {isApproved ? 'Aprovado' : tpl.status}
                          </span>
                        </div>
                        
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {tpl.components?.find(c => c.type === 'BODY')?.text}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px', fontSize: '9px', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><i className="ti ti-category"></i> {categoryLabel}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: WhatsApp Preview & Test trigger (60% width) */}
          <div style={{ flex: 1, width: '60%' }}>
            {selectedTemplate ? (
              <div 
                className="card"
                style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', height: '100%', minHeight: '400px' }}
              >
                <div className="card-header pb-3 border-b border-[var(--border)]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: 0 }}>
                  <div className="card-title">
                    <i className="ti ti-brand-whatsapp" style={{ color: 'var(--accent-500)', fontSize: '18px' }}></i>
                    <span>Simulação & Envio de Teste</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={e => copy(selectedTemplate.components?.find(c => c.type === 'BODY')?.text || '', e.currentTarget)}>
                      <i className="ti ti-copy"></i> Copiar Conteúdo
                    </button>
                    <button className="btn btn-sm" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={e => copy(selectedTemplate.name, e.currentTarget)}>
                      <i className="ti ti-hash"></i> Copiar Nome
                    </button>
                  </div>
                </div>

                {/* Simulated Smartphone Screen */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span className="form-label" style={{ marginBottom: 0 }}>Visualização do WhatsApp</span>
                  
                  {/* WhatsApp Smartphone Container */}
                  <div style={{ border: '1px solid var(--border-md)', borderRadius: '18px', overflow: 'hidden', backgroundColor: '#efeae2' }}>
                    {/* Header Bar */}
                    <div style={{ backgroundColor: '#075e54', padding: '10px 14px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                          <i className="ti ti-brand-whatsapp" style={{ color: '#4ade80' }}></i>
                        </div>
                        <div>
                          <p style={{ fontWeight: 'bold', fontSize: '12px', margin: 0, lineHeight: 1.2 }}>MedNet Suporte</p>
                          <p style={{ fontSize: '9px', color: '#86efac', margin: '2px 0 0 0', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#4ade80' }}></span> online
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#e2e8f0', fontSize: '14px' }}>
                        <i className="ti ti-video" style={{ cursor: 'pointer' }}></i>
                        <i className="ti ti-phone" style={{ cursor: 'pointer' }}></i>
                        <i className="ti ti-dots-vertical" style={{ cursor: 'pointer' }}></i>
                      </div>
                    </div>

                    {/* Chat Wallpaper & Message Bubble */}
                    <div style={{
                      padding: '16px', minHeight: '160px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                      backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`,
                      backgroundSize: 'cover',
                      backgroundBlendMode: 'overlay',
                      backgroundColor: 'rgba(239, 234, 226, 0.95)'
                    }}>
                      <div style={{
                        backgroundColor: '#ffffff', borderRadius: '12px', borderTopRightRadius: '0px', padding: '10px 12px',
                        maxWidth: '85%', marginLeft: 'auto', boxShadow: '0 1px 1px rgba(0,0,0,0.1)', border: '1px solid rgba(220,248,198,0.5)'
                      }}>
                        {selectedTemplate.components?.find(c => c.type === 'HEADER')?.text && (
                          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', color: '#111b21' }}>
                            {selectedTemplate.components.find(c => c.type === 'HEADER').text}
                          </div>
                        )}
                        <p 
                          className="wa-text"
                          style={{ fontSize: '12.5px', color: '#1f2c34', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'var(--font-sans)' }}
                          dangerouslySetInnerHTML={{ 
                            __html: formatWhatsAppText(
                              (selectedTemplate.components?.find(c => c.type === 'BODY')?.text || '').replace(/\{\{([^}]+)\}\}/g, (match, g1) => {
                                return testVariables[g1] ? `*${testVariables[g1]}*` : `[${g1}]`;
                              })
                            ) 
                          }}
                        />
                        {selectedTemplate.components?.find(c => c.type === 'FOOTER')?.text && (
                          <div style={{ fontSize: '10px', color: '#667781', marginTop: '6px' }}>
                            {selectedTemplate.components.find(c => c.type === 'FOOTER').text}
                          </div>
                        )}
                        {selectedTemplate.components?.find(c => c.type === 'BUTTONS')?.buttons?.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '8px', borderTop: '1px solid #f0f2f5' }}>
                            {selectedTemplate.components.find(c => c.type === 'BUTTONS').buttons.map((btn, idx) => (
                              <div 
                                key={idx} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  gap: '6px', 
                                  color: '#008069', 
                                  fontSize: '12px', 
                                  fontWeight: '500', 
                                  padding: '8px 0 0 0',
                                  cursor: 'default'
                                }}
                              >
                                <i className={btn.type === 'PHONE_NUMBER' ? 'ti ti-phone' : btn.type === 'URL' ? 'ti ti-external-link' : 'ti ti-message-dots'}></i>
                                {btn.text}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dynamic Variables Inputs */}
                {(() => {
                  const variables = getTemplateVariables(selectedTemplate);
                  if (variables.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      <span className="form-label" style={{ marginBottom: '4px' }}>Variáveis do Modelo</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                        {variables.map((placeholder) => {
                          return (
                            <div key={placeholder} className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '11px' }}>Variável {"{{" + placeholder + "}}"}</label>
                              <input 
                                className="form-control"
                                value={testVariables[placeholder] || ''}
                                onChange={e => setTestVariables(prev => ({ ...prev, [placeholder]: e.target.value }))}
                                placeholder={`Ex: valor para {{${placeholder}}}`}
                                style={{ fontSize: '12.5px' }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Recipient Details & Trigger Button */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <span className="form-label" style={{ marginBottom: '4px' }}>Dados do Destinatário de Teste</span>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Nome Completo</label>
                      <input 
                        className="form-control"
                        value={testName}
                        onChange={e => setTestName(e.target.value)}
                        placeholder="Ex: João da Silva"
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Telefone Celular (com DDI+DDD)</label>
                      <input 
                        className="form-control mono"
                        value={testPhone}
                        onChange={e => setTestPhone(e.target.value)}
                        placeholder="Ex: 5511999999999"
                        style={{ fontSize: '12.5px' }}
                      />
                    </div>
                  </div>
                  
                  <div className="field-hint" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--surface-1)' }}>
                    <i className="ti ti-info-circle" style={{ color: 'var(--accent-500)', fontSize: '14px', flexShrink: 0 }}></i>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>O telefone deve conter o código do país (55 para Brasil) e o DDD com 9 dígitos. Ex: 5511999999999.</span>
                  </div>

                  <button 
                    className="btn btn-wa"
                    onClick={handleSendTest} 
                    disabled={sendingTest}
                    style={{ width: '100%', padding: '10px', justifyContent: 'center', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#25D366', color: '#ffffff', border: 'none' }}
                  >
                    <i className={`ti ${sendingTest ? 'ti-loader-2 animate-spin' : 'ti-brand-whatsapp'}`} style={{ fontSize: '14px' }}></i>
                    {sendingTest ? 'Enviando disparo...' : 'Enviar Disparo de Teste via WhatsApp'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', minHeight: '400px', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  <i className="ti ti-brand-whatsapp"></i>
                </div>
                <h5 className="form-label" style={{ fontSize: '13px', marginBottom: '6px' }}>Nenhum Template Selecionado</h5>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '320px', margin: '0 auto', lineHeight: '1.5' }}>Escolha um dos modelos homologados à esquerda para visualizar a estrutura da mensagem, preencher as variáveis e realizar disparos de teste.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="templates-grid">
          {list.length === 0
            ? <div className="empty-state" style={{ gridColumn: '1/-1' }}><i className="ti ti-file-off"></i>Nenhum template encontrado</div>
            : list.map(t => (
              <div
                className={`template-card ${t._pending ? 'opacity-50' : ''}`}
                key={t.id}
                draggable={canEdit}
                onDragStart={(e) => canEdit && handleDragStart(e, t)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={(e) => canEdit && handleDrop(e, t)}
              >
                <div className="template-card-header">
                  <span className={`tag tag-${t.tag}`}>{t.tagLabel}</span>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="btn-icon" onClick={() => setModal(t)}><i className="ti ti-pencil"></i></button>
                      <button className="btn-icon" onClick={() => handleRemove(t.id)}><i className="ti ti-trash"></i></button>
                    </div>
                  )}
                </div>
                <div className="template-title">{t.title}</div>
                <div className="template-preview">{t.text}</div>
                <div className="template-actions">
                  <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={e => copy(t.text, e.currentTarget)}>
                    <i className="ti ti-copy"></i> Copiar
                  </button>
                  <span className="template-char-count">{t.text.length} caracteres</span>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {modal !== null && (
        <TemplateModal
          tpl={modal !== 'new' ? modal : null}
          onSave={save}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function VariaveisPanel({ canEdit }) {
  const [vars, setVarsState] = useState(() => getCustomVars());
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [editingKey, setEditingKey] = useState(null);

  const persist = (next) => { setVarsState(next); setCustomVars(next); };

  const addVar = () => {
    const key = newKey.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    if (!key) return;
    persist({ ...vars, [key]: newVal.trim() });
    setNewKey('');
    setNewVal('');
  };

  const updateVal = (key, val) => persist({ ...vars, [key]: val });
  const removeVar = (key) => { const next = { ...vars }; delete next[key]; persist(next); };

  const customEntries = Object.entries(vars);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Built-in variables */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-lock" style={{ color: 'var(--text-muted)' }}></i>
          Variáveis do sistema
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>— preenchidas automaticamente</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', alignItems: 'center' }}>
          {BUILTIN_VARS.flatMap(v => [
            <code key={`k-${v.name}`} style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>[{v.name}]</code>,
            <span key={`d-${v.name}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>{v.desc}</span>,
          ])}
        </div>
      </div>

      {/* Custom variables */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="ti ti-variable" style={{ color: 'var(--accent-400)' }}></i>
          Variáveis customizadas
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>— defina e use nos templates como [NOME_DA_VARIAVEL]</span>
        </div>

        {customEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 0' }}>
            <i className="ti ti-variable-off"></i>Nenhuma variável customizada ainda
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {customEntries.map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ fontSize: 12, background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, minWidth: 120, whiteSpace: 'nowrap' }}>[{key}]</code>
                {editingKey === key && canEdit ? (
                  <input
                    className="form-control"
                    style={{ flex: 1, fontSize: 13 }}
                    value={val}
                    autoFocus
                    aria-label={`Valor para a variável ${key}`}
                    onChange={e => updateVal(key, e.target.value)}
                    onBlur={() => setEditingKey(null)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingKey(null); }}
                  />
                ) : (
                  <span
                    style={{
                      flex: 1,
                      fontSize: 13,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: canEdit ? 'pointer' : 'default',
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)'
                    }}
                    title={canEdit ? "Clique para editar" : ""}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onClick={() => canEdit && setEditingKey(key)}
                    onKeyDown={e => {
                      if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setEditingKey(key);
                      }
                    }}
                  >
                    {val || <em style={{ color: 'var(--text-muted)' }}>vazio</em>}
                  </span>
                )}
                {canEdit && (
                  <>
                    <button className="btn-icon" title="Editar" onClick={() => setEditingKey(key)}><i className="ti ti-pencil"></i></button>
                    <button className="btn-icon" title="Remover" onClick={() => removeVar(key)}><i className="ti ti-trash"></i></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add new */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '0 0 180px', margin: 0 }}>
              <label className="form-label" htmlFor="var-new-key" style={{ fontSize: 11 }}>Nome (sem colchetes)</label>
              <input
                id="var-new-key"
                className="form-control"
                style={{ fontSize: 13, textTransform: 'uppercase' }}
                placeholder="EX: OPERADOR_SETOR"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addVar(); }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
              <label className="form-label" htmlFor="var-new-val" style={{ fontSize: 11 }}>Valor</label>
              <input
                id="var-new-val"
                className="form-control"
                style={{ fontSize: 13 }}
                placeholder="Ex: Fadiga Zero"
                value={newVal}
                onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addVar(); }}
              />
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 0 }} onClick={addVar}>
              <i className="ti ti-plus"></i> Adicionar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateModal({ tpl, onSave, onClose }) {
  const [tag, setTag] = useState(tpl?.tag || 'contato');
  const [name, setName] = useState(tpl?.title || '');
  const [text, setText] = useState(tpl?.text || '');
  const [customVarEntries] = useState(() => Object.keys(getCustomVars()));
  const textareaRef = useRef(null);

  const handleSave = () => {
    if (!name.trim() || !text.trim()) return;
    const tagLabel = TAG_OPTIONS.find(o => o.value === tag)?.label || tag;
    onSave({ tag, tagLabel, title: name.trim(), text: text.trim() });
  };

  const insertVar = (v) => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const current = text;
    const nextText = current.substring(0, start) + v + current.substring(end);
    setText(nextText);
    setTimeout(() => {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start + v.length, start + v.length);
    }, 0);
  };

  return createPortal(
    <div className="modal-overlay open">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title"><i className="ti ti-message-2"></i> {tpl ? 'Editar template' : 'Novo template'}</div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="template-tag">Categoria</label>
            <select id="template-tag" className="form-control" value={tag} onChange={e => setTag(e.target.value)}>
              {TAG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="template-name">Nome</label>
            <input id="template-name" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do template" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="template-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Conteúdo
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {['[NOME]', '[PLACA]', '[HORA]', '[TRANSPORTADORA]', '[SAUDACAO]', ...customVarEntries.map(k => `[${k}]`)].map(v => (
              <button key={v} type="button" className="btn btn-sm btn-ghost" onClick={() => insertVar(v)} style={{ fontSize: 10, padding: '4px 8px', background: 'var(--surface-2)' }}>
                <i className="ti ti-code"></i> {v}
              </button>
            ))}
          </div>
          <textarea 
            id="template-text"
            ref={textareaRef}
            className="form-control" 
            value={text} 
            onChange={e => setText(e.target.value)} 
            placeholder="Use os botões acima para adicionar variáveis..." 
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}><i className="ti ti-check"></i> Salvar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
