import { describe, expect, it } from 'vitest';
import { toTreatmentQueuePayload } from './horizon-routes.js';

describe('toTreatmentQueuePayload', () => {
  it('entrega ao robo a placa e o horario exatos do evento Horizon', () => {
    const payload = toTreatmentQueuePayload({
      id: 'queue-id',
      placa: 'TLH7I01',
      ocorrido_em: '2026-07-13T15:03:10Z',
      horizon_event: {
        placa: 'TLH-7I01',
        ocorrido_em: '2026-07-13T15:15:25Z',
      },
    });

    expect(payload).toEqual({
      id: 'queue-id',
      placa: 'TLH7I01',
      ocorrido_em: '2026-07-13T15:03:10Z',
      horizon_placa: 'TLH-7I01',
      horizon_ocorrido_em: '2026-07-13T15:15:25Z',
    });
  });

  it('mantem fallback compativel para filas legadas sem join Horizon', () => {
    const payload = toTreatmentQueuePayload({
      id: 'queue-id',
      placa: 'ABC1D23',
      ocorrido_em: '2026-07-13T12:00:00Z',
      horizon_event: null,
    });

    expect(payload.horizon_placa).toBe('ABC1D23');
    expect(payload.horizon_ocorrido_em).toBe('2026-07-13T12:00:00Z');
  });
});
