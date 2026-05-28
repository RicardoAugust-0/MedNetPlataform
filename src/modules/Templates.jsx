import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTemplates } from '../hooks/useTemplates';
import { useConfirm } from '../hooks/useConfirm';
import { getCustomVars, setCustomVars } from './monitor/utils';
import { useAuth } from '../auth/AuthContext.jsx';

const TABS = ['todos','contato','questionario','alerta','encerramento','variaveis'];
const TAB_LABELS = { todos:'Todos', contato:'Contato', questionario:'Questionário', alerta:'Alerta', encerramento:'Encerramento', variaveis:'Variáveis' };
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

export default function Templates() {
  const { templates, loading, add, update, remove, reorder } = useTemplates();
  const { profile } = useAuth();
  const canEdit = profile?.role === 'admin' || profile?.role === 'lider';
  const confirm = useConfirm();
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);

  const counts = { todos: templates.length };
  TABS.slice(1).filter(t => t !== 'variaveis').forEach(t => { counts[t] = templates.filter(x => x.tag === t).length; });

  const list = templates.filter(t => {
    if (filter !== 'todos' && t.tag !== filter) return false;
    if (search && !(t.title.toLowerCase().includes(search) || t.text.toLowerCase().includes(search))) return false;
    return true;
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
          <input placeholder="Buscar templates..." value={search} onChange={e => setSearch(e.target.value)} disabled={filter === 'variaveis'} />
        </div>
        {canEdit && filter !== 'variaveis' && (
          <button className="btn btn-primary" onClick={() => setModal('new')}><i className="ti ti-plus"></i> Novo template</button>
        )}
      </div>

      <div className="tabs">
        {TABS.map(f => (
          <div key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'variaveis' ? <><i className="ti ti-variable"></i> {TAB_LABELS[f]}</> : TAB_LABELS[f]}
            {counts[f] != null && <span className="tab-count">{counts[f]}</span>}
          </div>
        ))}
      </div>

      {filter === 'variaveis' ? (
        <VariaveisPanel canEdit={canEdit} />
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
                    onClick={() => canEdit && setEditingKey(key)}
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
              <label className="form-label" style={{ fontSize: 11 }}>Nome (sem colchetes)</label>
              <input
                className="form-control"
                style={{ fontSize: 13, textTransform: 'uppercase' }}
                placeholder="EX: OPERADOR_SETOR"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addVar(); }}
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Valor</label>
              <input
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
            <label className="form-label">Categoria</label>
            <select className="form-control" value={tag} onChange={e => setTag(e.target.value)}>
              {TAG_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Nome do template" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
