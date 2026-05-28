import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle, Color, FontSize } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { Image } from '@tiptap/extension-image';
import { useAuth } from '../auth/AuthContext.jsx';
import { uploadImage } from '../lib/uploadImage.js';
import { WS_ICONS, WS_CATEGORIES } from '../data.js';
import { useToast } from '../hooks/useToast.jsx';

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

const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px'];

const ALLOWED_PASTE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function ToolbarBtn({ active, action, icon, title, disabled }) {
  return (
    <button
      className={`tb-btn${active ? ' active' : ''}`}
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); if (!disabled) action(); }}
    >
      <i className={`ti ${icon}`}></i>
    </button>
  );
}

function Toolbar({ editor, onImageClick, uploading }) {
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    if (!colorOpen) return;
    const close = () => setColorOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [colorOpen]);

  if (!editor) return null;

  return (
    <>
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
            <div className="ws-color-popover" onMouseDown={e => e.stopPropagation()}>
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
        <span className="tb-sep"></span>
        <select
          className="tb-font-size"
          title="Tamanho da fonte"
          value={editor.getAttributes('textStyle').fontSize || '14px'}
          onChange={e => editor.chain().focus().setFontSize(e.target.value).run()}
          onMouseDown={e => e.stopPropagation()}
        >
          {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="tb-sep"></span>
        <ToolbarBtn
          active={editor.isActive('table')}
          action={() => {
            if (!editor.isActive('table')) {
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            }
          }}
          icon="ti-table"
          title="Inserir tabela"
        />
        <span className="tb-sep"></span>
        <ToolbarBtn
          active={false}
          action={onImageClick}
          icon={uploading ? 'ti-loader-2' : 'ti-photo'}
          title="Inserir imagem"
          disabled={uploading}
        />
      </div>
      {editor.isActive('table') && (
        <div className="ws-table-toolbar">
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>Tabela:</span>
          <ToolbarBtn active={false} action={() => editor.chain().focus().addColumnBefore().run()} icon="ti-column-insert-left"  title="Inserir coluna antes" />
          <ToolbarBtn active={false} action={() => editor.chain().focus().addColumnAfter().run()}  icon="ti-column-insert-right" title="Inserir coluna depois" />
          <ToolbarBtn active={false} action={() => editor.chain().focus().deleteColumn().run()}    icon="ti-column-remove"       title="Remover coluna" />
          <span className="tb-sep"></span>
          <ToolbarBtn active={false} action={() => editor.chain().focus().addRowBefore().run()}    icon="ti-row-insert-top"      title="Inserir linha antes" />
          <ToolbarBtn active={false} action={() => editor.chain().focus().addRowAfter().run()}     icon="ti-row-insert-bottom"   title="Inserir linha depois" />
          <ToolbarBtn active={false} action={() => editor.chain().focus().deleteRow().run()}       icon="ti-row-remove"          title="Remover linha" />
          <span className="tb-sep"></span>
          <ToolbarBtn active={false} action={() => editor.chain().focus().deleteTable().run()}     icon="ti-trash"               title="Excluir tabela" />
        </div>
      )}
    </>
  );
}

export default function PageEditor({ page, onUpdate, onDelete, onBack }) {
  const ic = WS_ICONS[page.icon] || WS_ICONS[0];
  const cat = WS_CATEGORIES.find(c => c.id === (page.category || 'protocolos'));

  const { profile } = useAuth();
  const canEdit = profile?.role === 'admin' || profile?.role === 'lider';
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const [saveStatus, setSaveStatus] = useState('idle');
  const saveTimer = useRef(null);

  const onUpdateRef = useRef(null);
  const handleImageFileRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontSize,
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Image,
      Placeholder.configure({ placeholder: 'Comece a escrever...' }),
    ],
    content: page.content || '',
    editable: canEdit,
    onUpdate: ({ editor }) => {
      if (!canEdit) return;
      onUpdateRef.current?.(editor.getHTML());
    },
    editorProps: {
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(i => ALLOWED_PASTE_TYPES.includes(i.type));
        if (!imageItem) return false;
        handleImageFileRef.current?.(imageItem.getAsFile());
        return true;
      },
    },
  });

  useLayoutEffect(() => {
    onUpdateRef.current = (html) => {
      setSaveStatus('saving');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveStatus('saved'), 1500);
      onUpdate(page.id, { content: html });
    };
    handleImageFileRef.current = async (file) => {
      if (!file) return;
      if (!profile?.id) {
        toast('Usuário não autenticado', 'error');
        return;
      }
      setUploading(true);
      try {
        const url = await uploadImage(file, profile.id);
        editor?.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        toast(err?.message || 'Erro ao enviar imagem', 'error');
      } finally {
        setUploading(false);
      }
    };
  });

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  useEffect(() => {
    if (!iconPickerOpen) return;
    const close = () => setIconPickerOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [iconPickerOpen]);


  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleImageFileRef.current?.(f);
          e.target.value = '';
        }}
      />
      <div className="ws-editor-topbar">
        <div style={{ position: 'relative' }}>
          <div
            className={`ws-card-icon ${canEdit ? 'ws-icon-clickable' : ''}`}
            style={{ width: 28, height: 28, fontSize: 14, background: ic.bg, color: ic.ic, cursor: canEdit ? 'pointer' : 'default' }}
            onClick={() => canEdit && setIconPickerOpen(v => !v)}
            title={canEdit ? "Trocar ícone" : ""}
          >
            <i className={`ti ${ic.i}`}></i>
          </div>
          {iconPickerOpen && canEdit && (() => {
            const currentIcon = page.icon ?? 0;
            return (
              <div className="ws-icon-popover" onMouseDown={e => e.stopPropagation()}>
                <div className="icon-picker">
                  {WS_ICONS.map((icon, i) => (
                    <div
                      key={i}
                      className={`icon-opt ${currentIcon === i ? 'selected' : ''}`}
                      style={{ background: icon.bg, color: icon.ic }}
                      onClick={() => { onUpdate(page.id, { icon: i }); setIconPickerOpen(false); }}
                    >
                      <i className={`ti ${icon.i}`}></i>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
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
        <button className="btn btn-sm" title={page.favorite ? 'Desfavoritar' : 'Favoritar'} onClick={() => onUpdate(page.id, { favorite: !page.favorite })} disabled={!canEdit}>
          <i className={`ti ${page.favorite ? 'ti-star-filled' : 'ti-star'}`} style={page.favorite ? { color: 'var(--warning-500)' } : {}}></i>
        </button>
        <select className="form-control" style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }} value={page.category || 'protocolos'} onChange={e => onUpdate(page.id, { category: e.target.value })} disabled={!canEdit}>
          {WS_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <button className="btn btn-sm" onClick={onBack}><i className="ti ti-arrow-left"></i> Voltar</button>
        {canEdit && (
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(page.id)}><i className="ti ti-trash"></i></button>
        )}
      </div>
      <div className="ws-editor-area">
        <input className="ws-page-title-input" value={page.title} onChange={e => onUpdate(page.id, { title: e.target.value })} disabled={!canEdit} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>Última edição agora · {cat?.label}</div>
        <hr className="ws-divider" />
        {canEdit && (
          <Toolbar editor={editor} onImageClick={() => fileInputRef.current?.click()} uploading={uploading} />
        )}
        <EditorContent editor={editor} className="ws-content" />
      </div>
    </>
  );
}
