import { describe, it, expect } from 'vitest';
import { parse } from './parser.js';
import { COLUMNS } from './columns.js';

// Helper to construct a mock Maxtrack CSV File object
function buildCsvFile(rows) {
  const headers = [
    'Identificador/Placa',
    'Motorista',
    'CPF',
    'Matricula do Motorista',
    'Empresa',
    'Frota',
    'Nome',
    'Descrição',
    'Criticidade',
    'Data',
    'Velocidade Inicial',
    'Localidade',
    'Duração',
    'Análise de IA',
    'Id do Evento',
    'Status'
  ];

  const csvRows = [headers.join(';')];
  for (const r of rows) {
    const line = headers.map(h => {
      const key = Object.keys(COLUMNS).find(k => COLUMNS[k] === h);
      return r[key] !== undefined ? String(r[key]) : '';
    });
    csvRows.push(line.join(';'));
  }

  const content = csvRows.join('\n');
  return new File([content], 'maxtrack_export.csv', { type: 'text/csv' });
}

const EVENT_DATE_BASE = '27/05/2026 15:00:00';

function mockRow(overrides = {}) {
  return {
    placa:          'XYZ9H99',
    motorista:      'Jane Doe',
    cpf:            '12345678901',
    matricula:      '98765',
    transportadora: 'Transportadora ABC',
    frota:          'F12',
    evento:         'Detecção de bocejo',
    descricao:      'Bocejo detectado pela câmera',
    severidade:     'Grave',
    hora:           EVENT_DATE_BASE,
    velocidade:     '55',
    localidade:     'Rodovia BR-116 KM 10',
    duracao:        '4.5 segundos',
    analise_ia:     'Confirmado',
    id_evento:      '9999',
    status:         'Novo',
    ...overrides,
  };
}

describe('Maxtrack parser · status filtering', () => {
  it('processa alertas abertos (Novo) normalmente', async () => {
    const file = buildCsvFile([
      mockRow({ status: 'Novo' }),
    ]);

    const { drivers, stats, rawEventRows } = await parse(file);

    expect(drivers).toHaveLength(1);
    expect(drivers[0].placa).toBe('XYZ9H99');
    expect(drivers[0].alertas).toBe(1);
    expect(stats.totalFechados).toBe(0);
    expect(stats.totalEventos).toBe(1);
    expect(rawEventRows).toHaveLength(1);
    expect(rawEventRows[0].placa).toBe('XYZ9H99');
    expect(rawEventRows[0].nome_evento).toBe('Detecção de bocejo');
  });

  it('filtra alertas finalizados (Finalizado e Auto Finalizado)', async () => {
    const file = buildCsvFile([
      mockRow({ placa: 'AAA1A11', status: 'Finalizado' }),
      mockRow({ placa: 'BBB2B22', status: 'Auto Finalizado (complementar)' }),
      mockRow({ placa: 'CCC3C33', status: 'Novo' }),
    ]);

    const { drivers, stats, rawEventRows } = await parse(file);

    // Somente CCC3C33 (Novo) entra em drivers
    expect(drivers).toHaveLength(1);
    expect(drivers[0].placa).toBe('CCC3C33');
    expect(drivers[0].alertas).toBe(1);

    // totalFechados deve ser 2, mas totalEventos deve continuar contando todos (3)
    expect(stats.totalFechados).toBe(2);
    expect(stats.totalEventos).toBe(3);

    // Todos os 3 eventos devem ser persistidos em rawEventRows
    expect(rawEventRows).toHaveLength(3);
    const rawPlacas = rawEventRows.map(r => r.placa);
    expect(rawPlacas).toContain('AAA1A11');
    expect(rawPlacas).toContain('BBB2B22');
    expect(rawPlacas).toContain('CCC3C33');
  });

  it('trata status misto na mesma placa corretamente', async () => {
    const file = buildCsvFile([
      mockRow({ placa: 'XYZ9H99', status: 'Finalizado', evento: 'Detecção de bocejo' }),
      mockRow({ placa: 'XYZ9H99', status: 'Novo', evento: 'Detecção olhos fechados ou falta de atenção - N1' }),
    ]);

    const { drivers, stats, rawEventRows } = await parse(file);

    // O driver XYZ9H99 deve entrar na fila operacional, mas somente com 1 alerta (o "Novo")
    expect(drivers).toHaveLength(1);
    expect(drivers[0].placa).toBe('XYZ9H99');
    expect(drivers[0].alertas).toBe(1);
    expect(drivers[0].tipos).toHaveLength(1);
    expect(drivers[0].tipos[0]).toBe('Detecção olhos fechados ou falta de atenção - N1');

    expect(stats.totalFechados).toBe(1);
    expect(stats.totalEventos).toBe(2);

    // Ambos devem ser persistidos
    expect(rawEventRows).toHaveLength(2);
  });

  it('processa alertas finalizados mesmo sob filtros de velocidade e de historico', async () => {
    const file = buildCsvFile([
      mockRow({ status: 'Finalizado', velocidade: '5' }), // velocidade < 10
      mockRow({ status: 'Novo', velocidade: '5' }),       // velocidade < 10 (deve ser filtrado)
    ]);

    const { drivers, stats, rawEventRows } = await parse(file);

    // O "Novo" com velocidade 5 foi filtrado e não entra
    // O "Finalizado" com velocidade 5 deve ser contado e persistido
    expect(drivers).toHaveLength(0);
    expect(stats.totalFechados).toBe(1);
    expect(stats.totalEventos).toBe(2);
    expect(stats.filtradosPorVelocidade).toBe(1);
    expect(rawEventRows).toHaveLength(1);
    expect(rawEventRows[0].velocidade_kmh).toBe(5);
  });

  describe('limite acumulado para alertas finalizados', () => {
    it('ignora alertas finalizados se forem <= 5 e nao houver intervencao no historico', async () => {
      const file = buildCsvFile([
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
      ]);

      const { drivers, stats } = await parse(file);
      expect(drivers).toHaveLength(0);
      expect(stats.totalFechados).toBe(5);
    });

    it('exibe alertas finalizados se forem > 5 e nao houver intervencao no historico', async () => {
      const file = buildCsvFile([
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
      ]);

      const { drivers, stats } = await parse(file);
      expect(drivers).toHaveLength(1);
      expect(drivers[0].alertas).toBe(6);
      expect(stats.totalFechados).toBe(6);
    });

    it('ignora alertas finalizados se forem <= 8 e houver intervencao anterior no historico', async () => {
      const file = buildCsvFile([
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
      ]);

      const history = [{ placa: 'XYZ9H99', tipo: 'intervencao', created_at: '2026-05-20T10:00:00Z' }];
      const { drivers, stats } = await parse(file, { history });
      expect(drivers).toHaveLength(0);
      expect(stats.totalFechados).toBe(8);
    });

    it('exibe alertas finalizados se forem > 8 e houver intervencao anterior no historico', async () => {
      const file = buildCsvFile([
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
        mockRow({ placa: 'XYZ9H99', status: 'Finalizado' }),
      ]);

      const history = [{ placa: 'XYZ9H99', tipo: 'intervencao', created_at: '2026-05-20T10:00:00Z' }];
      const { drivers, stats } = await parse(file, { history });
      expect(drivers).toHaveLength(1);
      expect(drivers[0].alertas).toBe(9);
      expect(stats.totalFechados).toBe(9);
    });
  });
});
