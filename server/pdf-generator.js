import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Gera PDFs a partir de Markdown simples usando pdf-lib (JS puro, sem headless chrome).
// Suporta: títulos (#, ##, ###), negrito (**), itálico (*), listas (-, *, 1.) e parágrafos.
// Layout é propositalmente enxuto (focado em laudos/relatórios em texto).

const PAGE_W = 595.28; // A4 em points
const PAGE_H = 841.89;
const MARGIN = 56;     // ~2cm
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK   = rgb(0.13, 0.15, 0.18);
const MUTED  = rgb(0.45, 0.48, 0.52);
const ACCENT = rgb(0.70, 0.33, 0.0);
const RULE   = rgb(0.85, 0.86, 0.88);

// Quebra "**negrito**" / "*itálico*" em segmentos {text, bold, italic}.
function parseInlineRuns(text) {
  const runs = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let last = 0, m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), bold: false, italic: false });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true, italic: false });
    else runs.push({ text: m[3], bold: false, italic: true });
    last = regex.lastIndex;
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, italic: false });
  return runs.length ? runs : [{ text, bold: false, italic: false }];
}

// Quebra os runs em palavras e depois em linhas que cabem em maxWidth.
function layoutParagraph(runs, fonts, size, maxWidth) {
  const words = [];
  for (const run of runs) {
    for (const w of run.text.split(/\s+/)) {
      if (w) words.push({ text: w, bold: run.bold, italic: run.italic });
    }
  }
  const spaceW = fonts.reg.widthOfTextAtSize(' ', size);
  const lines = [];
  let line = [];
  let width = 0;
  for (const word of words) {
    const font = pickFont(fonts, word);
    const wW = font.widthOfTextAtSize(word.text, size);
    const add = (line.length ? spaceW : 0) + wW;
    if (width + add > maxWidth && line.length) {
      lines.push(line);
      line = [];
      width = 0;
    }
    line.push(word);
    width += (line.length > 1 ? spaceW : 0) + wW;
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[]];
}

function pickFont(fonts, word) {
  if (word.bold) return fonts.bold;
  if (word.italic) return fonts.italic;
  return fonts.reg;
}

export async function renderMarkdownToPdf({ title, subtitle, content }) {
  const pdf = await PDFDocument.create();
  const fonts = {
    reg:    await pdf.embedFont(StandardFonts.Helvetica),
    bold:   await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (needed) => { if (y - needed < MARGIN + 24) newPage(); };

  // Desenha um parágrafo com quebra de linha e runs (negrito/itálico).
  const drawParagraph = (runs, { size, color = INK, gapAfter = 7, lineGap = 4, indent = 0, bullet = null } = {}) => {
    const lines = layoutParagraph(runs, fonts, size, CONTENT_W - indent);
    const spaceW = fonts.reg.widthOfTextAtSize(' ', size);
    lines.forEach((line, lineIdx) => {
      ensure(size + lineGap);
      let x = MARGIN + indent;
      if (bullet && lineIdx === 0) {
        page.drawText(bullet, { x: MARGIN + indent - 12, y: y - size, size, font: fonts.reg, color });
      }
      line.forEach((word, idx) => {
        if (idx > 0) x += spaceW;
        const font = pickFont(fonts, word);
        page.drawText(word.text, { x, y: y - size, size, font, color });
        x += font.widthOfTextAtSize(word.text, size);
      });
      y -= size + lineGap;
    });
    y -= gapAfter;
  };

  const drawHeading = (text, size, color = INK, topGap = 6) => {
    y -= topGap;
    drawParagraph([{ text, bold: true, italic: false }], { size, color, gapAfter: 6, lineGap: 3 });
  };

  const drawRule = () => {
    ensure(12);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: RULE });
    y -= 14;
  };

  // Cabeçalho do documento.
  if (title) drawParagraph([{ text: title, bold: true, italic: false }], { size: 20, color: ACCENT, gapAfter: 2, lineGap: 4 });
  if (subtitle) drawParagraph([{ text: subtitle, bold: false, italic: false }], { size: 11, color: MUTED, gapAfter: 4 });
  const dateStr = new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  drawParagraph([{ text: `Gerado em ${dateStr}`, bold: false, italic: true }], { size: 9, color: MUTED, gapAfter: 6 });
  drawRule();

  // Corpo: processa linha a linha.
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  for (let raw of lines) {
    const lineTrim = raw.trim();

    if (lineTrim === '') { y -= 5; continue; }

    if (lineTrim.startsWith('### ')) { drawHeading(lineTrim.slice(4), 12); continue; }
    if (lineTrim.startsWith('## '))  { drawHeading(lineTrim.slice(3), 14); continue; }
    if (lineTrim.startsWith('# '))   { drawHeading(lineTrim.slice(2), 17, ACCENT); continue; }

    // Linha de tabela markdown -> renderiza como texto simples separado por "  |  "
    if (lineTrim.startsWith('|') && lineTrim.endsWith('|')) {
      if (/^\|[\s\-|]*\|$/.test(lineTrim)) continue; // separador
      const cells = lineTrim.split('|').slice(1, -1).map(c => c.trim()).join('   |   ');
      drawParagraph(parseInlineRuns(cells), { size: 10, gapAfter: 2, lineGap: 3 });
      continue;
    }

    // Lista não-ordenada
    const ul = lineTrim.match(/^[-*]\s+(.*)$/);
    if (ul) { drawParagraph(parseInlineRuns(ul[1]), { size: 11, indent: 16, gapAfter: 3, bullet: '•' }); continue; }

    // Lista ordenada
    const ol = lineTrim.match(/^(\d+)\.\s+(.*)$/);
    if (ol) { drawParagraph(parseInlineRuns(ol[2]), { size: 11, indent: 16, gapAfter: 3, bullet: ol[1] + '.' }); continue; }

    // Parágrafo normal
    drawParagraph(parseInlineRuns(lineTrim), { size: 11 });
  }

  // Rodapé com paginação.
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText('MedNet · Fadiga Zero', { x: MARGIN, y: MARGIN - 24, size: 8, font: fonts.reg, color: MUTED });
    const label = `${i + 1} / ${pages.length}`;
    const w = fonts.reg.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: PAGE_W - MARGIN - w, y: MARGIN - 24, size: 8, font: fonts.reg, color: MUTED });
  });

  return await pdf.save();
}
