import { describe, expect, it, vi } from 'vitest';
import { isTransientFetchError, retryTransientFetch } from './transient-retry.js';

const silentLogger = { warn: vi.fn() };

describe('isTransientFetchError', () => {
  it('reconhece falhas de transporte do fetch/Supabase', () => {
    expect(isTransientFetchError({
      message: 'TypeError: fetch failed',
      details: 'Caused by: ConnectTimeoutError UND_ERR_CONNECT_TIMEOUT',
    })).toBe(true);
    expect(isTransientFetchError(new Error('read ECONNRESET'))).toBe(true);
  });

  it('nao repete erros funcionais do PostgREST', () => {
    expect(isTransientFetchError({ message: 'column bucket does not exist', code: '42703' })).toBe(false);
  });
});

describe('retryTransientFetch', () => {
  it('repete um resultado Supabase com falha transitoria', async () => {
    const operation = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'TypeError: fetch failed' } })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    await expect(retryTransientFetch(operation, {
      baseDelayMs: 0,
      logger: silentLogger,
    })).resolves.toEqual({ data: { ok: true }, error: null });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('repete uma excecao de transporte e preserva o resultado final', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce('ok');

    await expect(retryTransientFetch(operation, {
      baseDelayMs: 0,
      logger: silentLogger,
    })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('retorna erro funcional sem repetir', async () => {
    const result = { data: null, error: { message: 'violates check constraint', code: '23514' } };
    const operation = vi.fn().mockResolvedValue(result);

    await expect(retryTransientFetch(operation, {
      baseDelayMs: 0,
      logger: silentLogger,
    })).resolves.toBe(result);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('aceita classificador e callback de retry customizados', async () => {
    const error = Object.assign(new Error('HTTP 503'), { httpStatus: 503 });
    const operation = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await expect(retryTransientFetch(operation, {
      baseDelayMs: 0,
      logger: silentLogger,
      shouldRetry: (candidate) => candidate.httpStatus === 503,
      onRetry,
    })).resolves.toBe('ok');

    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      error,
      attempt: 1,
      maxAttempts: 3,
      delayMs: 0,
    }));
  });
});
