import { describe, expect, it } from 'vitest';
import { buildCleanupDateRange, formatLocalDateInput } from './cleanupDateRange.js';

describe('cleanupDateRange', () => {
  it('formata a data pelos componentes locais, sem converter para UTC', () => {
    const localLateNight = new Date(2026, 6, 16, 22, 30, 0);
    expect(formatLocalDateInput(localLateNight)).toBe('2026-07-16');
  });

  it('mantém hoje no mesmo dia local para prévia e exclusão', () => {
    const localLateNight = new Date(2026, 6, 16, 22, 30, 0);
    expect(buildCleanupDateRange('hoje', '', '', localLateNight)).toEqual({
      from: '2026-07-16',
      to: '2026-07-16',
    });
  });

  it('preserva o intervalo informado pelo administrador', () => {
    expect(buildCleanupDateRange('intervalo', '2026-07-01', '2026-07-15')).toEqual({
      from: '2026-07-01',
      to: '2026-07-15',
    });
  });
});
