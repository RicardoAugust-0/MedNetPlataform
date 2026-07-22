// Parsers de campos primitivos compartilhados entre todas as plataformas.
// Plataformas que lidam com planilhas, APIs ou scrapers reutilizam estes helpers
// para padronizar tipos (Date, número, turno, severidade).

// Aceita 0..N valores e devolve o nível máximo de severidade encontrado.
// Plataformas que usem uma escala diferente devem fornecer sua própria função
// (ver adapter), mas a maioria dos sistemas brasileiros segue Gravíssimo > Grave > Normal.
export function maxSeveridade(severidades) {
  if (severidades.includes('Gravíssimo')) return 'Gravíssimo';
  if (severidades.includes('Grave'))      return 'Grave';
  return 'Normal';
}

// Aceita número (km/h), string ("80", "80,5", "80 km/h"), null/undefined.
// Devolve number >= 0 ou null se inválido.
export function parseSpeed(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const normalized = String(value).trim().replace(',', '.');
  if (normalized.startsWith('-')) return null;
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Aceita Date, número serial do Excel (dias desde 1900-01-01) ou string em
// formatos comuns: "DD/MM/AAAA HH:MM[:SS]" ou "DD/MM/AAAA". Devolve Date ou null.
import { toDate } from '../../utils/fatigueParser.js';

export function parseEventDate(value) {
  return toDate(value);
}

// Regra padrão de turno: Diurno 06–18h, Noturno 18–06h.
// Aceita "DD/MM/AAAA HH:MM[:SS]", "HH:MM", número Excel ou Date.
export function parseTurno(value) {
  if (!value) return 'diurno';
  if (value instanceof Date) {
    const h = value.getHours();
    return (h >= 6 && h < 18) ? 'diurno' : 'noturno';
  }
  const parts = String(value).split(' ');
  const timePart = parts[1] || parts[0];
  const hour = parseInt(timePart?.split(':')[0], 10);
  if (isNaN(hour)) return 'diurno';
  return (hour >= 6 && hour < 18) ? 'diurno' : 'noturno';
}
