import { describe, expect, it } from 'vitest';
import {
  assignHorizonEventsToClosestMaxtrack,
  isHorizonEventTreated,
} from './auto-crosscheck.js';

describe('assignHorizonEventsToClosestMaxtrack', () => {
  it('normaliza a placa e entrega o alvo ao evento MaxTrack mais proximo', () => {
    const sources = [
      { id: 'maxtrack-antigo', placa: 'TLH7I01', ocorrido_em: '2026-07-13T14:10:02Z' },
      { id: 'maxtrack-exato', placa: 'TLH7I01', ocorrido_em: '2026-07-13T15:15:25Z' },
      { id: 'maxtrack-intermediario', placa: 'TLH7I01', ocorrido_em: '2026-07-13T15:03:10Z' },
    ];
    const target = {
      id: 'horizon-unico',
      placa: 'TLH-7I01',
      ocorrido_em: '2026-07-13T15:15:25Z',
    };

    const assignments = assignHorizonEventsToClosestMaxtrack(sources, [target]);

    expect(assignments.get('maxtrack-exato')).toEqual([target]);
    expect(assignments.get('maxtrack-antigo')).toEqual([]);
    expect(assignments.get('maxtrack-intermediario')).toEqual([]);
  });

  it('permite varios alvos Horizon para uma fonte sem duplicar cada alvo', () => {
    const source = { id: 'maxtrack', placa: 'ABC1D23', ocorrido_em: '2026-07-13T12:00:00Z' };
    const targets = [
      { id: 'horizon-1', placa: 'ABC-1D23', ocorrido_em: '2026-07-13T11:59:00Z' },
      { id: 'horizon-2', placa: 'ABC-1D23', ocorrido_em: '2026-07-13T12:01:00Z' },
    ];

    const assignments = assignHorizonEventsToClosestMaxtrack([source], targets);

    expect(assignments.get('maxtrack')).toEqual(targets);
  });

  it('ignora placas diferentes e eventos fora da janela', () => {
    const sources = [
      { id: 'maxtrack', placa: 'ABC1D23', ocorrido_em: '2026-07-13T12:00:00Z' },
    ];
    const targets = [
      { id: 'outra-placa', placa: 'XYZ-9Z99', ocorrido_em: '2026-07-13T12:00:00Z' },
      { id: 'fora-da-janela', placa: 'ABC-1D23', ocorrido_em: '2026-07-13T16:00:01Z' },
    ];

    const assignments = assignHorizonEventsToClosestMaxtrack(sources, targets);

    expect(assignments.get('maxtrack')).toEqual([]);
  });
});

describe('isHorizonEventTreated', () => {
  it('considera somente classificacoes finais como tratadas', () => {
    expect(isHorizonEventTreated({ analise_ia_plataforma: 'Positivo' })).toBe(true);
    expect(isHorizonEventTreated({ analise_ia_plataforma: 'Falso positivo' })).toBe(true);
    expect(isHorizonEventTreated({ analise_ia_plataforma: 'Não classificado' })).toBe(false);
    expect(isHorizonEventTreated({ analise_ia_plataforma: null })).toBe(false);
  });
});
