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
  automation_endpoint: 'https://bots.example/automacoes/maxtrack',
  automation_token: 'secret',
  scheduled_for: '2026-07-13T15:00:00.000Z',
  claim_id: 'd1b94e82-e3e7-4c74-bfd4-3a56df93df29',
};

describe('automation scheduler', () => {
  it('aciona o webhook, registra o log e finaliza a reivindicação', async () => {
    const supabase = createSupabase([claim]);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ detail: 'Job aceito' }),
    }));

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
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      automation_id: claim.automation_id,
      status: 'success',
      detail: 'Job aceito',
    }));
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
});
