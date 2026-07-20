import { describe, expect, it, vi } from 'vitest';
import { buildAutomationDispatchKey, runAutomationSchedulerTick } from './automation-scheduler.js';

function createSupabase(claims) {
  const rpc = vi.fn(async (name, payload) => {
    if (name === 'claim_due_automations') return { data: claims, error: null };
    if (name === 'finish_automation_schedule') return { data: true, error: null, payload };
    throw new Error(`RPC inesperada: ${name}`);
  });
  const insert = vi.fn(async () => ({ error: null }));
  return {
    rpc,
    from: vi.fn(() => ({ insert })),
    insert,
  };
}

const claim = {
  automation_id: 'a1b94e82-e3e7-4c74-bfd4-3a56df93df28',
  automation_name: 'Bot_MaxtrackScraping',
  automation_endpoint: 'https://botsplaywright.duckdns.org/automacoes/BOT_MaxtrackRelatorios?background=true',
  automation_token: 'secret',
  scheduled_for: '2026-07-13T15:00:00.000Z',
  claim_id: 'd1b94e82-e3e7-4c74-bfd4-3a56df93df29',
};

const n8nClaim = {
  ...claim,
  automation_endpoint: 'https://mednetn8n.duckdns.org/webhook/automacoes/BOT_MaxtrackRelatorios',
};

function okResponse(payload = { detail: 'Job aceito' }) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  };
}

const silentLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
const allowEndpoint = async () => {};

describe('automation scheduler', () => {
  it('mantem a chave de despacho entre claims da mesma ocorrencia', () => {
    const reclaimed = {
      ...n8nClaim,
      claim_id: 'e2b94e82-e3e7-4c74-bfd4-3a56df93df30',
    };

    expect(buildAutomationDispatchKey(reclaimed)).toBe(buildAutomationDispatchKey(n8nClaim));
    expect(buildAutomationDispatchKey({
      ...reclaimed,
      scheduled_for: '2026-07-13T15:05:00.000Z',
    })).not.toBe(buildAutomationDispatchKey(n8nClaim));
  });

  it('aciona o webhook, registra o log e finaliza a reivindicação', async () => {
    const supabase = createSupabase([claim]);
    const fetchImpl = vi.fn(async () => okResponse());

    await expect(runAutomationSchedulerTick(supabase, { fetchImpl, endpointValidator: allowEndpoint })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledWith(
      claim.automation_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Idempotency-Key': buildAutomationDispatchKey(claim),
        }),
      }),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({});
    expect(supabase.insert).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_automation_id: claim.automation_id,
      p_claim_id: claim.claim_id,
      p_success: true,
    }));
  });

  it('não faz chamadas externas quando não há horários vencidos', async () => {
    const supabase = createSupabase([]);
    const fetchImpl = vi.fn();

    await expect(runAutomationSchedulerTick(supabase, { fetchImpl, endpointValidator: allowEndpoint })).resolves.toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it('repete falha EAI_AGAIN anterior ao envio com a mesma chave', async () => {
    const supabase = createSupabase([n8nClaim]);
    const dnsError = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'EAI_AGAIN' },
    });
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(dnsError)
      .mockResolvedValueOnce(okResponse({ detail: 'Workflow was started' }));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe(buildAutomationDispatchKey(n8nClaim));
    expect(fetchImpl.mock.calls[1][1].headers['Idempotency-Key']).toBe(buildAutomationDispatchKey(n8nClaim));
    expect(fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[1][1].body);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).idempotency_key)
      .toBe(buildAutomationDispatchKey(n8nClaim));
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      logs: expect.arrayContaining([
        expect.objectContaining({ m: expect.stringContaining('Tentativa 1/3 falhou') }),
        expect.objectContaining({ m: 'Webhook confirmado na tentativa 2/3.' }),
      ]),
    }));
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: true,
      p_error: null,
    }));
  });

  it('repete falha DNS EAI_AGAIN antes de iniciar o fetch', async () => {
    const supabase = createSupabase([n8nClaim]);
    const dnsError = Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
    const endpointValidator = vi.fn()
      .mockRejectedValueOnce(dnsError)
      .mockResolvedValueOnce();
    const fetchImpl = vi.fn(async () => okResponse({ detail: 'Workflow was started' }));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(endpointValidator).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: true,
      p_error: null,
    }));
  });

  it('nao repete HTTP 500 porque o receptor pode ter iniciado o workflow', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ error: 'temporariamente indisponivel' }),
      })
      .mockResolvedValueOnce(okResponse());

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
    }));
  });

  it('respeita Retry-After do HTTP 503 antes da nova tentativa', async () => {
    vi.useFakeTimers();
    try {
      const supabase = createSupabase([n8nClaim]);
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: { get: vi.fn(() => '5') },
          text: async () => JSON.stringify({ error: 'no available server' }),
        })
        .mockResolvedValueOnce(okResponse());

      const pending = runAutomationSchedulerTick(supabase, {
        fetchImpl,
        endpointValidator: allowEndpoint,
        logger: silentLogger,
        webhookRetryBaseDelayMs: 0,
      });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(fetchImpl).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toBe(1);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('nao repete 503 com texto apenas parecido com a resposta do proxy', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ error: 'workflow falhou: no available server depois do envio' }),
    });

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('não repete HTTP 400 porque exige correção de configuração', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'payload invalido' }),
    });

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure' }));
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'Webhook respondeu HTTP 400: payload invalido',
    }));
  });

  it('registra falha somente depois de esgotar as três tentativas', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn().mockRejectedValue(
      Object.assign(new TypeError('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure',
      detail: 'connect ECONNREFUSED após 3 tentativas',
      logs: expect.arrayContaining([
        expect.objectContaining({ m: expect.stringContaining('Tentativa 1/3 falhou') }),
        expect.objectContaining({ m: expect.stringContaining('Tentativa 2/3 falhou') }),
        expect.objectContaining({ m: 'Falha: connect ECONNREFUSED após 3 tentativas' }),
      ]),
    }));
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'connect ECONNREFUSED após 3 tentativas',
    }));
  });

  it('aplica o deadline tambem quando o validador DNS nunca responde', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn();
    const endpointValidator = vi.fn(() => new Promise(() => {}));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
      webhookTimeoutMs: 5,
    })).resolves.toBe(1);

    expect(endpointValidator).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'The operation was aborted due to timeout. Resultado do envio incerto; nova tentativa bloqueada para evitar duplicidade.',
    }));
  });

  it('nao repete timeout com resultado de envio incerto', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn(() => new Promise(() => {}));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
      webhookTimeoutMs: 5,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'The operation was aborted due to timeout. Resultado do envio incerto; nova tentativa bloqueada para evitar duplicidade.',
    }));
  });

  it('nao repete fetch failed sem causa comprovadamente anterior ao envio', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator: allowEndpoint,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'fetch failed. Resultado do envio incerto; nova tentativa bloqueada para evitar duplicidade.',
    }));
  });

  it('limita o tempo da RPC que reivindica agendamentos', async () => {
    const supabase = {
      rpc: vi.fn(() => new Promise(() => {})),
      from: vi.fn(),
    };

    await expect(runAutomationSchedulerTick(supabase, {
      schedulerDbTimeoutMs: 5,
    })).rejects.toMatchObject({
      name: 'TimeoutError',
      code: 'ETIMEDOUT',
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('nao bloqueia o tick quando a finalizacao da claim fica pendurada', async () => {
    const rpc = vi.fn((name) => {
      if (name === 'claim_due_automations') return Promise.resolve({ data: [n8nClaim], error: null });
      if (name === 'finish_automation_schedule') return new Promise(() => {});
      throw new Error(`RPC inesperada: ${name}`);
    });
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { rpc, from: vi.fn(() => ({ insert })) };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl: vi.fn(async () => okResponse()),
      endpointValidator: allowEndpoint,
      logger,
      schedulerDbTimeoutMs: 5,
    })).resolves.toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      '[Automation Scheduler] Falha ao finalizar agendamento:',
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
  });

  it('sinaliza quando a finalizacao perde o ownership da claim', async () => {
    const rpc = vi.fn((name) => {
      if (name === 'claim_due_automations') return Promise.resolve({ data: [n8nClaim], error: null });
      if (name === 'finish_automation_schedule') return Promise.resolve({ data: false, error: null });
      throw new Error(`RPC inesperada: ${name}`);
    });
    const insert = vi.fn(async () => ({ error: null }));
    const supabase = { rpc, from: vi.fn(() => ({ insert })) };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl: vi.fn(async () => okResponse()),
      endpointValidator: allowEndpoint,
      logger,
    })).resolves.toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      '[Automation Scheduler] Falha ao finalizar agendamento:',
      expect.objectContaining({ code: 'AUTOMATION_CLAIM_OWNERSHIP_LOST' }),
    );
  });

  it('bloqueia endpoint inseguro antes do fetch e finaliza como falha', async () => {
    const supabase = createSupabase([{ ...claim, automation_endpoint: 'https://localhost/internal' }]);
    const fetchImpl = vi.fn();
    const endpointValidator = vi.fn(async () => {
      throw new Error('Host local nao e permitido.');
    });

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      endpointValidator,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(endpointValidator).toHaveBeenCalledOnce();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'Host local nao e permitido.',
    }));
  });
});
