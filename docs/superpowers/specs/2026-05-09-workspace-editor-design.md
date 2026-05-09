# Workspace Editor — Redesign com TipTap

**Data:** 2026-05-09  
**Módulo:** `src/modules/Workspace.jsx`

---

## Problema

O editor atual usa `contentEditable` nativo com `dangerouslySetInnerHTML` + `onInput`. A cada tecla pressionada, React re-renderiza o div, resetando o DOM e perdendo a posição do cursor.

---

## Solução

Substituir o `contentEditable` por TipTap — biblioteca de editor rico baseada em ProseMirror, React-first.

---

## Dependências a instalar

```
@tiptap/react
@tiptap/starter-kit
@tiptap/extension-text-style
@tiptap/extension-color
@tiptap/extension-font-size
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-image
@tiptap/extension-placeholder
@tiptap/extension-underline
```

---

## Arquitetura

Nenhum arquivo novo. Mudanças em:
- `src/modules/Workspace.jsx` — refactor do `PageEditor`
- `src/styles/modules.css` — estilos da toolbar e editor

---

## Integração TipTap

```jsx
const editor = useEditor({
  extensions: [StarterKit, Underline, TextStyle, Color, FontSize, Table, Image, Placeholder, ...],
  content: page.content || '',
  onUpdate: ({ editor }) => debouncedSave(editor.getHTML()),
});
```

**Troca de página:** `useEffect` com dependência em `page.id` chama `editor.commands.setContent(page.content)` — sem re-render do DOM do editor.

---

## Auto-save

- Debounce de 500ms na callback `onUpdate` do TipTap
- Estado local `saveStatus`: `'idle' | 'saving' | 'saved'`
- Indicador visual no topbar: "Salvando..." → "Salvo ✓"
- Nenhuma mudança no hook `useWsPages`

---

## Toolbar

Grupos separados por `tb-sep`:

1. **Formatação:** Bold, Italic, Underline
2. **Cabeçalhos:** H1, H2, H3
3. **Blocos:** Lista com marcadores, Lista numerada, Citação, Divisor horizontal
4. **Cor de texto:** Botão abre popover com paleta de 10 cores fixas (baseadas nos tokens do projeto)
5. **Tamanho de fonte:** `<select>` compacto — 12 / 14 / 16 / 18 / 24px
6. **Tabela:** Inserir tabela 3×3. Sub-toolbar contextual flutuante quando cursor está em célula: inserir/remover linha, inserir/remover coluna, excluir tabela
7. **Imagem:** Botão abre `<input type="file" accept="image/*">` → upload para Supabase Storage

**Undo/Redo:** `Ctrl+Z` / `Ctrl+Shift+Z` via `History` do StarterKit. Sem botões visuais.

---

## Upload de imagem

**Bucket Supabase Storage:** `workspace-images`  
- Acesso de leitura público  
- Upload requer autenticação  

**Caminho do arquivo:** `workspace-images/{userId}/{uuid}.{ext}`

**Fluxo:**
1. Clique no botão imagem → abre file picker
2. Arquivo enviado via `supabase.storage.from('workspace-images').upload(...)`
3. URL pública obtida via `getPublicUrl`
4. Inserida no editor: `editor.chain().setImage({ src: publicUrl }).run()`

**Cole de imagem (paste):** configurado via opção `editorProps.handlePaste` no `useEditor` — intercepta `DataTransfer` com `files` de imagem → mesmo fluxo de upload.

---

## Edição de ícone inline

No topbar do `PageEditor`:
- O círculo de ícone colorido vira clicável
- Clique abre popover com o `icon-picker` grid (mesmo da modal de criação)
- Clique fora fecha o popover
- Seleção chama `onUpdate(page.id, { icon: i })`

Categoria e título permanecem como estão (já funcionam inline).

---

## Paleta de cores da toolbar

10 cores fixas baseadas nos tokens do projeto:
- Preto, Cinza escuro, Cinza médio
- Azul primário, Azul claro
- Verde, Vermelho, Laranja/Warning
- Roxo, Ciano

---

## Fora de escopo

- Editor colaborativo em tempo real
- Comentários/anotações
- Histórico de versões
- Exportar para PDF/Word
