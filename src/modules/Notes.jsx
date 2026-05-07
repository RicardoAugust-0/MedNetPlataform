import { useState } from 'react';
import { useApp } from '../context';

export default function Notes() {
  const { notes, setNotes, noteNextId, setNoteNextId } = useApp();
  const [current, setCurrent] = useState(notes[0]?.id || null);
  const [search, setSearch] = useState('');

  const note = notes.find(n => n.id === current);

  const update = (id, patch) => setNotes(notes.map(n => n.id === id ? { ...n, ...patch, date: 'Hoje · agora' } : n));

  const create = () => {
    const id = noteNextId;
    setNotes([{ id, title: 'Nova nota', body: '', date: 'Hoje · agora' }, ...notes]);
    setNoteNextId(id + 1);
    setCurrent(id);
    setTimeout(() => document.getElementById('nt-title')?.select(), 50);
  };

  const remove = () => {
    if (!note || !confirm('Excluir esta nota?')) return;
    const next = notes.filter(n => n.id !== current);
    setNotes(next);
    setCurrent(next[0]?.id || null);
  };

  const filtered = notes.filter(n => !search || n.title.toLowerCase().includes(search) || n.body.toLowerCase().includes(search));

  return (
    <div>
      <div className="search-row">
        <div className="search-wrap"><i className="ti ti-search"></i><input placeholder="Buscar notas..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <button className="btn btn-primary" onClick={create}><i className="ti ti-plus"></i> Nova nota</button>
      </div>
      <div className="notes-layout">
        <div className="notes-list-wrap">
          {filtered.length === 0
            ? <div className="empty-state" style={{ padding: '30px 12px' }}><i className="ti ti-note-off"></i>Sem notas</div>
            : filtered.map(n => (
              <div key={n.id} className={`note-list-item ${current === n.id ? 'active' : ''}`} onClick={() => setCurrent(n.id)}>
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
                  <input id="nt-title" className="note-title-input" value={note.title} onChange={e => update(note.id, { title: e.target.value })} />
                  <button className="btn btn-sm btn-danger" onClick={remove}><i className="ti ti-trash"></i></button>
                </div>
                <textarea className="note-body-input" value={note.body} onChange={e => update(note.id, { body: e.target.value })} placeholder="Comece a escrever..." />
              </div>
          }
        </div>
      </div>
    </div>
  );
}
