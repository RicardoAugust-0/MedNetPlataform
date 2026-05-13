import { describe, it, expect } from 'vitest';
import { maxSeveridade, parseSpeed, parseEventDate, parseTurno } from './parsers.js';

describe('maxSeveridade', () => {
  it('devolve Gravíssimo se presente', () => {
    expect(maxSeveridade(['Normal', 'Gravíssimo', 'Grave'])).toBe('Gravíssimo');
  });
  it('devolve Grave quando há Grave mas não Gravíssimo', () => {
    expect(maxSeveridade(['Normal', 'Grave'])).toBe('Grave');
  });
  it('devolve Normal como default', () => {
    expect(maxSeveridade([])).toBe('Normal');
    expect(maxSeveridade(['Normal'])).toBe('Normal');
    expect(maxSeveridade(['outro'])).toBe('Normal');
  });
});

describe('parseSpeed', () => {
  it('aceita números diretos', () => {
    expect(parseSpeed(80)).toBe(80);
    expect(parseSpeed(0)).toBe(0);
  });
  it('aceita strings com vírgula como separador decimal', () => {
    expect(parseSpeed('80,5')).toBe(80.5);
  });
  it('extrai o número de "80 km/h"', () => {
    expect(parseSpeed('80 km/h')).toBe(80);
  });
  it('devolve null para valores nulos, vazios ou inválidos', () => {
    expect(parseSpeed(null)).toBeNull();
    expect(parseSpeed(undefined)).toBeNull();
    expect(parseSpeed('')).toBeNull();
    expect(parseSpeed('abc')).toBeNull();
  });
  it('devolve null para valores negativos', () => {
    expect(parseSpeed(-5)).toBeNull();
    expect(parseSpeed('-5')).toBeNull();
  });
  it('devolve null para NaN/Infinity', () => {
    expect(parseSpeed(NaN)).toBeNull();
    expect(parseSpeed(Infinity)).toBeNull();
  });
});

describe('parseEventDate', () => {
  it('devolve o próprio Date quando recebe Date', () => {
    const d = new Date('2026-05-01T10:00:00Z');
    expect(parseEventDate(d)).toBe(d);
  });
  it('devolve null para Date inválido', () => {
    expect(parseEventDate(new Date('invalid'))).toBeNull();
  });
  it('parseia formato brasileiro DD/MM/AAAA HH:MM:SS', () => {
    const d = parseEventDate('01/05/2026 14:30:00');
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(14);
  });
  it('parseia formato DD/MM/AAAA HH:MM (sem segundos)', () => {
    const d = parseEventDate('01/05/2026 14:30');
    expect(d.getMinutes()).toBe(30);
  });
  it('parseia DD/MM/AAAA sem hora', () => {
    const d = parseEventDate('01/05/2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
  });
  it('parseia ano com 2 dígitos (assume 20XX)', () => {
    const d = parseEventDate('01/05/26 10:00');
    expect(d.getFullYear()).toBe(2026);
  });
  it('parseia número serial do Excel', () => {
    const d = parseEventDate(46143);
    expect(d).toBeInstanceOf(Date);
    expect(d.getFullYear()).toBe(2026);
  });
  it('devolve null para valores vazios', () => {
    expect(parseEventDate(null)).toBeNull();
    expect(parseEventDate(undefined)).toBeNull();
    expect(parseEventDate('')).toBeNull();
  });
});

describe('parseTurno', () => {
  it('classifica 06h-18h como diurno', () => {
    expect(parseTurno('01/05/2026 06:00')).toBe('diurno');
    expect(parseTurno('01/05/2026 12:00')).toBe('diurno');
    expect(parseTurno('01/05/2026 17:59')).toBe('diurno');
  });
  it('classifica 18h-06h como noturno', () => {
    expect(parseTurno('01/05/2026 18:00')).toBe('noturno');
    expect(parseTurno('01/05/2026 23:30')).toBe('noturno');
    expect(parseTurno('01/05/2026 05:59')).toBe('noturno');
  });
  it('aceita Date diretamente', () => {
    expect(parseTurno(new Date(2026, 4, 1, 10, 0))).toBe('diurno');
    expect(parseTurno(new Date(2026, 4, 1, 22, 0))).toBe('noturno');
  });
  it('aceita "HH:MM" puro', () => {
    expect(parseTurno('10:00')).toBe('diurno');
    expect(parseTurno('20:00')).toBe('noturno');
  });
  it('default diurno para entradas inválidas', () => {
    expect(parseTurno(null)).toBe('diurno');
    expect(parseTurno('')).toBe('diurno');
    expect(parseTurno('lixo')).toBe('diurno');
  });
});
