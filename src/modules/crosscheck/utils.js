export function normalizeText(v) {
  if (!v && v !== 0) return '';
  return String(v).normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase();
}

export function normalizePlate(v) {
  if (!v && v !== 0) return '';
  return String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizeKeyLabel(v) {
  if (!v && v !== 0) return '';
  return String(v)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function pickFirst(row, keys) {
  const rowKeys = Object.keys(row);
  const normalizedMap = new Map();
  rowKeys.forEach((rk) => {
    const norm = normalizeKeyLabel(rk);
    if (!normalizedMap.has(norm)) normalizedMap.set(norm, rk);
  });

  for (const searchKey of keys) {
    const norm = normalizeKeyLabel(searchKey);
    const found = normalizedMap.get(norm);
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== '') {
      return String(row[found]);
    }
  }

  return '';
}

export function isCriticalLabel(s) {
  if (!s && s !== 0) return false;
  return /grav|crit|grave|crític|crítico/.test(String(s).toLowerCase());
}

export function buildStats(events) {
  const plates = new Set();
  const drivers = new Set();
  events.forEach((ev) => {
    if (ev.plate) plates.add(ev.plate);
    if (ev.driver) drivers.add(ev.driver);
  });
  return { rows: events.length, plates, drivers };
}

export function formatLoadedAt(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}
