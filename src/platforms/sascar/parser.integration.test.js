// Integration test: build an in-memory XLSX matching the Sascar export schema
// and run the real parse() against it. Catches regressions in the full pipeline
// (header detection, filtering, grouping, classification, stats).

import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';
import { parse } from './parser.js';
import { applyHistoryFilter } from '../shared/history.js';

// node >= 20 ships File globally; vitest's default environment is node, which
// lacks FileReader. We polyfill the minimal surface used by parse().
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
    'Placa':            'ABC1A23',
    'Evento':           'Bocejo',
    'Categoria':        'Fadiga',
    'Hora do evento':   HORA_BASE,
    'Severidade':       'Grave',
    'Status':           'Pendente',
    'Transportadora':   'Empresa X',
    'Motorista':        'João',
    'Frota':            '101',
    'Velocidade Atual': 50,
    ...overrides,
  };
}

describe('Sascar parser · parse() integration', () => {
  it('produz driver com bucket de intervenção para Bocejo', async () => {
    const file = buildXlsxFile([row()]);
    const { drivers, stats } = await parse(file);
    expect(drivers).toHaveLength(1);
    expect(drivers[0].placa).toBe('ABC1A23');
    expect(drivers[0].alertas).toBe(1);
    expect(drivers[0].reportaveis).toBe(0);
    expect(drivers[0].tecnicos).toBe(0);
    expect(stats.comIntervencao).toBe(1);
  });

  it('classifica eventos técnicos no bucket técnico', async () => {
    const file = buildXlsxFile([row({ Evento: 'Perda de vídeo', Categoria: 'Câmera' })]);
    const { drivers } = await parse(file);
    expect(drivers[0].alertas).toBe(0);
    expect(drivers[0].tecnicos).toBe(1);
  });

  it('classifica eventos desconhecidos no bucket reportar', async () => {
    const file = buildXlsxFile([row({ Evento: 'Aceleração brusca', Categoria: 'Direção' })]);
    const { drivers } = await parse(file);
    expect(drivers[0].alertas).toBe(0);
    expect(drivers[0].reportaveis).toBe(1);
  });

  it('descarta falsos positivos (não contam em drivers, contam em stats.falsosPositivos)', async () => {
    const file = buildXlsxFile([
      row(),
      row({ Status: 'Falso positivo' }),
      row({ Status: 'Falso positivo' }),
    ]);
    const { drivers, stats } = await parse(file);
    expect(drivers[0].alertas).toBe(1);
    expect(stats.falsosPositivos).toBe(2);
  });

  it('filtra eventos com velocidade < 10 km/h', async () => {
    const file = buildXlsxFile([
      row({ 'Velocidade Atual': 5 }),
      row({ 'Velocidade Atual': 15 }),
    ]);
    const { drivers, stats } = await parse(file);
    expect(stats.filtradosPorVelocidade).toBe(1);
    expect(drivers[0].alertas).toBe(1);
  });

  it('agrupa por placa preservando dados do motorista', async () => {
    const file = buildXlsxFile([
      row({ Placa: 'AAA1A11', Motorista: 'Ana',  Evento: 'Bocejo' }),
      row({ Placa: 'AAA1A11', Motorista: 'Ana',  Evento: 'Olho fechado' }),
      row({ Placa: 'BBB2B22', Motorista: 'Beto', Evento: 'Bocejo' }),
    ]);
    const { drivers } = await parse(file);
    expect(drivers).toHaveLength(2);
    const ana = drivers.find(d => d.placa === 'AAA1A11');
    expect(ana.alertas).toBe(2);
    expect(ana.nome).toBe('Ana');
  });

  it('detecta Distração Genérica via combo evento+categoria', async () => {
    const file = buildXlsxFile([row({ Evento: 'Distração', Categoria: 'Genérica' })]);
    const { drivers } = await parse(file);
    expect(drivers[0].alertas).toBe(1);
  });

  it('respeita filtro de histórico: eventos antes do último atendimento são removidos', async () => {
    const file = buildXlsxFile([
      row({ 'Hora do evento': '01/05/2026 09:00:00' }), // antes do clear
      row({ 'Hora do evento': '01/05/2026 11:00:00' }), // depois do clear
    ]);
    const history = [
      { placa: 'ABC1A23', tipo: 'intervencao', created_at: '2026-05-01T13:00:00Z' }, // 10:00 -3h BRT
    ];
    // Nota: parseEventDate constrói Date local; created_at vem em UTC. Para tornar
    // o teste estável independente de TZ, usamos um clear claramente depois do primeiro
    // evento e antes do segundo no relógio local do runner.
    const local0900 = new Date(2026, 4, 1, 9, 0, 0);
    const local1100 = new Date(2026, 4, 1, 11, 0, 0);
    const clearISO = new Date(local0900.getTime() + 60 * 60 * 1000).toISOString(); // 10h local
    history[0].created_at = clearISO;

    const { drivers: raw } = await parse(file);
    const { drivers, filtradosPorHistorico } = applyHistoryFilter(raw, history);
    expect(drivers[0].alertas).toBe(1); // só o de 11h
    expect(filtradosPorHistorico).toBe(1);
    // sanity check para evitar warning de unused-var em alguns linters
    expect(local1100).toBeInstanceOf(Date);
  });

  it('calcula severidade máxima entre intervenção + reportar (técnicos não contam)', async () => {
    const file = buildXlsxFile([
      row({ Severidade: 'Normal' }),
      row({ Evento: 'Perda de vídeo', Categoria: 'Câmera', Severidade: 'Gravíssimo' }), // técnico → não conta
      row({ Evento: 'Aceleração',     Severidade: 'Grave' }),                            // reportar
    ]);
    const { drivers } = await parse(file);
    expect(drivers[0].severidade).toBe('Grave');
  });

  it('stats.total reflete número de drivers únicos por placa', async () => {
    const file = buildXlsxFile([
      row({ Placa: 'AAA1A11' }),
      row({ Placa: 'AAA1A11' }),
      row({ Placa: 'BBB2B22' }),
    ]);
    const { stats } = await parse(file);
    expect(stats.total).toBe(2);
  });
});
