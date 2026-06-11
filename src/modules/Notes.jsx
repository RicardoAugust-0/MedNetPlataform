import { useState } from 'react';
import { useNotes } from '../hooks/useNotes';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../hooks/useConfirm';

export default function Notes() {
  const { notes, loading, add, update, remove } = useNotes();
  const { profile } = useAuth();
  const confirm = useConfirm();
  const [current, setCurrent] = useState(null);
  const [search,  setSearch]  = useState('');
  const [scope,   setScope]   = useState('equipe'); // 'equipe' | 'pessoal'

  const note = notes.find(n => n.id === current);

  const visibleNotes = notes.filter(n => {
    const matchScope = scope === 'pessoal' ? n.isPersonal && n.authorId === profile?.id : !n.isPersonal;
    if (!matchScope) return false;
    if (!search) return true;
    return n.title.toLowerCase().includes(search.toLowerCase()) || n.body.toLowerCase().includes(search.toLowerCase());
  });

  const create = async () => {
    const result = await add({ title: 'Nova nota', body: '', isPersonal: scope === 'pessoal' });
    if (result) { setCurrent(result.id); setTimeout(() => document.getElementById('nt-title')?.select(), 50); }
  };

  const handleRemove = async () => {
    if (!note || !(await confirm({ title: 'Excluir nota', message: 'Tem certeza que deseja excluir esta nota?', danger: true }))) return;
    remove(note.id);
    setCurrent(visibleNotes.filter(n => n.id !== current)[0]?.id || null);
  };

  if (loading) return <div className="empty-state"><i className="ti ti-loader-2"></i> Carregando...</div>;

  return (
    <div>
      <div className="search-row">
        <div style={{ display: 'flex', gap: 4 }}>
          {['equipe','pessoal'].map(s => (
            <button key={s} className={`btn btn-sm ${scope === s ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setScope(s); setCurrent(null); }}>
              <i className={`ti ${s === 'equipe' ? 'ti-users' : 'ti-user'}`}></i>
              {s === 'equipe' ? 'Equipe' : 'Pessoal'}
            </button>
          ))}
        </div>
        <div className="search-wrap" style={{ flex: 1 }}><i className="ti ti-search"></i><input aria-label="Buscar notas" placeholder="Buscar notas..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={create}><i className="ti ti-plus"></i> Nova nota</button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        {scope === 'pessoal' ? 'Notas pessoais — visíveis apenas para você' : 'Notas da equipe — compartilhadas com todos os operadores'}
      </div>

      <div className="notes-layout">
        <div className="notes-list-wrap">
          {visibleNotes.length === 0
            ? <div className="empty-state" style={{ padding: '30px 12px' }}><i className="ti ti-note-off"></i>Sem notas</div>
            : visibleNotes.map(n => (
              <div
                key={n.id}
                className={`note-list-item ${current === n.id ? 'active' : ''}`}
                role="button"
                tabIndex={0}
                aria-selected={current === n.id}
                onClick={() => setCurrent(n.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCurrent(n.id);
                  }
                }}
              >
                <div className="note-list-title">{n.title || '(sem título)'}</div>
                <div className="note-list-date">{n.date}</div>
              </div>
            ))
          }
        </div>
        <div>
          {!note
            ? <div className="card empty-state"><i className="ti ti-file-text"></i>Selecione uma nota</div>
            : <div className="note-editor-card">
                <div className="note-editor-header">
                  <input id="nt-title" className="note-title-input" aria-label="Título da nota" value={note.title} onChange={e => update(note.id, { title: e.target.value })} />
                  <button className="btn btn-sm btn-danger" onClick={handleRemove}><i className="ti ti-trash"></i></button>
                </div>
                <textarea className="note-body-input" aria-label="Corpo da nota" value={note.body} onChange={e => update(note.id, { body: e.target.value })} placeholder="Comece a escrever..." />
              </div>
          }
        </div>
      </div>
    </div>
  );
}
