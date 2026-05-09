import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { WS_ICONS, WS_CATEGORIES } from '../data.js';

export default function PageEditor({ page, onUpdate, onDelete, onBack }) {
  const ic = WS_ICONS[page.icon] || WS_ICONS[0];
  const cat = WS_CATEGORIES.find(c => c.id === (page.category || 'protocolos'));

  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimer = useRef(null);

  const onUpdateRef = useRef(null);
  useLayoutEffect(() => {
    onUpdateRef.current = (html) => {
      setSaveStatus('saving');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('saved'), 1500);
      onUpdate(page.id, { content: html });
    };
  });

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Comece a escrever...' }),
    ],
    content: page.content || '',
    onUpdate: ({ editor }) => onUpdateRef.current?.(editor.getHTML()),
  });


  return (
    <>
      <div className="ws-editor-topbar">
        <div className="ws-card-icon" style={{ width: 28, height: 28, fontSize: 14, background: ic.bg, color: ic.ic }}>
          <i className={`ti ${ic.i}`}></i>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cat?.label || 'Workspace'} · {page.title}</div>
        {saveStatus === 'saving' && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <i className="ti ti-loader-2" style={{ marginRight: 3 }}></i>Salvando...
          </div>
        )}
        {saveStatus === 'saved' && (
          <div style={{ fontSize: 11, color: 'var(--success-600)' }}>
            <i className="ti ti-check" style={{ marginRight: 3 }}></i>Salvo
          </div>
        )}
        <div style={{ flex: 1 }}></div>
        <button className="btn btn-sm" title={page.favorite ? 'Desfavoritar' : 'Favoritar'} onClick={() => onUpdate(page.id, { favorite: !page.favorite })}>
          <i className={`ti ${page.favorite ? 'ti-star-filled' : 'ti-star'}`} style={page.favorite ? { color: 'var(--warning-500)' } : {}}></i>
        </button>
        <select className="form-control" style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }} value={page.category || 'protocolos'} onChange={e => onUpdate(page.id, { category: e.target.value })}>
          {WS_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={onBack}><i className="ti ti-arrow-left"></i> Voltar</button>
        <button className="btn btn-sm btn-danger" onClick={() => onDelete(page.id)}><i className="ti ti-trash"></i></button>
      </div>
      <div className="ws-editor-area">
        <input className="ws-page-title-input" value={page.title} onChange={e => onUpdate(page.id, { title: e.target.value })} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>Última edição agora · {cat?.label}</div>
        <hr className="ws-divider" />
        <EditorContent editor={editor} className="ws-content" />
      </div>
    </>
  );
}
