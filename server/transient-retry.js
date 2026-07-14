const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 250;

function errorText(error) {
  return [
    error?.message,
    error?.details,
    error?.cause?.message,
    error?.cause?.code,
    error?.code,
  ].filter(Boolean).join(' ');
}

export function isTransientFetchError(error) {
  return /fetch failed|UND_ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i
    .test(errorText(error));
}

function delay(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Por padrao repete somente falhas de transporte. O chamador pode fornecer um
 * classificador mais amplo para respostas HTTP comprovadamente transitorias;
 * erros funcionais devem retornar imediatamente.
 *
 * A operacao precisa ser idempotente: uma falha de rede pode acontecer depois
 * de o servidor remoto ter processado a requisicao, mas antes da resposta.
 */
export async function retryTransientFetch(
  operation,
  {
    label = 'Operacao remota',
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    logger = console,
    shouldRetry = isTransientFetchError,
    onRetry = null,
  } = {},
) {
  const attempts = Math.max(1, maxAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      const resultError = result?.error;
      if (!resultError || !shouldRetry(resultError) || attempt === attempts) {
        return result;
      }

      const retryDelayMs = baseDelayMs * (2 ** (attempt - 1));
      logger.warn(
        `[Transient Retry] ${label}: tentativa ${attempt}/${attempts} falhou; repetindo.`,
        resultError,
      );
      onRetry?.({ error: resultError, attempt, maxAttempts: attempts, delayMs: retryDelayMs });
    } catch (error) {
      if (!shouldRetry(error) || attempt === attempts) throw error;
      const retryDelayMs = baseDelayMs * (2 ** (attempt - 1));
      logger.warn(
        `[Transient Retry] ${label}: tentativa ${attempt}/${attempts} falhou; repetindo.`,
        error,
      );
      onRetry?.({ error, attempt, maxAttempts: attempts, delayMs: retryDelayMs });
    }

    await delay(baseDelayMs * (2 ** (attempt - 1)));
  }

  throw new Error(`${label}: numero de tentativas esgotado.`);
}
