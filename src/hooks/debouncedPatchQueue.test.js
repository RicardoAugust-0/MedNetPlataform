import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedPatchQueue } from './debouncedPatchQueue.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('createDebouncedPatchQueue', () => {
  it('mescla campos alterados antes do debounce em um único update', async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue(undefined);
    const queue = createDebouncedPatchQueue({ delay: 800, persist });

    queue.enqueue('page-1', { title: 'Novo título' });
    queue.enqueue('page-1', { content: '<p>Novo conteúdo</p>' });

    await vi.advanceTimersByTimeAsync(800);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('page-1', {
      title: 'Novo título',
      content: '<p>Novo conteúdo</p>',
    });
  });

  it('faz flush imediato de todos os patches pendentes', async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue(undefined);
    const queue = createDebouncedPatchQueue({ delay: 800, persist });

    queue.enqueue('note-1', { title: 'A' });
    queue.enqueue('note-2', { body: 'B' });
    await queue.flushAll();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(queue.getPending('note-1')).toBeNull();
    expect(queue.getPending('note-2')).toBeNull();
  });

  it('preserva edição local pendente sobre um evento realtime', () => {
    vi.useFakeTimers();
    const queue = createDebouncedPatchQueue({ delay: 800, persist: vi.fn() });
    queue.enqueue('page-1', { title: 'Local' });

    expect(queue.overlay('page-1', { title: 'Servidor', content: 'ok' })).toEqual({
      title: 'Local',
      content: 'ok',
    });
  });
});
