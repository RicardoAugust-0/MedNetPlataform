import { describe, it, expect } from 'vitest';
import { buildClearMap, isAfterClear } from './history.js';

describe('buildClearMap', () => {
  it('devolve objeto vazio para histórico vazio ou nulo', () => {
    expect(buildClearMap([])).toEqual({});
    expect(buildClearMap(null)).toEqual({});
    expect(buildClearMap(undefined)).toEqual({});
  });

  it('ignora entradas sem placa ou created_at', () => {
    const h = [
      { tipo: 'intervencao', created_at: '2026-05-01T10:00:00Z' },
      { placa: 'ABC1D23', tipo: 'intervencao' },
    ];
    expect(buildClearMap(h)).toEqual({});
  });

  it('ignora datas inválidas', () => {
    const h = [{ placa: 'ABC1D23', tipo: 'intervencao', created_at: 'lixo' }];
    expect(buildClearMap(h)).toEqual({});
  });

  it('mapeia intervencao e descarte como lastIntervencao', () => {
    const h = [
      { placa: 'AAA1A11', tipo: 'intervencao', created_at: '2026-05-01T10:00:00Z' },
      { placa: 'BBB2B22', tipo: 'descarte',    created_at: '2026-05-02T10:00:00Z' },
    ];
    const m = buildClearMap(h);
    expect(m.AAA1A11.lastIntervencao.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(m.BBB2B22.lastIntervencao.toISOString()).toBe('2026-05-02T10:00:00.000Z');
    expect(m.AAA1A11.lastReportar).toBeUndefined();
  });

  it('mapeia reportar como lastReportar (separado de intervencao)', () => {
    const h = [{ placa: 'AAA1A11', tipo: 'reportar', created_at: '2026-05-01T10:00:00Z' }];
    const m = buildClearMap(h);
    expect(m.AAA1A11.lastReportar.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(m.AAA1A11.lastIntervencao).toBeUndefined();
  });

  it('mantém o timestamp mais recente quando há múltiplas entradas', () => {
    const h = [
      { placa: 'AAA1A11', tipo: 'intervencao', created_at: '2026-05-01T10:00:00Z' },
      { placa: 'AAA1A11', tipo: 'intervencao', created_at: '2026-05-03T10:00:00Z' },
      { placa: 'AAA1A11', tipo: 'descarte',    created_at: '2026-05-02T10:00:00Z' },
    ];
    const m = buildClearMap(h);
    expect(m.AAA1A11.lastIntervencao.toISOString()).toBe('2026-05-03T10:00:00.000Z');
  });

  it('ignora tipos desconhecidos', () => {
    const h = [{ placa: 'AAA1A11', tipo: 'outro', created_at: '2026-05-01T10:00:00Z' }];
    expect(buildClearMap(h)).toEqual({});
  });
});

describe('isAfterClear', () => {
  it('devolve true quando não há clearAt (postura conservadora)', () => {
    expect(isAfterClear(new Date('2020-01-01'), null)).toBe(true);
    expect(isAfterClear(new Date('2020-01-01'), undefined)).toBe(true);
  });

  it('devolve true quando o evento não tem data (postura conservadora)', () => {
    expect(isAfterClear(null, new Date('2026-05-01'))).toBe(true);
    expect(isAfterClear(undefined, new Date('2026-05-01'))).toBe(true);
  });

  it('devolve true quando evento é estritamente posterior ao clear', () => {
    expect(isAfterClear(new Date('2026-05-02'), new Date('2026-05-01'))).toBe(true);
  });

  it('devolve false quando evento é anterior ao clear', () => {
    expect(isAfterClear(new Date('2026-04-30'), new Date('2026-05-01'))).toBe(false);
  });

  it('devolve false quando evento é igual ao clear (estrito)', () => {
    const t = new Date('2026-05-01T10:00:00Z');
    expect(isAfterClear(t, t)).toBe(false);
  });
});
