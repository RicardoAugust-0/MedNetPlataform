import { describe, expect, it, vi } from 'vitest';
import { runAutomationSchedulerTick } from './automation-scheduler.js';

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

describe('automation scheduler', () => {
  it('aciona o webhook, registra o log e finaliza a reivindicação', async () => {
    const supabase = createSupabase([claim]);
    const fetchImpl = vi.fn(async () => okResponse());

    await expect(runAutomationSchedulerTick(supabase, { fetchImpl })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledWith(
      claim.automation_endpoint,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Idempotency-Key': claim.claim_id,
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

    await expect(runAutomationSchedulerTick(supabase, { fetchImpl })).resolves.toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(supabase.insert).not.toHaveBeenCalled();
  });

  it('repete fetch failed com a mesma chave e conclui na segunda tentativa', async () => {
    const supabase = createSupabase([n8nClaim]);
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse({ detail: 'Workflow was started' }));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe(n8nClaim.claim_id);
    expect(fetchImpl.mock.calls[1][1].headers['Idempotency-Key']).toBe(n8nClaim.claim_id);
    expect(fetchImpl.mock.calls[0][1].body).toBe(fetchImpl.mock.calls[1][1].body);
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

  it('repete HTTP 500 e conclui quando o n8n se recupera', async () => {
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
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: true,
    }));
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
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(runAutomationSchedulerTick(supabase, {
      fetchImpl,
      logger: silentLogger,
      webhookRetryBaseDelayMs: 0,
    })).resolves.toBe(1);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failure',
      detail: 'fetch failed após 3 tentativas',
      logs: expect.arrayContaining([
        expect.objectContaining({ m: expect.stringContaining('Tentativa 1/3 falhou') }),
        expect.objectContaining({ m: expect.stringContaining('Tentativa 2/3 falhou') }),
        expect.objectContaining({ m: 'Falha: fetch failed após 3 tentativas' }),
      ]),
    }));
    expect(supabase.rpc).toHaveBeenCalledWith('finish_automation_schedule', expect.objectContaining({
      p_success: false,
      p_error: 'fetch failed após 3 tentativas',
    }));
  });
});
