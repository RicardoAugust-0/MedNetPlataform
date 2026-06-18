import { describe, it, expect } from 'vitest';
import { normClf, normCrit, toUF } from './fatigueParser.js';

describe('fatigueParser · normClf', () => {
  it('identifica falso positivo', () => {
    expect(normClf('Falso positivo')).toBe('Falso positivo');
    expect(normClf('falso')).toBe('Falso positivo');
  });

  it('identifica positivo para termos comuns e "Válido"', () => {
    expect(normClf('Positivo')).toBe('Positivo');
    expect(normClf('Confirmado')).toBe('Positivo');
    expect(normClf('Procede')).toBe('Positivo');
    expect(normClf('Verdadeiro')).toBe('Positivo');
    expect(normClf('Real')).toBe('Positivo');
    expect(normClf('Válido')).toBe('Positivo');
    expect(normClf('valido')).toBe('Positivo');
  });

  it('retorna Não classificado para valores desconhecidos ou vazios', () => {
    expect(normClf(null)).toBe('Não classificado');
    expect(normClf('')).toBe('Não classificado');
    expect(normClf('Pendente')).toBe('Não classificado');
  });
});

describe('fatigueParser · normCrit', () => {
  it('normaliza criticidade gravíssima', () => {
    expect(normCrit('Gravíssimo')).toBe('Gravíssimo');
    expect(normCrit('Alta')).toBe('Gravíssimo');
    expect(normCrit('Alto')).toBe('Gravíssimo');
  });

  it('normaliza criticidade grave', () => {
    expect(normCrit('Grave')).toBe('Grave');
  });

  it('normaliza para médio em casos desconhecidos', () => {
    expect(normCrit('Baixo')).toBe('Médio');
    expect(normCrit(null)).toBe('Médio');
  });
});

describe('fatigueParser · toUF', () => {
  it('extrai UF correta', () => {
    expect(toUF('São Paulo - SP')).toBe('SP');
    expect(toUF('Minas Gerais (MG)')).toBe('MG');
    expect(toUF('Qualquer coisa')).toBeNull();
  });
});
