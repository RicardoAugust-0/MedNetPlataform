import { useState } from 'react';
import { useLinks } from '../hooks/useLinks';

export default function Links() {
  const { links, loading, add, remove } = useLinks();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);

  const filt = links.filter(l => !search || l.name.toLowerCase().includes(search) || (l.desc || '').toLowerCase().includes(search));
  const groups = [{ id:'interno', label:'Sistemas internos' }, { id:'externo', label:'Ferramentas externas' }];

  const handleRemove = (id) => {
    if (!confirm('Excluir link?')) return;
    remove(id);
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
                <a key={l.id} className={`link-card ${l._pending ? 'opacity-50' : ''}`} href={l.url} target="_blank" rel="noreferrer">
                  <div className="link-icon" style={{ background: l.bg, color: l.ic }}><i className={`ti ${l.icon}`}></i></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="link-name">{l.name}</div>
                    <div className="link-desc">{l.desc}</div>
                  </div>
                  <button className="btn-icon" onClick={e => { e.preventDefault(); e.stopPropagation(); handleRemove(l.id); }}>
                    <i className="ti ti-trash"></i>
                  </button>
                </a>
              ))}
            </div>
          </div>
        );
      })}

      {!filt.length && <div className="empty-state"><i className="ti ti-link-off"></i>Nenhum link</div>}

      {modal && <LinkModal onSave={(d) => { add(d); setModal(false); }} onClose={() => setModal(false)} />}
    </div>
  );
}

function LinkModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [url, setUrl] = useState('');
  const [section, setSection] = useState('interno');

  return (
    <div className="modal-overlay open">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title"><i className="ti ti-link"></i> Novo link</div>
          <button className="btn-icon" onClick={onClose}><i className="ti ti-x"></i></button>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Nome</label><input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sistema Fadiga" /></div>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-control" value={section} onChange={e => setSection(e.target.value)}>
              <option value="interno">Interno</option><option value="externo">Externo</option>
            </select>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Descrição</label><input className="form-control" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Breve descrição" /></div>
        <div className="form-group"><label className="form-label">URL</label><input className="form-control" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." /></div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:6 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => { if (name && url) onSave({name,desc,url,section}); }}><i className="ti ti-check"></i> Adicionar</button>
        </div>
      </div>
    </div>
  );
}
