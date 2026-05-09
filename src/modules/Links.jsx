import { useState } from 'react';
import { useLinks, PALETTE, AVAILABLE_ICONS } from '../hooks/useLinks';
import { useConfirm } from "../hooks/useConfirm.jsx";

export default function Links() {
  const { links, loading, add, update, remove, reorder } = useLinks();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);

  const filt = links.filter(l => !search || l.name.toLowerCase().includes(search) || (l.desc || '').toLowerCase().includes(search));
  const groups = [{ id:'interno', label:'Sistemas internos' }, { id:'externo', label:'Ferramentas externas' }];

  const handleRemove = async (id) => {
    if (!(await confirm({ title: 'Excluir', message: 'Excluir este link?', danger: true }))) return;
    remove(id);
  };

  const handleDragStart = (e, link) => {
    e.dataTransfer.setData('linkId', link.id);
    e.currentTarget.classList.add('dragging');
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, targetLink) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('linkId');
    if (draggedId === targetLink.id) return;

    const newList = [...links];
    const draggedIdx = newList.findIndex(l => l.id === draggedId);
    const targetIdx = newList.findIndex(l => l.id === targetLink.id);

    const [draggedItem] = newList.splice(draggedIdx, 1);
    newList.splice(targetIdx, 0, draggedItem);

    reorder(newList);
  };

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div>
      <div className="search-row">
        <div className="search-wrap">
          <i className="ti ti-search"></i>
          <input placeholder="Buscar links..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}><i className="ti ti-plus"></i> Novo link</button>
      </div>

      {groups.map(g => {
        const list = filt.filter(l => l.section === g.id);
        if (!list.length) return null;
        return (
          <div className="links-section" key={g.id}>
            <div className="links-section-header">
              <div className="links-section-title">{g.label}</div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{list.length} link{list.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="links-grid">
              {list.map(l => (
                <div 
                  key={l.id} 
                  className={`link-card-wrap ${l._pending ? 'opacity-50' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, l)}
                  onDragEnd={handleDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, l)}
                >
                  <a className="link-card" href={l.url} target="_blank" rel="noreferrer">
                    <div className="link-icon" style={{ background: l.bg, color: l.ic }}><i className={`ti ${l.icon}`}></i></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="link-name">{l.name}</div>
                      <div className="link-desc">{l.desc}</div>
                    </div>
                    <div className="link-actions">
                      <button className="btn-icon" onClick={e => { e.preventDefault(); e.stopPropagation(); setEditingLink(l); }}>
                        <i className="ti ti-pencil"></i>
                      </button>
                      <button className="btn-icon btn-icon-danger" onClick={e => { e.preventDefault(); e.stopPropagation(); handleRemove(l.id); }}>
                        <i className="ti ti-trash"></i>
                      </button>
                    </div>
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!filt.length && <div className="empty-state"><i className="ti ti-link-off"></i>Nenhum link</div>}

      {(modal || editingLink) && (
        <LinkModal 
          initialData={editingLink}
          onSave={(d) => { 
            if (editingLink) update(editingLink.id, d);
            else add(d);
            setModal(false);
            setEditingLink(null);
          }} 
          onClose={() => { setModal(false); setEditingLink(null); }} 
        />
      )}
    </div>
  );
}

function LinkModal({ initialData, onSave, onClose }) {
  const [name, setName] = useState(initialData?.name || '');
  const [desc, setDesc] = useState(initialData?.desc || '');
  const [url, setUrl] = useState(initialData?.url || '');
  const [section, setSection] = useState(initialData?.section || 'interno');
  const [icon, setIcon] = useState(initialData?.icon || 'ti-link');
  const [bg, setBg] = useState(initialData?.bg || PALETTE[0].bg);
  const [ic, setIc] = useState(initialData?.ic || PALETTE[0].ic);

  return (
    <div className="modal-overlay open">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div className="modal-title"><i className="ti ti-link"></i> {initialData ? 'Editar link' : 'Novo link'}</div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Nome</label>
              <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sistema Fadiga" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Categoria</label>
              <select className="form-control" value={section} onChange={e => setSection(e.target.value)}>
                <option value="interno">Interno</option>
                <option value="externo">Externo</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Descrição</label>
            <input className="form-control" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Breve descrição" />
          </div>
          
          <div className="form-group">
            <label className="form-label">URL</label>
            <input className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="form-group">
            <label className="form-label">Personalização (Logo)</label>
            <div className="personalization-grid">
              <div className="icon-selector">
                <label className="form-label-sub">Ícone</label>
                <div className="icon-list">
                  {AVAILABLE_ICONS.map(i => (
                    <div 
                      key={i} 
                      className={`icon-option ${icon === i ? 'active' : ''}`} 
                      onClick={() => setIcon(i)}
                    >
                      <i className={`ti ${i}`}></i>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="color-selector">
                <label className="form-label-sub">Tema</label>
                <div className="palette-list">
                  {PALETTE.map((p, idx) => (
                    <div 
                      key={idx} 
                      className={`color-option ${bg === p.bg ? 'active' : ''}`}
                      style={{ background: p.bg, color: p.ic }}
                      onClick={() => { setBg(p.bg); setIc(p.ic); }}
                    >
                      <i className={`ti ${icon}`}></i>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="preview-wrap">
             <label className="form-label">Pré-visualização</label>
             <div className="link-card" style={{ pointerEvents: 'none' }}>
                <div className="link-icon" style={{ background: bg, color: ic }}><i className={`ti ${icon}`}></i></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="link-name">{name || 'Nome do Link'}</div>
                  <div className="link-desc">{desc || 'Descrição do link...'}</div>
                </div>
             </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { if (name && url) onSave({name,desc,url,section,icon,bg,ic}); }}>
            <i className="ti ti-check"></i> {initialData ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
