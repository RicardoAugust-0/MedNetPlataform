import { describe, expect, it, vi } from 'vitest';
import {
  getSpreadsheetUploadConfig,
  handleImportEvents,
  isAllowedSpreadsheetFile,
} from './analytics-import.js';

function responseMock() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('spreadsheet upload security', () => {
  it('le limites configuraveis de quantidade e tamanho', () => {
    const config = getSpreadsheetUploadConfig({
      UPLOAD_MAX_FILES: '3',
      UPLOAD_MAX_FILE_SIZE_MB: '12',
      UPLOAD_MAX_TOTAL_MB: '24',
      UPLOAD_ALLOWED_EXTENSIONS: '.csv,.xlsx',
      UPLOAD_ALLOWED_MIME_TYPES: 'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    expect(config).toEqual(expect.objectContaining({
      maxFiles: 3,
      maxFileSizeBytes: 12 * 1024 * 1024,
      maxTotalBytes: 24 * 1024 * 1024,
      allowedExtensions: ['.csv', '.xlsx'],
    }));
  });

  it('exige extensao e MIME permitidos', () => {
    const config = getSpreadsheetUploadConfig({});
    expect(isAllowedSpreadsheetFile({ originalname: 'dados.csv', mimetype: 'text/csv' }, config)).toBe(true);
    expect(isAllowedSpreadsheetFile({ originalname: 'dados.exe', mimetype: 'text/csv' }, config)).toBe(false);
    expect(isAllowedSpreadsheetFile({ originalname: 'dados.xlsx', mimetype: 'application/octet-stream' }, config)).toBe(false);
  });

  it('rejeita plataforma e mapping invalidos antes de analisar o arquivo', async () => {
    const file = { originalname: 'dados.csv', mimetype: 'text/csv', buffer: Buffer.from('x') };
    let res = responseMock();
    await handleImportEvents({}, {
      files: [file],
      body: { platformId: 'plataforma_inexistente', mapping: '{}' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'platformId invalido.' });

    res = responseMock();
    await handleImportEvents({}, {
      files: [file],
      body: { platformId: 'maxtrack', mapping: '[]' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Mapeamento invalido no corpo da requisicao.' });
  });
});
