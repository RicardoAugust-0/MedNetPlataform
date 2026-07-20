import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { detect, parse } from './parser.js';

// polyfill FileReader minimal surface for Node environment
beforeAll(() => {
  if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = class {
      readAsArrayBuffer(file) {
        file.arrayBuffer().then(
          (buf) => { this.result = buf; this.onload?.({ target: { result: buf } }); },
          (err) => { this.onerror?.(err); },
        );
      }
    };
  }
});

function buildXlsxFile(rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buffer], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const HORA_BASE = '01/05/2026 10:00:00';

function row(overrides = {}) {
  return {
    'Placa':               'XYZ9A87',
    'Evento':              'Bocejo',
    'Data da ocorrência':  HORA_BASE,
    'Status':              'Pendente',
    'Origem do motorista': 'Empresa Omni',
    'Motorista':           'Carlos',
    'Velocidade':          45,
    'Tratado por':         'hevilyntfzero@gmail.com',
    ...overrides,
  };
}

describe('OmniLink parser · detect', () => {
  it('detecta corretamente com base nas headers obrigatórias', () => {
    const score = detect({
      fileName: 'omnilink_export.xlsx',
      headers: ['Placa', 'Evento', 'Data da ocorrência'],
    });
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('score 0 quando nenhuma header bate', () => {
    expect(detect({ fileName: 'file.xlsx', headers: ['colA', 'colB'] })).toBe(0);
  });
});

describe('OmniLink parser · parse() integration', () => {
  it('produz driver com bucket de intervenção para Bocejo', async () => {
    const file = buildXlsxFile([row()]);
    const { drivers, stats } = await parse(file);
    expect(drivers).toHaveLength(1);
    expect(drivers[0].placa).toBe('XYZ9A87');
    expect(drivers[0].alertas).toBe(1);
    expect(drivers[0].reportaveis).toBe(0);
    expect(drivers[0].tecnicos).toBe(0);
    expect(stats.comIntervencao).toBe(1);
  });

  it('classifica eventos técnicos no bucket técnico', async () => {
    const file = buildXlsxFile([row({ Evento: 'Ausência de motorista' })]);
    const { drivers } = await parse(file);
    expect(drivers[0].alertas).toBe(0);
    expect(drivers[0].tecnicos).toBe(1);
  });

  it('classifica outros eventos no bucket reportar', async () => {
    const file = buildXlsxFile([row({ Evento: 'Aceleração brusca' })]);
    const { drivers } = await parse(file);
    expect(drivers[0].alertas).toBe(0);
    expect(drivers[0].reportaveis).toBe(1);
  });

  it('descarta falsos positivos e descartados', async () => {
    const file = buildXlsxFile([
      row(),
      row({ Status: 'Falso positivo' }),
      row({ Status: 'Descartado' }),
    ]);
    const { drivers, stats } = await parse(file);
    expect(drivers[0].alertas).toBe(1);
    expect(stats.falsosPositivos).toBe(2);
  });

  it('descarta falsos positivos baseados em Método de processamento e mapeia analise_ia_plataforma', async () => {
    const file = buildXlsxFile([
      row({ 'Método de processamento': 'Evento confirmado' }),
      row({ 'Método de processamento': 'Falso positivo - equipamento' }),
    ]);
    const { drivers, stats, rawEventRows } = await parse(file);
    expect(drivers).toHaveLength(1);
    expect(stats.falsosPositivos).toBe(1);
    expect(rawEventRows).toHaveLength(2);
    expect(rawEventRows[0].analise_ia_plataforma).toBe('Positivo');
    expect(rawEventRows[1].analise_ia_plataforma).toBe('Falso positivo');
  });

  it('filtra eventos que nao foram tratados por hevilyntfzero@gmail.com', async () => {
    const file = buildXlsxFile([
      row({ 'Tratado por': 'hevilyntfzero@gmail.com' }),
      row({ 'Tratado por': 'outro@gmail.com' }),
      row({ 'Tratado por': '' }),
    ]);
    const { drivers } = await parse(file);
    expect(drivers).toHaveLength(1);
    expect(drivers[0].alertas).toBe(1);
  });

  it('filtra eventos com velocidade < 10 km/h', async () => {
    const file = buildXlsxFile([
      row({ Velocidade: 5 }),
      row({ Velocidade: 15 }),
    ]);
    const { drivers, stats } = await parse(file);
    expect(stats.filtradosPorVelocidade).toBe(1);
    expect(drivers[0].alertas).toBe(1);
  });

  it('determina severidade baseada no nome do evento', async () => {
    const file = buildXlsxFile([
      row({ Evento: 'Bocejo' }), // Grave
      row({ Evento: 'Fadiga extrema' }), // Gravíssimo
    ]);
    const { drivers } = await parse(file);
    expect(drivers[0].severidade).toBe('Gravíssimo');
  });
});
