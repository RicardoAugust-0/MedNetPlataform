import { describe, it, expect } from 'vitest';
import { normClf, normCrit, toUF, detect, aggregate, buildImportRows } from './fatigueParser.js';

describe('fatigueParser · normClf', () => {
  it('identifica falso positivo', () => {
    expect(normClf('Falso positivo')).toBe('Falso positivo');
    expect(normClf('falso')).toBe('Falso positivo');
    expect(normClf('Justificada')).toBe('Falso positivo');
  });

  it('identifica positivo para termos comuns e "Válido"', () => {
    expect(normClf('Positivo')).toBe('Positivo');
    expect(normClf('Confirmado')).toBe('Positivo');
    expect(normClf('Procede')).toBe('Positivo');
    expect(normClf('Verdadeiro')).toBe('Positivo');
    expect(normClf('Real')).toBe('Positivo');
    expect(normClf('Válido')).toBe('Positivo');
    expect(normClf('valido')).toBe('Positivo');
  });

  it('retorna Não classificado para valores desconhecidos ou vazios', () => {
    expect(normClf(null)).toBe('Não classificado');
    expect(normClf('')).toBe('Não classificado');
    expect(normClf('Pendente')).toBe('Não classificado');
  });

  it('trata "Improcedente" como falso positivo (não confunde com "procede")', () => {
    expect(normClf('Improcedente')).toBe('Falso positivo');
    expect(normClf('Procedente')).toBe('Positivo');
  });

  it('trata "Inválido" como falso positivo (não confunde com "válido")', () => {
    expect(normClf('Inválido')).toBe('Falso positivo');
    expect(normClf('invalido')).toBe('Falso positivo');
  });

  it('trata "Não procede" como falso positivo (não confunde com "procede")', () => {
    expect(normClf('Não procede')).toBe('Falso positivo');
    expect(normClf('nao procede')).toBe('Falso positivo');
  });
});

describe('fatigueParser · normCrit', () => {
  it('normaliza criticidade gravíssima', () => {
    expect(normCrit('Gravíssimo')).toBe('Gravíssimo');
    expect(normCrit('Alta')).toBe('Gravíssimo');
    expect(normCrit('Alto')).toBe('Gravíssimo');
  });

  it('normaliza criticidade grave', () => {
    expect(normCrit('Grave')).toBe('Grave');
  });

  it('normaliza para médio em casos desconhecidos', () => {
    expect(normCrit(null)).toBe('Médio');
    expect(normCrit('Sei lá')).toBe('Médio');
  });

  it('reconhece o nível "Leve" (eventos que ficam fora da análise)', () => {
    expect(normCrit('Leve')).toBe('Leve');
    expect(normCrit('Baixo')).toBe('Leve');
  });
});

describe('fatigueParser · toUF', () => {
  it('extrai UF correta', () => {
    expect(toUF('São Paulo - SP')).toBe('SP');
    expect(toUF('Minas Gerais (MG)')).toBe('MG');
    expect(toUF('Qualquer coisa')).toBeNull();
  });
});

describe('fatigueParser · detect (mapas por plataforma)', () => {
  it('Sighra: fixa "Placa" (e não o id interno "Veículo")', () => {
    const headers = ['ID Alerta', 'Veículo', 'Placa', 'Login', 'Motorista', 'Cliente', 'Data Alerta', 'Quantidade Eventos', 'Criticidade', 'Evento', 'Início Tratativa', 'Status', 'Classificação'];
    const det = detect(headers, 'auto', 'relatorioAlertas_sighra.xlsx');
    expect(det.platform).toBe('sighra');
    expect(det.mapping.plate).toBe('Placa');
    expect(det.mapping.fleet).toBe('Cliente');
    expect(det.mapping.datetime).toBe('Data Alerta');
  });

  it('Horizon: classificação vem de "Avaliação" (e não de "Status")', () => {
    const headers = ['ID', 'Evento', 'Filial', 'Placa / Empurrador', 'Motorista / Comandante', 'Transportadora / Empresa de Navegação', 'Gravidade', 'Descrição', 'Status', 'Avaliação', 'Justificativa', 'Abono Motorista', 'Data/Hora Evento', 'Local'];
    const det = detect(headers, 'auto', 'historico 16-06-26.xlsx');
    expect(det.platform).toBe('horizon');
    expect(det.mapping.classification).toBe('Avaliação');
    expect(det.mapping.plate).toBe('Placa / Empurrador');
    expect(det.mapping.fleet).toBe('Transportadora / Empresa de Navegação');
  });

  it('MaxTrack: detecta pela assinatura de cabeçalho mesmo sem o nome no arquivo', () => {
    const headers = ['Id', 'Empresa', 'Tipo de Operação', 'Nome', 'Data', 'Identificador/Placa', 'Criticidade', 'Criticidade Original', 'Motorista', 'Matricula do Motorista', 'Classificação', 'Velocidade Inicial'];
    const det = detect(headers, 'auto', '2026-06-18 - Relatório - Eventos.xlsx');
    expect(det.platform).toBe('maxtrack');
    expect(det.mapping.type).toBe('Nome');
    expect(det.mapping.plate).toBe('Identificador/Placa');
    expect(det.mapping.classification).toBe('Classificação');
  });

  it('não inventa velocidade a partir de "Possível Falha" (apelido "vel" removido)', () => {
    const headers = ['Evento', 'Placa / Empurrador', 'Data/Hora Evento', 'Possível Falha'];
    const det = detect(headers, 'auto', 'historico.xlsx');
    expect(det.mapping.speed).toBeFalsy();
  });
});

describe('fatigueParser · aggregate (exclusão de "Leve")', () => {
  const H = ['datetime', 'driver', 'plate', 'criticality', 'type', 'classification', 'speed', 'location', 'fleet', 'description'];
  const M = Object.fromEntries(H.map((k) => [k, k]));

  it('eventos "Leve" não entram em totais nem nas criticidades', () => {
    const rows = [
      ['2026-06-01 10:00', 'A', 'PL1', 'Grave', 'Bocejo', 'Positivo', '50', 'SP', 'X', ''],
      ['2026-06-01 11:00', 'B', 'PL2', 'Leve', 'Bocejo', 'Positivo', '50', 'SP', 'X', ''],
      ['2026-06-01 12:00', 'C', 'PL3', 'Gravíssimo', 'Bocejo', 'Falso positivo', '50', 'SP', 'X', ''],
    ];
    const agg = aggregate(H, rows, M, null);
    expect(agg.kpis.total).toBe(2); // a linha "Leve" foi ignorada
    const totalCrit = agg.mensal_crit.series['Gravíssimo'].concat(
      agg.mensal_crit.series['Grave'],
      agg.mensal_crit.series['Médio']
    ).reduce((a, b) => a + b, 0);
    expect(totalCrit).toBe(2);
  });
});

describe('fatigueParser · buildImportRows (velocidade mínima)', () => {
  const headers = ['Data', 'Identificador/Placa', 'Nome', 'Criticidade', 'Classificação', 'Velocidade Inicial'];
  const mapping = {
    datetime: 'Data',
    plate: 'Identificador/Placa',
    type: 'Nome',
    criticality: 'Criticidade',
    classification: 'Classificação',
    speed: 'Velocidade Inicial',
  };
  const lowSpeedRow = ['2026-07-14 10:00:00', 'ABC1D23', 'Fadiga', 'Grave', 'Positivo', '5'];

  it('preserva alertas MaxTrack abaixo de 10 km/h', () => {
    const result = buildImportRows({ platformId: 'maxtrack', headers, mapping, dataRows: [lowSpeedRow] }, '');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].velocidade_kmh).toBe(5);
    expect(result.stats.velocidade).toBe(0);
    expect(result.stats.importadas).toBe(1);
  });

  it('mantém o filtro abaixo de 10 km/h nas demais plataformas', () => {
    const result = buildImportRows({ platformId: 'sascar', headers, mapping, dataRows: [lowSpeedRow] }, '');

    expect(result.rows).toHaveLength(0);
    expect(result.stats.velocidade).toBe(1);
    expect(result.stats.importadas).toBe(0);
  });
});
