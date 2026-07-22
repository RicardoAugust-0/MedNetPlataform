import { describe, expect, it } from 'vitest';
import {
  assignHorizonEventsToClosestMaxtrack,
  isHorizonEventTreated,
  shouldPreserveHorizonQueueItem,
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

describe('shouldPreserveHorizonQueueItem', () => {
  it('protege claims ativos e estados terminais contra reatribuicao', () => {
    expect(shouldPreserveHorizonQueueItem('processing')).toBe(true);
    expect(shouldPreserveHorizonQueueItem('done')).toBe(true);
    expect(shouldPreserveHorizonQueueItem('already_synced')).toBe(true);
    expect(shouldPreserveHorizonQueueItem('error')).toBe(true);
    expect(shouldPreserveHorizonQueueItem('pending')).toBe(false);
  });
});

describe('runAutoCrossCheck', () => {
  it('executa a verificação cruzada em lote com o cliente Supabase fornecido', async () => {
    const mockMaxtrack = [
      { id: 'm1', placa: 'ABC1D23', ocorrido_em: '2026-07-22T10:00:00Z', analise_ia_plataforma: 'Positivo', descricao: 'Fadiga' },
    ];
    const mockHorizon = [
      { id: 'h1', placa: 'ABC-1D23', ocorrido_em: '2026-07-22T10:01:00Z', analise_ia_plataforma: 'Não classificado' },
    ];

    const upsertCalls = [];
    const supabase = {
      from: (table) => {
        if (table === 'driver_events') {
          const builder = {
            eq: () => builder,
            gte: () => builder,
            lte: () => builder,
            in: () => builder,
            order: () => builder,
            limit: () => Promise.resolve({ data: mockMaxtrack, error: null }),
            range: () => Promise.resolve({ data: mockHorizon, error: null }),
          };
          return { select: () => builder };
        }
        if (table === 'horizon_treatment_queue') {
          return {
            select: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
            upsert: (rows, opts) => {
              upsertCalls.push({ rows, opts });
              return Promise.resolve({ error: null });
            },
            delete: () => ({
              in: () => ({
                eq: () => Promise.resolve({ error: null }),
              }),
            }),
          };
        }
        return {};
      },
    };

    const { runAutoCrossCheck } = await import('./auto-crosscheck.js');
    await expect(runAutoCrossCheck(supabase, 'maxtrack')).resolves.toBeUndefined();
    expect(upsertCalls.length).toBeGreaterThan(0);
    expect(upsertCalls[0].rows[0]).toEqual(expect.objectContaining({
      driver_event_id: 'm1',
      horizon_driver_event_id: 'h1',
      status: 'pending',
    }));
  });
});
