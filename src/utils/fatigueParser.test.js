import { describe, it, expect } from 'vitest';
import { normClf, normCrit, toUF, detect } from './fatigueParser.js';

describe('fatigueParser · normClf', () => {
  it('identifica falso positivo', () => {
    expect(normClf('Falso positivo')).toBe('Falso positivo');
    expect(normClf('falso')).toBe('Falso positivo');
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
    expect(normCrit('Baixo')).toBe('Médio');
    expect(normCrit(null)).toBe('Médio');
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
