export function formatLocalDateInput(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildCleanupDateRange(period, from = '', to = '', now = new Date()) {
  if (period === 'todos') return { from: null, to: null };
  if (period === 'hoje') {
    const today = formatLocalDateInput(now);
    return { from: today, to: today };
  }
  if (period === 'semana') {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { from: formatLocalDateInput(start), to: formatLocalDateInput(now) };
  }
  if (period === 'mes') {
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    return { from: formatLocalDateInput(start), to: formatLocalDateInput(now) };
  }
  if (period === 'intervalo') return { from: from || null, to: to || null };
  return { from: null, to: null };
}
