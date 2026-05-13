import { describe, it, expect } from 'vitest';
import { detect } from './parser.js';

describe('Sascar parser · detect', () => {
  it('score 1 quando todas as headers obrigatórias estão presentes', () => {
    const score = detect({
      fileName: 'qualquer.xlsx',
      headers: ['Placa', 'Evento', 'Hora do evento'],
    });
    expect(score).toBeGreaterThanOrEqual(1);
  });

  it('score 0 quando nenhuma header bate', () => {
    expect(detect({ fileName: 'arquivo.xlsx', headers: ['col1', 'col2'] })).toBe(0);
  });

  it('score parcial quando apenas algumas headers obrigatórias estão presentes', () => {
    const score = detect({ fileName: 'qq.xlsx', headers: ['Placa', 'Evento'] });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('aumenta score com header opcional Transportadora', () => {
    const base = detect({ fileName: 'x.xlsx', headers: ['Placa', 'Evento', 'Hora do evento'] });
    const com = detect({ fileName: 'x.xlsx', headers: ['Placa', 'Evento', 'Hora do evento', 'Transportadora'] });
    expect(com).toBeGreaterThanOrEqual(base);
  });

  it('aumenta score por nome de arquivo característico Sascar', () => {
    const base = detect({ fileName: 'random.xlsx', headers: ['Placa'] });
    const sascar = detect({ fileName: 'DetalhesDeEvento_2026.xlsx', headers: ['Placa'] });
    expect(sascar).toBeGreaterThan(base);
  });

  it('é tolerante a parâmetros vazios/ausentes', () => {
    expect(detect()).toBe(0);
    expect(detect({})).toBe(0);
    expect(detect({ headers: [] })).toBe(0);
  });

  it('nunca devolve score > 1', () => {
    const score = detect({
      fileName: 'DetalhesDeEvento_smart_camera_sascar.xlsx',
      headers: ['Placa', 'Evento', 'Hora do evento', 'Transportadora', 'Severidade'],
    });
    expect(score).toBeLessThanOrEqual(1);
  });
});
