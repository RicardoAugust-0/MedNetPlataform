export function normalizeText(v) {
  if (!v && v !== 0) return "";
  return String(v)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

export function normalizePlate(v) {
  if (!v && v !== 0) return "";
  return String(v)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeKeyLabel(v) {
  if (!v && v !== 0) return "";
  return String(v)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
    if (
      found &&
      row[found] !== undefined &&
      row[found] !== null &&
      String(row[found]).trim() !== ""
    ) {
      return String(row[found]);
    }
  }

  return "";
}

export function isCriticalLabel(s) {
  if (!s && s !== 0) return false;
  const str = String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return /grav|crit|grave|critico/.test(str);
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

export function buildCarrierStats(events) {
  const counts = new Map();
  const labels = new Map();
  events.forEach((ev) => {
    const raw = (ev.transportadoraRaw || "").trim() || "Sem transportadora";
    const key = normalizeText(raw);
    if (!labels.has(key)) labels.set(key, raw);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([key, count]) => ({ name: labels.get(key) || key, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function parseDateValue(raw) {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + raw * 86400000);
  }
  const str = String(raw).trim();
  if (!str) return null;
  const match = str.match(
    /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (match) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return new Date(
      Number(year),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss),
    );
  }
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function buildDuplicateStats(events) {
  const countBy = (key) => {
    const map = new Map();
    events.forEach((ev) => {
      const value = ev[key];
      if (!value) return;
      map.set(value, (map.get(value) || 0) + 1);
    });
    const total = [...map.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    );
    const top = [...map.entries()]
      .filter(([, count]) => count > 1)
      .map(([value, count]) => ({ value, count }))
      .sort(
        (a, b) =>
          b.count - a.count || String(a.value).localeCompare(String(b.value)),
      )
      .slice(0, 5);
    return { total, top };
  };
  return {
    plates: countBy("plate"),
    drivers: countBy("driver"),
  };
}

export function formatLoadedAt(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}
