/**
 * Converte markdown simples em HTML, incluindo tabelas.
 * Usado para renderizar respostas da IA.
 */
export default function renderMarkdown(md) {
  if (!md) return '';

  // Escapar HTML básico
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Quebrar em linhas e processar tabelas
  const lines = html.split('\n');
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Processar Tabelas Markdown
    if (line.startsWith('|') && line.endsWith('|')) {
      // Se for a linha separadora (ex: |---|---|)
      if (line.match(/^\|[\s-|-]*\|$/)) {
        lines[i] = ''; // Remove a linha separadora
        continue;
      }

      const cols = line.split('|').slice(1, -1).map(c => c.trim());
      let rowHtml = '';

      if (!inTable) {
        inTable = true;
        rowHtml += '<table class="markdown-table"><thead><tr>';
        cols.forEach(c => rowHtml += `<th>${c}</th>`);
        rowHtml += '</tr></thead><tbody>';
      } else {
        rowHtml += '<tr>';
        cols.forEach(c => rowHtml += `<td>${c}</td>`);
        rowHtml += '</tr>';
      }
      lines[i] = rowHtml;
    } else {
      if (inTable) {
        inTable = false;
        lines[i] = '</tbody></table>' + lines[i];
      }
    }
  }

  html = lines.join('\n');

  // Headers
  html = html
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
    .replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Negrito e Itálico
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>');

  // Links Markdown [texto](url) -> abre em nova aba (ex: link de download de PDF)
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Listas não-ordenadas
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => '<ul>' + m + '</ul>');

  // Listas ordenadas
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, m => '<ol>' + m + '</ol>');

  // Parágrafos e quebras de linha
  html = html
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return '<div class="markdown-body">' + html + '</div>';
}
