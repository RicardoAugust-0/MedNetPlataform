// Helpers de parsing para integração com a planilha (Google Sheets).
// Data formatos: "DD/MM" + `_mes` no formato "MAIO 2026".

const MES_LABELS = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

export function parseSheetRowDate(row) {
  if (!row?.data || !row?._mes) return null;
  const parts = String(row.data).split('/');
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const mesParts = String(row._mes).trim().split(/\s+/);
  const year = parseInt(mesParts[mesParts.length - 1], 10);
  if (!d || !m || !year) return null;
  return new Date(year, m - 1, d);
}

export function parseTimeStrToMin(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Constrói lista "MAIO 2026,ABRIL 2026,..." pros últimos N meses (incl. atual).
export function buildMesesLookback(monthsBack) {
  const now = new Date();
  const out = [];
  for (let i = monthsBack; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${MES_LABELS[d.getMonth()]} ${d.getFullYear()}`);
  }
  return out.join(',');
}
