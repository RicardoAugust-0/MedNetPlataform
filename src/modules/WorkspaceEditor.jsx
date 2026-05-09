import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { WS_ICONS, WS_CATEGORIES } from '../data.js';

function Toolbar({ editor }) {
  if (!editor) return null;

  const btn = (active, action, icon, title) => (
    <button
      className={`tb-btn${active ? ' active' : ''}`}
      title={title}
      onMouseDown={e => { e.preventDefault(); action(); }}
    >
      <i className={`ti ${icon}`}></i>
    </button>
  );

  return (
    <div className="editor-toolbar">
      {btn(editor.isActive('bold'),      () => editor.chain().focus().toggleBold().run(),      'ti-bold',         'Negrito (Ctrl+B)')}
      {btn(editor.isActive('italic'),    () => editor.chain().focus().toggleItalic().run(),    'ti-italic',       'Itálico (Ctrl+I)')}
      {btn(editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'ti-underline',    'Sublinhado (Ctrl+U)')}
      <span className="tb-sep"></span>
      {btn(editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), 'ti-h-1', 'Título 1')}
      {btn(editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), 'ti-h-2', 'Título 2')}
      {btn(editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), 'ti-h-3', 'Título 3')}
      <span className="tb-sep"></span>
      {btn(editor.isActive('bulletList'),  () => editor.chain().focus().toggleBulletList().run(),  'ti-list',         'Lista com marcadores')}
      {btn(editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), 'ti-list-numbers', 'Lista numerada')}
      {btn(editor.isActive('blockquote'),  () => editor.chain().focus().toggleBlockquote().run(),  'ti-quote',        'Citação')}
      {btn(false, () => editor.chain().focus().setHorizontalRule().run(), 'ti-minus', 'Divisor')}
    </div>
  );
}

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
      Underline,
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
        <Toolbar editor={editor} />
        <EditorContent editor={editor} className="ws-content" />
      </div>
    </>
  );
}
