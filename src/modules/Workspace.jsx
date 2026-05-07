import { useState, useRef } from 'react';
import { useWsPages } from '../hooks/useWsPages';
import { WS_ICONS, WS_CATEGORIES } from '../data';

function escapeHtml(s) { const d = document.createElement('span'); d.textContent = s || ''; return d.innerHTML; }

export default function Workspace() {
  const { wsPages, loading, add, update, remove } = useWsPages();
  const [current, setCurrent] = useState(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState(0);
  const [newCat, setNewCat] = useState('protocolos');

  const filt = wsPages.filter(p => !search || p.title.toLowerCase().includes(search));
  const favs = filt.filter(p => p.favorite);
  const groups = WS_CATEGORIES.map(c => ({ ...c, pages: filt.filter(p => (p.category || 'protocolos') === c.id) }));
  const recents = wsPages.slice(-3).reverse();
  const page = wsPages.find(p => p.id === current);

  const createPage = async () => {
    if (!newName.trim()) return;
    setModal(false);
    await add({
      title: newName.trim(),
      icon: newIcon,
      category: newCat,
      content: `<h2>${escapeHtml(newName.trim())}</h2><p>Comece a escrever...</p>`,
    });
    setNewName(''); setNewIcon(0); setNewCat('protocolos');
  };

  const openModal = () => { setNewName(''); setNewIcon(0); setNewCat('protocolos'); setModal(true); };

  const PageItem = ({ p }) => {
    const ic = WS_ICONS[p.icon] || WS_ICONS[0];
    return (
      <div className={`ws-page-item ${current === p.id ? 'active' : ''}`} onClick={() => setCurrent(p.id)}>
        <i className={`ti ${ic.i}`} style={{ color: ic.ic }}></i>
        <span className="ws-page-label">{p.title}</span>
        {p.favorite && <i className="ti ti-star-filled ws-page-star"></i>}
      </div>
    );
  };

  const PageCard = ({ p }) => {
    const ic = WS_ICONS[p.icon] || WS_ICONS[0];
    return (
      <div className="ws-page-card" onClick={() => setCurrent(p.id)}>
        <div className="ws-card-icon" style={{ background: ic.bg, color: ic.ic }}><i className={`ti ${ic.i}`}></i></div>
        <div className="ws-card-title">{p.title}</div>
        <div className="ws-card-open">Abrir <i className="ti ti-arrow-right"></i></div>
      </div>
    );
  };

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div className="workspace-layout">
      <div className="ws-sidebar">
        <div className="ws-sidebar-header">
          <div className="ws-search">
            <i className="ti ti-search"></i>
            <input placeholder="Buscar página..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="ws-pages-list">
          {filt.length === 0
            ? <div className="empty-state" style={{ padding: '32px 12px', fontSize: 11.5 }}><i className="ti ti-file-off"></i>Nenhuma página</div>
            : <>
                {favs.length > 0 && <>
                  <div className="ws-group-label"><i className="ti ti-star-filled"></i><span>Favoritos</span><span className="ws-group-count">{favs.length}</span></div>
                  {favs.map(p => <PageItem key={p.id} p={p} />)}
                </>}
                {groups.map(g => g.pages.length > 0 && (
                  <div key={g.id}>
                    <div className="ws-group-label"><i className={`ti ${g.icon}`}></i><span>{g.label}</span><span className="ws-group-count">{g.pages.length}</span></div>
                    {g.pages.map(p => <PageItem key={p.id} p={p} />)}
                  </div>
                ))}
              </>
          }
        </div>
        <div className="ws-sidebar-footer">
          <button className="ws-btn-new" onClick={openModal}><i className="ti ti-plus"></i> Nova página</button>
        </div>
      </div>

      <div className="ws-editor">
        {!page ? (
          <div className="ws-home">
            <div className="ws-home-hero">
              <div className="ws-home-hero-text">
                <div className="ws-home-eyebrow">Workspace · Equipe Fadiga Zero</div>
                <div className="ws-home-title">Procedimentos & conhecimento operacional</div>
                <div className="ws-home-sub">{wsPages.length} páginas em {WS_CATEGORIES.length} categorias</div>
              </div>
              <button className="btn btn-primary" onClick={openModal}><i className="ti ti-plus"></i> Nova página</button>
            </div>

            <div className="ws-home-stats">
              {WS_CATEGORIES.map(c => {
                const count = wsPages.filter(p => (p.category || 'protocolos') === c.id).length;
                return (
                  <div key={c.id} className="ws-stat-card">
                    <div className="ws-stat-icon"><i className={`ti ${c.icon}`}></i></div>
                    <div><div className="ws-stat-value">{count}</div><div className="ws-stat-label">{c.label}</div></div>
                  </div>
                );
              })}
            </div>

            {favs.length > 0 && (
              <div className="ws-section-block">
                <div className="ws-section-label"><i className="ti ti-star-filled" style={{ color: 'var(--warning-500)' }}></i> Favoritos</div>
                <div className="ws-pages-grid">{favs.map(p => <PageCard key={p.id} p={p} />)}</div>
              </div>
            )}

            <div className="ws-section-block">
              <div className="ws-section-label"><i className="ti ti-clock"></i> Recentes</div>
              <div className="ws-pages-grid">{recents.map(p => <PageCard key={p.id} p={p} />)}</div>
            </div>

            {groups.map(g => g.pages.length > 0 && (
              <div key={g.id} className="ws-section-block">
                <div className="ws-section-label"><i className={`ti ${g.icon}`}></i> {g.label} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {g.pages.length}</span></div>
                <div className="ws-pages-grid">{g.pages.map(p => <PageCard key={p.id} p={p} />)}</div>
              </div>
            ))}
          </div>
        ) : (
          <PageEditor page={page} onUpdate={update} onDelete={(id) => { remove(id); setCurrent(null); }} onBack={() => setCurrent(null)} />
        )}
      </div>

      {modal && (
        <div className="modal-overlay open">
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title"><i className="ti ti-notebook"></i> Nova página</div>
              <button className="btn-icon" onClick={() => setModal(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="form-group">
              <label className="form-label">Título da página</label>
              <input className="form-control" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Procedimento de plantão" />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria</label>
              <select className="form-control" value={newCat} onChange={e => setNewCat(e.target.value)}>
                {WS_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ícone</label>
              <div className="icon-picker">
                {WS_ICONS.map((ic, i) => (
                  <div key={i} className={`icon-opt ${newIcon === i ? 'selected' : ''}`} style={{ background: ic.bg, color: ic.ic }} onClick={() => setNewIcon(i)}>
                    <i className={`ti ${ic.i}`}></i>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button className="btn" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createPage}><i className="ti ti-check"></i> Criar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PageEditor({ page, onUpdate, onDelete, onBack }) {
  const ic = WS_ICONS[page.icon] || WS_ICONS[0];
  const cat = WS_CATEGORIES.find(c => c.id === (page.category || 'protocolos'));

  const execCmd = (cmd, val = null) => { document.getElementById('ws-content')?.focus(); document.execCommand(cmd, false, val); };

  return (
    <>
      <div className="ws-editor-topbar">
        <div className="ws-card-icon" style={{ width: 28, height: 28, fontSize: 14, background: ic.bg, color: ic.ic }}><i className={`ti ${ic.i}`}></i></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cat?.label || 'Workspace'} · {page.title}</div>
        <div style={{ flex: 1 }}></div>
        <button className="btn btn-sm" title={page.favorite ? 'Desfavoritar' : 'Favoritar'} onClick={() => onUpdate(page.id, { favorite: !page.favorite })}>
          <i className={`ti ${page.favorite ? 'ti-star-filled' : 'ti-star'}`} style={page.favorite ? { color: 'var(--warning-500)' } : {}}></i>
        </button>
        <select className="form-control" style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }} value={page.category || 'protocolos'} onChange={e => onUpdate(page.id, { category: e.target.value })}>
          {WS_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={onBack}><i className="ti ti-arrow-left"></i> Voltar</button>
        <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Excluir esta página?')) onDelete(page.id); }}><i className="ti ti-trash"></i></button>
      </div>
      <div className="ws-editor-area">
        <input className="ws-page-title-input" value={page.title} onChange={e => onUpdate(page.id, { title: e.target.value })} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>Última edição agora · {cat?.label}</div>
        <hr className="ws-divider" />
        <div className="editor-toolbar">
          {[['bold','ti-bold','Negrito'],['italic','ti-italic','Itálico'],['underline','ti-underline','Sublinhado']].map(([cmd,icon,title]) => (
            <button key={cmd} className="tb-btn" title={title} onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}><i className={`ti ${icon}`}></i></button>
          ))}
          <span className="tb-sep"></span>
          {[['h1','ti-h-1'],['h2','ti-h-2'],['h3','ti-h-3']].map(([tag,icon]) => (
            <button key={tag} className="tb-btn" onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', tag); }}><i className={`ti ${icon}`}></i></button>
          ))}
          <span className="tb-sep"></span>
          <button className="tb-btn" title="Lista" onMouseDown={e => { e.preventDefault(); execCmd('insertUnorderedList'); }}><i className="ti ti-list"></i></button>
          <button className="tb-btn" title="Lista numerada" onMouseDown={e => { e.preventDefault(); execCmd('insertOrderedList'); }}><i className="ti ti-list-numbers"></i></button>
          <button className="tb-btn" title="Citação" onMouseDown={e => { e.preventDefault(); execCmd('formatBlock', 'blockquote'); }}><i className="ti ti-quote"></i></button>
          <span className="tb-sep"></span>
          <button className="tb-btn" title="Divisor" onMouseDown={e => { e.preventDefault(); execCmd('insertHorizontalRule'); }}><i className="ti ti-minus"></i></button>
        </div>
        <div
          id="ws-content"
          className="ws-content"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Comece a escrever..."
          dangerouslySetInnerHTML={{ __html: page.content || '' }}
          onInput={e => onUpdate(page.id, { content: e.currentTarget.innerHTML })}
        />
      </div>
    </>
  );
}
