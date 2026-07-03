// deno-lint-ignore-file
import { useState } from 'react';
import Modal from '../components/Modal';
import { useLinks, PALETTE, AVAILABLE_ICONS } from '../hooks/useLinks';
import { useDragReorder } from '../hooks/useDragReorder';
import { useConfirm } from "../hooks/useConfirm.jsx";
import { useAuth } from '../auth/AuthContext.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function Links() {
  const { links, loading, add, update, remove, reorder } = useLinks();
  const { profile } = useAuth();
  const canEdit = profile?.role === 'admin' || profile?.role === 'lider';
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

  const { getItemProps: getDragProps } = useDragReorder(links, reorder, l => l.id);

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div>
      <div className="search-row">
        <div className="search-wrap">
          <i className="ti ti-search"></i>
          <input aria-label="Buscar links" placeholder="Buscar links..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setModal(true)}><i className="ti ti-plus"></i> Novo link</button>
        )}
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
                  {...getDragProps(l, canEdit, { label: l.name })}
                >
                  <a className="link-card" href={l.url} target="_blank" rel="noreferrer" aria-label={`Link para ${l.name} - ${l.desc || ''}`}>
                    <div className="link-icon" style={{ background: l.bg, color: l.ic }}><i className={`ti ${l.icon}`}></i></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="link-name">{l.name}</div>
                      <div className="link-desc">{l.desc}</div>
                    </div>
                    {canEdit && (
                      <div className="link-actions">
                        <button className="btn-icon" onClick={e => { e.preventDefault(); e.stopPropagation(); setEditingLink(l); }} aria-label={`Editar link ${l.name}`}>
                          <i className="ti ti-pencil"></i>
                        </button>
                        <button className="btn-icon btn-icon-danger" onClick={e => { e.preventDefault(); e.stopPropagation(); handleRemove(l.id); }} aria-label={`Excluir link ${l.name}`}>
                          <i className="ti ti-trash"></i>
                        </button>
                      </div>
                    )}
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {!filt.length && <EmptyState icon="ti-link-off" msg="Nenhum link" />}

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
    <Modal open onClose={onClose} style={{ maxWidth: 500 }} labelledBy="link-modal-title">
        <div className="modal-header">
          <div className="modal-title" id="link-modal-title"><i className="ti ti-link"></i> {initialData ? 'Editar link' : 'Novo link'}</div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="modal-body">
          <div className="form-row" style={{ gridTemplateColumns: '2fr 1fr' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="link-name">Nome</label>
              <input id="link-name" className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sistema Fadiga" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="link-section">Categoria</label>
              <select id="link-section" className="form-control" value={section} onChange={e => setSection(e.target.value)}>
                <option value="interno">Interno</option>
                <option value="externo">Externo</option>
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label" htmlFor="link-desc">Descrição</label>
            <input id="link-desc" className="form-control" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Breve descrição" />
          </div>
          
          <div className="form-group">
            <label className="form-label" htmlFor="link-url">URL</label>
            <input id="link-url" className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="form-group">
            <label className="form-label">Personalização (Logo)</label>
            <div className="personalization-grid">
              <div className="icon-selector">
                <span className="form-label-sub">Ícone</span>
                <div className="icon-list">
                  {AVAILABLE_ICONS.map(i => (
                    <div 
                      key={i} 
                      className={`icon-option ${icon === i ? 'active' : ''}`} 
                      role="button"
                      tabIndex={0}
                      aria-label={`Ícone ${i}`}
                      aria-pressed={icon === i}
                      onClick={() => setIcon(i)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setIcon(i);
                        }
                      }}
                    >
                      <i className={`ti ${i}`}></i>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="color-selector">
                <span className="form-label-sub">Tema</span>
                <div className="palette-list">
                  {PALETTE.map((p, idx) => (
                    <div 
                      key={idx} 
                      className={`color-option ${bg === p.bg ? 'active' : ''}`}
                      style={{ background: p.bg, color: p.ic }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Cor do tema ${idx + 1}`}
                      aria-pressed={bg === p.bg}
                      onClick={() => { setBg(p.bg); setIc(p.ic); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setBg(p.bg);
                          setIc(p.ic);
                        }
                      }}
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
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { if (name && url) onSave({name,desc,url,section,icon,bg,ic}); }}>
            <i className="ti ti-check"></i> {initialData ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
    </Modal>
  );
}
