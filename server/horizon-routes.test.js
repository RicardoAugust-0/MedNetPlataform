import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildHorizonCredentialUpdate,
  buildTreatmentResolutionUpdate,
  inspectHorizonExport,
  toTreatmentQueuePayload,
} from './horizon-routes.js';

const HORIZON_HEADERS = [
  'Data/Hora Evento',
  'Motorista / Comandante',
  'Placa / Empurrador',
  'Gravidade',
  'Evento',
];

describe('buildHorizonCredentialUpdate', () => {
  const now = new Date('2026-07-15T15:30:00Z');

  it('mantem falha operacional elegivel e preserva o diagnostico', () => {
    expect(buildHorizonCredentialUpdate(null, {
      status: 'session_expired',
      loginError: 'Captcha sem resposta.',
    }, now)).toEqual({
      status: 'session_expired',
      last_error: 'Captcha sem resposta.',
      updated_at: '2026-07-15T15:30:00.000Z',
    });
  });

  it('limpa o erro anterior quando o login volta a funcionar', () => {
    expect(buildHorizonCredentialUpdate(null, {
      status: 'ok',
    }, now)).toEqual({
      status: 'ok',
      last_login_at: '2026-07-15T15:30:00.000Z',
      last_error: null,
      updated_at: '2026-07-15T15:30:00.000Z',
    });
  });

  it('promove candidata sem perder a rotacao anterior', () => {
    expect(buildHorizonCredentialUpdate({
      password: 'senha-atual',
      password_candidates: ['senha-anterior', 'senha-funcional'],
    }, {
      status: 'ok',
      workingPassword: 'senha-funcional',
    }, now)).toEqual({
      password: 'senha-funcional',
      password_candidates: ['senha-atual', 'senha-anterior'],
      status: 'ok',
      last_login_at: '2026-07-15T15:30:00.000Z',
      last_error: null,
      updated_at: '2026-07-15T15:30:00.000Z',
    });
  });
});

describe('inspectHorizonExport', () => {
  it('reconhece CSV Horizon valido sem nenhuma linha de eventos', () => {
    const file = {
      originalname: 'dados_ALP_2026-07-13.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from(HORIZON_HEADERS.join(';') + '\n'),
    };

    await expect(inspectHorizonExport(file)).resolves.toMatchObject({
      hasHorizonLayout: true,
      isValidEmpty: true,
      dataRows: [],
    });
  });

  it('reconhece XLSX Horizon valido sem nenhuma linha de eventos', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([HORIZON_HEADERS]), 'Eventos');
    const file = {
      originalname: 'dados_ALP_2026-07-13.xlsx',
      mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    };

    await expect(inspectHorizonExport(file)).resolves.toMatchObject({
      hasHorizonLayout: true,
      isValidEmpty: true,
      dataRows: [],
    });
  });

  it('mantem export Horizon com eventos no fluxo normal de importacao', () => {
    const eventRow = ['13/07/2026 10:30:00', 'Motorista', 'ABC1D23', 'Grave', 'Fadiga'];
    const file = {
      originalname: 'dados_ALP_2026-07-13.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from([HORIZON_HEADERS.join(';'), eventRow.join(';')].join('\n')),
    };

    await expect(inspectHorizonExport(file)).resolves.toMatchObject({
      hasHorizonLayout: true,
      isValidEmpty: false,
      dataRows: [eventRow],
    });
  });

  it('nao aceita arquivo vazio desconhecido como export Horizon sem eventos', () => {
    const file = {
      originalname: 'dados_ALP_2026-07-13.csv',
      mimetype: 'text/csv',
      buffer: Buffer.from('download indisponivel\n'),
    };

    await expect(inspectHorizonExport(file)).resolves.toMatchObject({
      hasHorizonLayout: false,
      isValidEmpty: false,
    });
  });
});

describe('toTreatmentQueuePayload', () => {
  it('entrega ao robo a placa e o horario exatos do evento Horizon', () => {
    const payload = toTreatmentQueuePayload({
      id: 'queue-id',
      placa: 'TLH7I01',
      ocorrido_em: '2026-07-13T15:03:10Z',
      horizon_event: {
        placa: 'TLH-7I01',
        ocorrido_em: '2026-07-13T15:15:25Z',
      },
    });

    expect(payload).toEqual({
      id: 'queue-id',
      placa: 'TLH7I01',
      ocorrido_em: '2026-07-13T15:03:10Z',
      horizon_placa: 'TLH-7I01',
      horizon_ocorrido_em: '2026-07-13T15:15:25Z',
    });
  });

  it('mantem fallback compativel para filas legadas sem join Horizon', () => {
    const payload = toTreatmentQueuePayload({
      id: 'queue-id',
      placa: 'ABC1D23',
      ocorrido_em: '2026-07-13T12:00:00Z',
      horizon_event: null,
    });

    expect(payload.horizon_placa).toBe('ABC1D23');
    expect(payload.horizon_ocorrido_em).toBe('2026-07-13T12:00:00Z');
  });
});

describe('buildTreatmentResolutionUpdate', () => {
  const now = new Date('2026-07-13T16:45:00Z');

  it('encerra alerta ausente da grade como ja sincronizado sem consumir tentativa', () => {
    expect(buildTreatmentResolutionUpdate('already_synced', 'nao localizado', 2, now)).toEqual({
      status: 'already_synced',
      tentativas: 0,
      erro: null,
      claimed_at: null,
      lease_expires_at: null,
      updated_at: '2026-07-13T16:45:00.000Z',
    });
  });

  it('mantem retry para uma falha operacional transitoria', () => {
    expect(buildTreatmentResolutionUpdate('error', 'timeout', 1, now)).toEqual({
      status: 'pending',
      tentativas: 2,
      erro: 'timeout',
      claimed_at: null,
      lease_expires_at: null,
      updated_at: '2026-07-13T16:45:00.000Z',
    });
  });
});
