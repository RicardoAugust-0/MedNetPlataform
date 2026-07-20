import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAiChatRoutes, validateInternalPdfPayload } from './ai-chat-routes.js';

const USER_ID = '123e4567-e89b-42d3-a456-426614174000';

function captureRoutes() {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers); },
    delete(path, ...handlers) { routes.set(`DELETE ${path}`, handlers); },
  };
  registerAiChatRoutes(app, {});
  return routes;
}

function responseMock() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

afterEach(() => vi.unstubAllEnvs());

describe('internal PDF validation', () => {
  it('aceita payload estritamente limitado', () => {
    expect(validateInternalPdfPayload({
      userId: USER_ID,
      title: ' Relatorio ',
      content: '# Conteudo',
      subtitle: 'Periodo',
    }, 1024)).toEqual({
      value: {
        userId: USER_ID,
        title: 'Relatorio',
        content: '# Conteudo',
        subtitle: 'Periodo',
      },
    });
  });

  it('rejeita UUID, campos e conteudo acima do limite', () => {
    expect(validateInternalPdfPayload({ userId: 'x', title: 'A', content: 'B' }).error).toMatch(/userId/);
    expect(validateInternalPdfPayload({ userId: USER_ID, title: '', content: 'B' }).error).toMatch(/title/);
    expect(validateInternalPdfPayload({ userId: USER_ID, title: 'A', content: 'áá' }, 3).error).toMatch(/content/);
    expect(validateInternalPdfPayload({ userId: USER_ID, title: 'A', content: 'B', subtitle: 'x'.repeat(501) }).error).toMatch(/subtitle/);
  });
});

describe('internal PDF route', () => {
  it('falha fechado sem INTERNAL_API_KEY', async () => {
    vi.stubEnv('INTERNAL_API_KEY', '');
    const handler = captureRoutes().get('POST /api/ai/internal/generate-pdf').at(-1);
    const res = responseMock();
    await handler({ headers: {}, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejeita segredo incorreto antes de validar o payload', async () => {
    vi.stubEnv('INTERNAL_API_KEY', 'segredo-correto');
    const handler = captureRoutes().get('POST /api/ai/internal/generate-pdf').at(-1);
    const res = responseMock();
    await handler({ headers: { 'x-internal-key': 'segredo-incorreto' }, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejeita payload invalido com segredo correto', async () => {
    vi.stubEnv('INTERNAL_API_KEY', 'segredo-correto');
    const handler = captureRoutes().get('POST /api/ai/internal/generate-pdf').at(-1);
    const res = responseMock();
    await handler({
      headers: { 'x-internal-key': 'segredo-correto' },
      body: { userId: 'invalido', title: 'Relatorio', content: 'texto' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
