import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getImportAuthority, handleImportEvents, readUploadHeaders } from './analytics-import.js';

describe('getImportAuthority', () => {
  it('torna operador e fim da tratativa autoritativos no layout MaxTrack completo', () => {
    expect(getImportAuthority({
      platformId: 'maxtrack',
      headers: ['Data', 'Operador - Última Atualização', 'Data finalização evento'],
      mapping: {
        operator: 'Operador - Última Atualização',
        treatEnd: 'Data finalização evento',
      },
    })).toEqual({
      p_authoritative_operator: true,
      p_authoritative_treatment_end: true,
    });
  });

  it('não limpa dados antigos quando as colunas não existem no arquivo', () => {
    expect(getImportAuthority({
      platformId: 'maxtrack',
      headers: ['Data', 'Identificador/Placa', 'Nome'],
      mapping: {
        operator: null,
        treatEnd: null,
      },
    })).toEqual({
      p_authoritative_operator: false,
      p_authoritative_treatment_end: false,
    });
  });

  it('não aplica a regra financeira da MaxTrack a outras plataformas', () => {
    expect(getImportAuthority({
      platformId: 'horizon',
      headers: ['Operador - Última Atualização', 'Data finalização evento'],
      mapping: {
        operator: 'Operador - Última Atualização',
        treatEnd: 'Data finalização evento',
      },
    })).toEqual({
      p_authoritative_operator: false,
      p_authoritative_treatment_end: false,
    });
  });
});

describe('handleImportEvents · colunas financeiras MaxTrack', () => {
  it('envia células vazias como nulas e autoritativas para limpar valores antigos', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = { rpc };
    const headers = [
      'Data',
      'Identificador/Placa',
      'Nome',
      'Operador - Última Atualização',
      'Data finalização evento',
    ];
    const req = {
      files: [{
        originalname: 'maxtrack.csv',
        mimetype: 'text/csv',
        buffer: Buffer.from([
          headers.join(';'),
          '2026-07-15T11:00:00Z;ABC1D23;Fadiga;;',
        ].join('\n')),
      }],
      body: {
        platformId: 'maxtrack',
        operatorEmail: '',
        mapping: JSON.stringify({
          datetime: 'Data',
          plate: 'Identificador/Placa',
          type: 'Nome',
          operator: 'Operador - Última Atualização',
          treatEnd: 'Data finalização evento',
        }),
      },
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await handleImportEvents(supabase, req, res, vi.fn());

    expect(rpc).toHaveBeenCalledWith('upsert_driver_events_preserve', expect.objectContaining({
      p_authoritative_operator: true,
      p_authoritative_treatment_end: true,
      p_rows: [expect.objectContaining({
        operador: null,
        fim_tratativa: null,
      })],
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('processa CSV armazenado em disco sem depender de file.buffer', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mednet-import-test-'));
    const filePath = path.join(tempDir, 'maxtrack.csv');
    const headers = ['Data', 'Identificador/Placa', 'Nome'];
    await writeFile(filePath, [
      headers.join(';'),
      '2026-07-20T13:00:00Z;ABC1D23;Fadiga',
    ].join('\n'));

    const file = {
      originalname: 'maxtrack.csv',
      mimetype: 'text/csv',
      path: filePath,
      size: 100,
    };
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    try {
      await expect(readUploadHeaders(file)).resolves.toEqual(headers);
      await handleImportEvents({ rpc }, {
        files: [file],
        body: {
          platformId: 'maxtrack',
          operatorEmail: '',
          mapping: JSON.stringify({
            datetime: 'Data',
            plate: 'Identificador/Placa',
            type: 'Nome',
          }),
        },
      }, res, vi.fn());

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        uniqueSavedCount: 1,
      }));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
