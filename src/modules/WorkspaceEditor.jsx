import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { WS_ICONS, WS_CATEGORIES } from '../data.js';

const COLORS = [
  { label: 'Preto',        value: '#1A1A1A' },
  { label: 'Cinza escuro', value: '#4A4A4A' },
  { label: 'Cinza',        value: '#888888' },
  { label: 'Azul',         value: '#0C447C' },
  { label: 'Azul claro',   value: '#2E86C1' },
  { label: 'Verde',        value: '#27500A' },
  { label: 'Vermelho',     value: '#7D2E10' },
  { label: 'Laranja',      value: '#E67E22' },
  { label: 'Roxo',         value: '#3C3489' },
  { label: 'Ciano',        value: '#085041' },
];

function ToolbarBtn({ active, action, icon, title }) {
  return (
    <button
      className={`tb-btn${active ? ' active' : ''}`}
      title={title}
      onMouseDown={e => { e.preventDefault(); action(); }}
    >
      <i className={`ti ${icon}`}></i>
    </button>
  );
}

function Toolbar({ editor }) {
  const [colorOpen, setColorOpen] = useState(false);
  if (!editor) return null;

  return (
    <div className="editor-toolbar">
      <ToolbarBtn active={editor.isActive('bold')}      action={() => editor.chain().focus().toggleBold().run()}                              icon="ti-bold"         title="Negrito (Ctrl+B)" />
      <ToolbarBtn active={editor.isActive('italic')}    action={() => editor.chain().focus().toggleItalic().run()}                            icon="ti-italic"       title="Itálico (Ctrl+I)" />
      <ToolbarBtn active={editor.isActive('underline')} action={() => editor.chain().focus().toggleUnderline().run()}                         icon="ti-underline"    title="Sublinhado (Ctrl+U)" />
      <span className="tb-sep"></span>
      <ToolbarBtn active={editor.isActive('heading', { level: 1 })} action={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} icon="ti-h-1" title="Título 1" />
      <ToolbarBtn active={editor.isActive('heading', { level: 2 })} action={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon="ti-h-2" title="Título 2" />
      <ToolbarBtn active={editor.isActive('heading', { level: 3 })} action={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} icon="ti-h-3" title="Título 3" />
      <span className="tb-sep"></span>
      <ToolbarBtn active={editor.isActive('bulletList')}  action={() => editor.chain().focus().toggleBulletList().run()}  icon="ti-list"         title="Lista com marcadores" />
      <ToolbarBtn active={editor.isActive('orderedList')} action={() => editor.chain().focus().toggleOrderedList().run()} icon="ti-list-numbers" title="Lista numerada" />
      <ToolbarBtn active={editor.isActive('blockquote')}  action={() => editor.chain().focus().toggleBlockquote().run()}  icon="ti-quote"        title="Citação" />
      <ToolbarBtn active={false}                          action={() => editor.chain().focus().setHorizontalRule().run()} icon="ti-minus"        title="Divisor" />
      <span className="tb-sep"></span>
      <div style={{ position: 'relative' }}>
        <button
          className="tb-btn"
          title="Cor do texto"
          onMouseDown={e => { e.preventDefault(); setColorOpen(v => !v); }}
        >
          <i className="ti ti-palette"></i>
        </button>
        {colorOpen && (
          <div className="ws-color-popover" onMouseDown={e => e.preventDefault()}>
            {COLORS.map(c => (
              <div
                key={c.value}
                className="ws-color-dot"
                title={c.label}
                style={{ background: c.value }}
                onClick={() => {
                  editor.chain().focus().setColor(c.value).run();
                  setColorOpen(false);
                }}
              />
            ))}
            <div
              className="ws-color-dot ws-color-dot--reset"
              title="Remover cor"
              onClick={() => { editor.chain().focus().unsetColor().run(); setColorOpen(false); }}
            >
              <i className="ti ti-x" style={{ fontSize: 10 }}></i>
            </div>
          </div>
        )}
      </div>
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
      TextStyle,
      Color,
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
