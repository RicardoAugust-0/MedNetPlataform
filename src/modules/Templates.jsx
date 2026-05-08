import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTemplates } from '../hooks/useTemplates';

const TABS = ['todos','contato','questionario','alerta','encerramento'];
const TAB_LABELS = { todos:'Todos', contato:'Contato', questionario:'Questionário', alerta:'Alerta', encerramento:'Encerramento' };
const TAG_OPTIONS = [
  { value:'contato', label:'Contato' },
  { value:'questionario', label:'Questionário' },
  { value:'alerta', label:'Alerta' },
  { value:'encerramento', label:'Encerramento' },
];

export default function Templates() {
  const { templates, loading, add, update, remove } = useTemplates();
  const [filter, setFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);

  const counts = { todos: templates.length };
  TABS.slice(1).forEach(t => { counts[t] = templates.filter(x => x.tag === t).length; });

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

  const handleRemove = (id) => {
    if (!confirm('Excluir template?')) return;
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
          <input placeholder="Buscar templates..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setModal('new')}><i className="ti ti-plus"></i> Novo template</button>
      </div>

      <div className="tabs">
        {TABS.map(f => (
          <div key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {TAB_LABELS[f]} <span className="tab-count">{counts[f]}</span>
          </div>
        ))}
      </div>

      <div className="templates-grid">
        {list.length === 0
          ? <div className="empty-state" style={{ gridColumn: '1/-1' }}><i className="ti ti-file-off"></i>Nenhum template encontrado</div>
          : list.map(t => (
            <div className={`template-card ${t._pending ? 'opacity-50' : ''}`} key={t.id}>
              <div className="template-card-header">
                <span className={`tag tag-${t.tag}`}>{t.tagLabel}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button className="btn-icon" onClick={() => setModal(t)}><i className="ti ti-pencil"></i></button>
                  <button className="btn-icon" onClick={() => handleRemove(t.id)}><i className="ti ti-trash"></i></button>
                </div>
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

function TemplateModal({ tpl, onSave, onClose }) {
  const [tag, setTag] = useState(tpl?.tag || 'contato');
  const [name, setName] = useState(tpl?.title || '');
  const [text, setText] = useState(tpl?.text || '');

  const handleSave = () => {
    if (!name.trim() || !text.trim()) return;
    const tagLabel = TAG_OPTIONS.find(o => o.value === tag)?.label || tag;
    onSave({ tag, tagLabel, title: name.trim(), text: text.trim() });
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
          <label className="form-label">Conteúdo</label>
          <textarea className="form-control" value={text} onChange={e => setText(e.target.value)} placeholder="Use [NOME], [PLACA], [HORA] como variáveis..." />
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
