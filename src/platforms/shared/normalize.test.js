import { describe, it, expect } from 'vitest';
import { normalize, containsAll } from './normalize.js';

describe('normalize', () => {
  it('remove acentos e baixa caixa', () => {
    expect(normalize('Distração Genérica')).toBe('distracao generica');
  });
  it('colapsa espaços múltiplos', () => {
    expect(normalize('a    b\tc')).toBe('a b c');
  });
  it('trim nas pontas', () => {
    expect(normalize('  abc  ')).toBe('abc');
  });
  it('lida com null/undefined/number sem quebrar', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
    expect(normalize(123)).toBe('123');
  });
});

describe('containsAll', () => {
  it('true quando todos os tokens estão presentes', () => {
    expect(containsAll('distracao generica', ['distracao', 'generica'])).toBe(true);
  });
  it('false quando algum token falta', () => {
    expect(containsAll('distracao', ['distracao', 'generica'])).toBe(false);
  });
  it('vacuously true para lista vazia de tokens', () => {
    expect(containsAll('qualquer', [])).toBe(true);
  });
});
