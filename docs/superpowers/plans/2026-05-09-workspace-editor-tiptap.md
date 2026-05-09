# Workspace Editor TipTap Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `contentEditable` nativo por TipTap para corrigir o bug do cursor e adicionar toolbar rica (cores, tamanho, tabela, imagem), auto-save com indicador visual e edição de ícone inline.

**Architecture:** `PageEditor` migra para TipTap usando `useEditor`. O estado do editor fica no TipTap (não no React state), eliminando o re-render que causava o cursor saltar. Um `onUpdateRef` pattern garante que o callback de save sempre usa os valores mais recentes de `page.id` e `onUpdate` sem recriar o editor. `key={page.id}` no componente pai garante remount limpo ao trocar de página.

**Tech Stack:** React 19, TipTap v2, Supabase Storage, Vite, CSS vanilla

---

## File Structure

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| **Create** | `src/modules/WorkspaceEditor.jsx` | PageEditor completo com TipTap, toolbar, auto-save, icon picker |
| **Create** | `src/lib/uploadImage.js` | Upload de imagem para Supabase Storage (função pura, testável) |
| **Modify** | `src/modules/Workspace.jsx` | Remover `PageEditor` inline, importar de `WorkspaceEditor.jsx`, adicionar `key={page.id}` |
| **Modify** | `src/styles/modules.css` | Estilos TipTap `.ProseMirror`, toolbar ativa, color popover, table toolbar, icon popover |

---

### Task 1: Instalar dependências TipTap

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar pacotes**

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-font-size @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-image @tiptap/extension-placeholder
```

- [ ] **Step 2: Verificar instalação**

```bash
node -e "require('@tiptap/react'); require('@tiptap/starter-kit'); console.log('OK')"
```

Esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install tiptap dependencies for workspace editor"
```

---

### Task 2: Criar bucket Supabase Storage

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_workspace_images_bucket.sql` (ou aplicar via MCP)

- [ ] **Step 1: Criar migration SQL**

Criar o arquivo `supabase/migrations/$(date +%Y%m%d%H%M%S)_workspace_images_bucket.sql` com o conteúdo:

```sql
-- Criar bucket workspace-images (público para leitura, auth para upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-images',
  'workspace-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Leitura pública
CREATE POLICY "workspace_images_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workspace-images');

-- Upload autenticado
CREATE POLICY "workspace_images_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'workspace-images');

-- Dono pode deletar
CREATE POLICY "workspace_images_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'workspace-images' AND owner = auth.uid()::text);
```

- [ ] **Step 2: Aplicar migration via MCP Supabase**

Usar ferramenta `mcp__plugin_supabase_supabase__apply_migration` com o SQL acima, ou rodar via `supabase db push` se usando CLI local.

- [ ] **Step 3: Verificar bucket existe**

```sql
SELECT id, name, public FROM storage.buckets WHERE id = 'workspace-images';
```

Esperado: 1 row com `public = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add workspace-images storage bucket migration"
```

---

### Task 3: Utilitário uploadImage

**Files:**
- Create: `src/lib/uploadImage.js`

- [ ] **Step 1: Criar `src/lib/uploadImage.js`**

```javascript
import { supabase } from '../supabase.js';

export async function uploadImage(file, userId) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('workspace-images')
    .upload(path, file, { contentType: file.type });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage
    .from('workspace-images')
    .getPublicUrl(path);

  return data.publicUrl;
}
```

- [ ] **Step 2: Testar manualmente que a função existe**

```bash
node -e "const { uploadImage } = require('./src/lib/uploadImage.js'); console.log(typeof uploadImage)"
```

Esperado: `function`

(Teste de integração real requer auth Supabase ativo — verificar na Task 10 via uso manual no browser.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/uploadImage.js
git commit -m "feat: add uploadImage utility for Supabase Storage"
```

---

### Task 4: WorkspaceEditor.jsx — base TipTap (corrige bug do cursor)

Esta task cria o arquivo base e corrige o bug principal. Features extras (cores, tabelas, etc.) são adicionadas nas tasks seguintes.

**Files:**
- Create: `src/modules/WorkspaceEditor.jsx`
- Modify: `src/modules/Workspace.jsx` (linhas 187–239 + linha 144)
- Modify: `src/styles/modules.css`

- [ ] **Step 1: Criar `src/modules/WorkspaceEditor.jsx`**

```jsx
import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { WS_ICONS, WS_CATEGORIES } from '../data.js';

export default function PageEditor({ page, onUpdate, onDelete, onBack }) {
  const ic = WS_ICONS[page.icon] || WS_ICONS[0];
  const cat = WS_CATEGORIES.find(c => c.id === (page.category || 'protocolos'));

  const onUpdateRef = useRef(null);
  onUpdateRef.current = (html) => onUpdate(page.id, { content: html });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Comece a escrever...' }),
    ],
    content: page.content || '',
    onUpdate: ({ editor }) => onUpdateRef.current?.(editor.getHTML()),
  });

  useEffect(() => () => editor?.destroy(), []);

  return (
    <>
      <div className="ws-editor-topbar">
        <div className="ws-card-icon" style={{ width: 28, height: 28, fontSize: 14, background: ic.bg, color: ic.ic }}>
          <i className={`ti ${ic.i}`}></i>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cat?.label || 'Workspace'} · {page.title}</div>
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
```

- [ ] **Step 2: Atualizar `src/modules/Workspace.jsx`**

2a. Adicionar import no topo (após linha 5):

```jsx
import PageEditor from './WorkspaceEditor.jsx';
```

2b. Apagar as linhas 187–239 (a função `PageEditor` inteira):

```jsx
function PageEditor({ page, onUpdate, onDelete, onBack }) {
  // ... apagar tudo até o final do arquivo
}
```

2c. Na linha 144, adicionar `key={page.id}`:

```jsx
<PageEditor key={page.id} page={page} onUpdate={update} onDelete={handleDelete} onBack={() => setCurrent(null)} />
```

- [ ] **Step 3: Atualizar CSS em `src/styles/modules.css`**

Substituir o bloco `.ws-content { ... }` e `.ws-content:empty::before { ... }` existentes por:

```css
.ws-content .ProseMirror {
  outline: none;
  min-height: 320px;
  font-size: 14.5px;
  line-height: 1.85;
  color: var(--text-primary);
}
.ws-content .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  pointer-events: none;
  float: left;
  height: 0;
}
```

Manter as regras `.ws-content h1`, `.ws-content h2`, `.ws-content h3`, `.ws-content ul`, `.ws-content blockquote`, `.ws-content hr` — elas continuam funcionando pois os elementos ficam dentro de `.ws-content`.

- [ ] **Step 4: Verificar no browser**

```bash
npm run dev
```

Abrir a página Workspace, abrir uma página existente, digitar texto. O cursor NÃO deve mais saltar. Verificar que o conteúdo existente carrega corretamente.

- [ ] **Step 5: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/modules/Workspace.jsx src/styles/modules.css
git commit -m "feat: replace contentEditable with TipTap to fix cursor jump bug"
```

---

### Task 5: Auto-save com indicador visual

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`

- [ ] **Step 1: Adicionar estado e ref de save**

No topo de `PageEditor`, após as declarações de `ic` e `cat`:

```jsx
const [saveStatus, setSaveStatus] = useState('idle');
const saveTimer = useRef(null);
```

Adicionar import de `useState` no topo do arquivo:

```jsx
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Atualizar `onUpdateRef` para acionar o indicador**

```jsx
onUpdateRef.current = (html) => {
  setSaveStatus('saving');
  clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(() => setSaveStatus('saved'), 1500);
  onUpdate(page.id, { content: html });
};
```

- [ ] **Step 3: Adicionar indicador no topbar**

No `ws-editor-topbar`, antes do `<div style={{ flex: 1 }}>`:

```jsx
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
```

- [ ] **Step 4: Verificar no browser**

Digitar texto — "Salvando..." aparece imediatamente, "Salvo ✓" após ~1,5s.

- [ ] **Step 5: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx
git commit -m "feat: add auto-save visual indicator to workspace editor"
```

---

### Task 6: Toolbar — formatação completa

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`
- Modify: `src/styles/modules.css`

- [ ] **Step 1: Adicionar extensão Underline nos imports de WorkspaceEditor.jsx**

```jsx
import Underline from '@tiptap/extension-underline';
```

- [ ] **Step 2: Adicionar `Underline` na lista de extensões do `useEditor`**

```jsx
extensions: [
  StarterKit,
  Underline,
  Placeholder.configure({ placeholder: 'Comece a escrever...' }),
],
```

- [ ] **Step 3: Adicionar componente `Toolbar` antes de `PageEditor`**

```jsx
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
      {btn(editor.isActive('bulletList'),    () => editor.chain().focus().toggleBulletList().run(),    'ti-list',         'Lista com marcadores')}
      {btn(editor.isActive('orderedList'),   () => editor.chain().focus().toggleOrderedList().run(),   'ti-list-numbers', 'Lista numerada')}
      {btn(editor.isActive('blockquote'),    () => editor.chain().focus().toggleBlockquote().run(),    'ti-quote',        'Citação')}
      {btn(false,                            () => editor.chain().focus().setHorizontalRule().run(),   'ti-minus',        'Divisor')}
    </div>
  );
}
```

- [ ] **Step 4: Usar `<Toolbar editor={editor} />` em `PageEditor`**

Dentro do `ws-editor-area`, após `<hr className="ws-divider" />` e antes de `<EditorContent>`:

```jsx
<Toolbar editor={editor} />
<EditorContent editor={editor} className="ws-content" />
```

Remover o `<div className="editor-toolbar">` manual que existia no código original (se ainda houver).

- [ ] **Step 5: Adicionar estilo `.tb-btn.active` em `src/styles/modules.css`**

Após `.tb-btn:hover { ... }`:

```css
.tb-btn.active { background: var(--surface-2); color: var(--text-primary); }
```

- [ ] **Step 6: Verificar no browser**

Selecionar texto e clicar Bold/Italic/Underline. Botões devem destacar quando ativos. Headings e listas devem funcionar.

- [ ] **Step 7: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/styles/modules.css
git commit -m "feat: add full formatting toolbar to workspace editor"
```

---

### Task 7: Toolbar — paleta de cores

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`
- Modify: `src/styles/modules.css`

- [ ] **Step 1: Adicionar imports de Color e TextStyle**

```jsx
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
```

- [ ] **Step 2: Adicionar extensões no `useEditor`**

```jsx
extensions: [
  StarterKit,
  Underline,
  TextStyle,
  Color,
  Placeholder.configure({ placeholder: 'Comece a escrever...' }),
],
```

- [ ] **Step 3: Adicionar constante `COLORS` após os imports**

```jsx
const COLORS = [
  { label: 'Preto',       value: '#1A1A1A' },
  { label: 'Cinza escuro',value: '#4A4A4A' },
  { label: 'Cinza',       value: '#888888' },
  { label: 'Azul',        value: '#0C447C' },
  { label: 'Azul claro',  value: '#2E86C1' },
  { label: 'Verde',       value: '#27500A' },
  { label: 'Vermelho',    value: '#7D2E10' },
  { label: 'Laranja',     value: '#E67E22' },
  { label: 'Roxo',        value: '#3C3489' },
  { label: 'Ciano',       value: '#085041' },
];
```

- [ ] **Step 4: Adicionar estado `colorOpen` em `Toolbar` e o botão de cor**

Modificar a função `Toolbar` para aceitar e usar estado de popover de cor:

```jsx
function Toolbar({ editor }) {
  const [colorOpen, setColorOpen] = useState(false);
  if (!editor) return null;

  const btn = (active, action, icon, title) => ( /* ... mesmo de antes ... */ );

  return (
    <div className="editor-toolbar">
      {/* formatação e headings — igual Task 6 */}
      {btn(editor.isActive('bold'), ...)}
      {/* ... */}
      <span className="tb-sep"></span>
      {/* Cor */}
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
              className="ws-color-dot"
              title="Remover cor"
              style={{ background: 'none', border: '1px solid var(--border)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
```

Adicionar `import { useState } from 'react'` em `Toolbar` — ou mover o import para o topo do arquivo se ainda não estiver lá.

- [ ] **Step 5: Adicionar CSS do popover em `src/styles/modules.css`**

```css
.ws-color-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 100;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  width: 130px;
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,.12));
}
.ws-color-dot {
  width: 20px; height: 20px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.1s;
}
.ws-color-dot:hover { transform: scale(1.2); }
```

- [ ] **Step 6: Verificar no browser**

Selecionar texto, clicar paleta, escolher cor. Texto deve mudar de cor. Clicar "×" deve remover a cor.

- [ ] **Step 7: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/styles/modules.css
git commit -m "feat: add text color palette to workspace editor toolbar"
```

---

### Task 8: Toolbar — tamanho de fonte

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`

- [ ] **Step 1: Adicionar import FontSize**

```jsx
import FontSize from '@tiptap/extension-font-size';
```

- [ ] **Step 2: Adicionar extensão no `useEditor`**

```jsx
extensions: [
  StarterKit,
  Underline,
  TextStyle,
  Color,
  FontSize,
  Placeholder.configure({ placeholder: 'Comece a escrever...' }),
],
```

- [ ] **Step 3: Adicionar constante `FONT_SIZES` após `COLORS`**

```jsx
const FONT_SIZES = ['12px', '14px', '16px', '18px', '24px'];
```

- [ ] **Step 4: Adicionar `<select>` de tamanho em `Toolbar`, após o botão de cor**

Dentro do `return` de `Toolbar`, após o bloco de cor:

```jsx
<span className="tb-sep"></span>
<select
  className="tb-font-size"
  title="Tamanho da fonte"
  value={editor.getAttributes('textStyle').fontSize || '14px'}
  onChange={e => {
    editor.chain().focus().setFontSize(e.target.value).run();
  }}
>
  {FONT_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
</select>
```

- [ ] **Step 5: Adicionar CSS para `.tb-font-size` em `src/styles/modules.css`**

Após `.tb-btn.active { ... }`:

```css
.tb-font-size {
  font-size: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-primary);
  padding: 3px 4px;
  cursor: pointer;
  height: 28px;
}
```

- [ ] **Step 6: Verificar no browser**

Selecionar texto, mudar tamanho no select. O texto selecionado deve mudar de tamanho.

- [ ] **Step 7: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/styles/modules.css
git commit -m "feat: add font size selector to workspace editor toolbar"
```

---

### Task 9: Toolbar — tabela com sub-toolbar contextual

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`
- Modify: `src/styles/modules.css`

- [ ] **Step 1: Adicionar imports de tabela**

```jsx
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
```

- [ ] **Step 2: Adicionar extensões no `useEditor`**

```jsx
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
  Placeholder.configure({ placeholder: 'Comece a escrever...' }),
],
```

- [ ] **Step 3: Adicionar botão de tabela em `Toolbar`**

Após o bloco de font size, dentro do `return` de `Toolbar`:

```jsx
<span className="tb-sep"></span>
{btn(editor.isActive('table'), () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'ti-table', 'Inserir tabela')}
```

- [ ] **Step 4: Adicionar sub-toolbar contextual de tabela em `Toolbar`**

Após o `return (` principal de `Toolbar`, envolver tudo em um fragmento e adicionar a sub-toolbar condicional:

```jsx
return (
  <>
    <div className="editor-toolbar">
      {/* ... todos os botões existentes ... */}
    </div>
    {editor.isActive('table') && (
      <div className="ws-table-toolbar">
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>Tabela:</span>
        <button className="tb-btn" title="Inserir coluna antes" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnBefore().run(); }}><i className="ti ti-column-insert-left"></i></button>
        <button className="tb-btn" title="Inserir coluna depois" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }}><i className="ti ti-column-insert-right"></i></button>
        <button className="tb-btn" title="Remover coluna" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }}><i className="ti ti-column-remove"></i></button>
        <span className="tb-sep"></span>
        <button className="tb-btn" title="Inserir linha antes" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowBefore().run(); }}><i className="ti ti-row-insert-top"></i></button>
        <button className="tb-btn" title="Inserir linha depois" onMouseDown={e => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }}><i className="ti ti-row-insert-bottom"></i></button>
        <button className="tb-btn" title="Remover linha" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }}><i className="ti ti-row-remove"></i></button>
        <span className="tb-sep"></span>
        <button className="tb-btn" title="Excluir tabela" onMouseDown={e => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }} style={{ color: 'var(--danger-500)' }}><i className="ti ti-trash"></i></button>
      </div>
    )}
  </>
);
```

- [ ] **Step 5: Adicionar CSS da sub-toolbar e estilos de tabela em `src/styles/modules.css`**

```css
.ws-table-toolbar {
  display: flex;
  align-items: center;
  padding: 4px 0 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 10px;
  gap: 1px;
}
.ws-content .ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
}
.ws-content .ProseMirror th,
.ws-content .ProseMirror td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  font-size: 13.5px;
  text-align: left;
}
.ws-content .ProseMirror th {
  background: var(--surface-1);
  font-weight: 600;
}
.ws-content .ProseMirror .selectedCell {
  background: var(--accent-50);
}
```

- [ ] **Step 6: Verificar no browser**

Clicar botão de tabela — tabela 3×3 inserida. Clicar dentro da tabela — sub-toolbar aparece. Testar inserir/remover linhas e colunas. Clicar fora da tabela — sub-toolbar desaparece.

- [ ] **Step 7: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/styles/modules.css
git commit -m "feat: add table insertion and contextual table toolbar to workspace editor"
```

---

### Task 10: Toolbar — upload de imagem e paste

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`

- [ ] **Step 1: Adicionar imports**

```jsx
import Image from '@tiptap/extension-image';
import { useAuth } from '../auth/AuthContext.jsx';
import { uploadImage } from '../lib/uploadImage.js';
```

- [ ] **Step 2: Adicionar extensão Image no `useEditor`**

```jsx
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
```

- [ ] **Step 3: Adicionar lógica de upload e paste em `PageEditor`**

```jsx
const { profile } = useAuth();
const fileInputRef = useRef(null);
const [uploading, setUploading] = useState(false);

const handleImageFile = async (file) => {
  if (!file || !file.type.startsWith('image/')) return;
  setUploading(true);
  try {
    const url = await uploadImage(file, profile.id);
    editor.chain().focus().setImage({ src: url }).run();
  } catch {
    // toast de erro já é exibido pelo supabase client
  } finally {
    setUploading(false);
  }
};
```

- [ ] **Step 4: Adicionar `editorProps.handlePaste` no `useEditor`**

```jsx
const editor = useEditor({
  extensions: [...],
  content: page.content || '',
  onUpdate: ({ editor }) => onUpdateRef.current?.(editor.getHTML()),
  editorProps: {
    handlePaste: (_view, event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith('image/'));
      if (!imageItem) return false;
      const file = imageItem.getAsFile();
      handleImageFile(file);
      return true;
    },
  },
});
```

**Atenção:** `handleImageFile` usa `editor` — por isso a ordem importa. Declarar `handleImageFile` após o `useEditor`. Usar um ref para o editor se necessário:

```jsx
const editorRef = useRef(null);

const editor = useEditor({
  // ...
  editorProps: {
    handlePaste: (_view, event) => {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith('image/'));
      if (!imageItem) return false;
      const file = imageItem.getAsFile();
      handleImageFileRef.current?.(file);
      return true;
    },
  },
});

const handleImageFileRef = useRef(null);
handleImageFileRef.current = async (file) => {
  if (!file || !file.type.startsWith('image/')) return;
  setUploading(true);
  try {
    const url = await uploadImage(file, profile.id);
    editor?.chain().focus().setImage({ src: url }).run();
  } finally {
    setUploading(false);
  }
};
```

- [ ] **Step 5: Adicionar `<input>` oculto e botão de imagem em `Toolbar`**

Passar `onImageClick` e `uploading` como props para `Toolbar`:

```jsx
<Toolbar editor={editor} onImageClick={() => fileInputRef.current?.click()} uploading={uploading} />
```

Na função `Toolbar`, adicionar parâmetros:

```jsx
function Toolbar({ editor, onImageClick, uploading }) {
```

Dentro do `return`, após o botão de tabela:

```jsx
<span className="tb-sep"></span>
<button
  className="tb-btn"
  title="Inserir imagem"
  disabled={uploading}
  onMouseDown={e => { e.preventDefault(); onImageClick(); }}
>
  <i className={`ti ${uploading ? 'ti-loader-2' : 'ti-photo'}`}></i>
</button>
```

Em `PageEditor`, antes do `return`, adicionar o input oculto:

```jsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/gif,image/webp"
  style={{ display: 'none' }}
  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFileRef.current?.(f); e.target.value = ''; }}
/>
```

Colocar este `<input>` dentro do fragmento `<>...</>` de `PageEditor`, antes do primeiro `<div>`.

- [ ] **Step 6: Adicionar CSS de imagem em `src/styles/modules.css`**

```css
.ws-content .ProseMirror img {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 8px 0;
  display: block;
}
.ws-content .ProseMirror img.ProseMirror-selectednode {
  outline: 2px solid var(--accent-500);
}
```

- [ ] **Step 7: Verificar no browser**

Clicar botão de imagem → file picker abre → escolher imagem → deve aparecer no editor. Colar imagem da área de transferência → deve funcionar também.

- [ ] **Step 8: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/styles/modules.css
git commit -m "feat: add image upload and paste to workspace editor"
```

---

### Task 11: Edição de ícone inline (popover no topbar)

**Files:**
- Modify: `src/modules/WorkspaceEditor.jsx`
- Modify: `src/styles/modules.css`

- [ ] **Step 1: Adicionar estado `iconPickerOpen` em `PageEditor`**

```jsx
const [iconPickerOpen, setIconPickerOpen] = useState(false);
```

- [ ] **Step 2: Adicionar click-outside handler**

```jsx
useEffect(() => {
  if (!iconPickerOpen) return;
  const close = () => setIconPickerOpen(false);
  document.addEventListener('mousedown', close);
  return () => document.removeEventListener('mousedown', close);
}, [iconPickerOpen]);
```

- [ ] **Step 3: Substituir o ícone estático no topbar pelo ícone clicável com popover**

Substituir:

```jsx
<div className="ws-card-icon" style={{ width: 28, height: 28, fontSize: 14, background: ic.bg, color: ic.ic }}>
  <i className={`ti ${ic.i}`}></i>
</div>
```

Por:

```jsx
<div style={{ position: 'relative' }} onMouseDown={e => e.stopPropagation()}>
  <div
    className="ws-card-icon ws-icon-clickable"
    style={{ width: 28, height: 28, fontSize: 14, background: ic.bg, color: ic.ic, cursor: 'pointer' }}
    onClick={() => setIconPickerOpen(v => !v)}
    title="Trocar ícone"
  >
    <i className={`ti ${ic.i}`}></i>
  </div>
  {iconPickerOpen && (
    <div className="ws-icon-popover">
      <div className="icon-picker">
        {WS_ICONS.map((icon, i) => (
          <div
            key={i}
            className={`icon-opt ${page.icon === i ? 'selected' : ''}`}
            style={{ background: icon.bg, color: icon.ic }}
            onClick={() => { onUpdate(page.id, { icon: i }); setIconPickerOpen(false); }}
          >
            <i className={`ti ${icon.i}`}></i>
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Adicionar CSS do popover em `src/styles/modules.css`**

```css
.ws-icon-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 100;
  background: var(--surface-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 8px;
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,.12));
}
.ws-icon-popover .icon-picker { margin-bottom: 0; }
.ws-icon-clickable:hover { opacity: 0.8; }
```

- [ ] **Step 5: Verificar no browser**

Clicar no ícone colorido no topbar → popover com os 8 ícones disponíveis. Clicar num ícone → ícone muda. Clicar fora → popover fecha.

- [ ] **Step 6: Commit**

```bash
git add src/modules/WorkspaceEditor.jsx src/styles/modules.css
git commit -m "feat: add inline icon picker to workspace editor topbar"
```

---

## Self-Review

**Spec coverage:**
- ✅ Bug cursor → Task 4 (TipTap + key={page.id})
- ✅ TipTap com StarterKit + 10 extensões → Tasks 4, 6, 7, 8, 9, 10
- ✅ Auto-save debounce + indicador → Task 5
- ✅ Toolbar formatação → Task 6
- ✅ Cores → Task 7
- ✅ Tamanho de fonte → Task 8
- ✅ Tabela + sub-toolbar contextual → Task 9
- ✅ Imagem upload + paste → Tasks 2, 3, 10
- ✅ Ícone inline → Task 11
- ✅ Supabase Storage bucket → Task 2

**Dependências entre tasks:**
- Task 10 depende de Task 2 (bucket) e Task 3 (uploadImage utility)
- Tasks 5–11 dependem de Task 4 (WorkspaceEditor.jsx criado)
- Demais tasks são independentes entre si
