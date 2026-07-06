import { describe, it, expect } from 'vitest';
import { aggregate } from './aggregate.js';

// Mocks simples dos adapters de plataforma
// criticalAlertsCount: 1 nos testes genéricos abaixo para que o gate de burst
// (ver describe 'regra de burst') não interfira em asserções que não são sobre
// esse comportamento — cada alerta isolado já atinge o "limite" de 1.
const mockPlatformSascar = {
  id: 'sascar',
  name: 'Sascar',
  rules: {
    slaLimitMin: 30,
    criticalAlertsCount: 1,
    minMovingSpeedKmh: 10,
  },
  postProcess(drivers) {
    // Simula a Regra Dinon fumo: remove eventos de fumo para Dinon
    const isFumo = tipo => /\bfum(o|ando|ante|ar)\b/i.test(tipo);
    const autoDescartes = [];
    const result = drivers.map(d => {
      if (d.transportadora?.toLowerCase().includes('dinon')) {
        const fumoEvs = d.eventosDetalhados.filter(e => isFumo(e.tipo));
        if (fumoEvs.length > 0) {
          autoDescartes.push({
            nome: d.nome, placa: d.placa, transportadora: d.transportadora,
            count: fumoEvs.length, motivo: 'Regra Dinon · eventos de fumo'
          });
          const reportaveis = Math.max(0, d.reportaveis - fumoEvs.length);
          const tiposReportar = d.tiposReportar.filter(t => !isFumo(t));
          const eventosDetalhados = d.eventosDetalhados.filter(e => !isFumo(e.tipo));
          return { ...d, reportaveis, tiposReportar, eventosDetalhados };
        }
      }
      return d;
    }).filter(d => d.alertas > 0 || d.reportaveis > 0 || d.tecnicos > 0);

    return { drivers: result, autoDescartes };
  }
};


const mockPlatformMaxtrack = {
  id: 'maxtrack',
  name: 'Maxtrack',
  rules: {
    slaLimitMin: 30,
    criticalAlertsCount: 8,
    minMovingSpeedKmh: 10,
  }
};

describe('aggregate.js · aggregate', () => {
  it('deve retornar fila vazia e estatísticas zeradas se não houver eventos', () => {
    const { drivers, stats } = aggregate([], [], mockPlatformSascar);
    expect(drivers).toEqual([]);
    expect(stats.total).toBe(0);
    expect(stats.comIntervencao).toBe(0);
    expect(stats.totalEventos).toBe(0);
  });

  it('deve agrupar eventos por placa e separar buckets corretamente', () => {
    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome: 'Motorista A',
        transportadora: 'Transp A',
        nome_evento: 'Bocejo',
        categoria_bucket: 'intervencao',
        severidade: 'Grave',
        velocidade_kmh: 40,
        analise_ia_plataforma: 'Positivo',
        ocorrido_em: '2026-06-26T10:00:00Z',
      },
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome: 'Motorista A',
        transportadora: 'Transp A',
        nome_evento: 'Celular',
        categoria_bucket: 'reportar',
        severidade: 'Normal',
        velocidade_kmh: 40,
        analise_ia_plataforma: 'Positivo',
        ocorrido_em: '2026-06-26T10:05:00Z',
      },
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome: 'Motorista A',
        transportadora: 'Transp A',
        nome_evento: 'Perda de vídeo',
        categoria_bucket: 'tecnico',
        severidade: 'Normal',
        velocidade_kmh: 40,
        analise_ia_plataforma: 'Positivo',
        ocorrido_em: '2026-06-26T10:10:00Z',
      }
    ];

    // now fixado 20min após o evento de intervenção (dentro da janela de 30min)
    const { drivers, stats } = aggregate(events, [], mockPlatformSascar, { now: new Date('2026-06-26T10:20:00Z').getTime() });

    expect(drivers.length).toBe(1);
    const d = drivers[0];
    expect(d.nome).toBe('Motorista A');
    expect(d.alertas).toBe(1);
    expect(d.reportaveis).toBe(1);
    expect(d.tecnicos).toBe(1);
    expect(d.tipos).toContain('Bocejo');
    expect(d.tiposReportar).toContain('Celular');
    expect(d.tiposTecnico).toEqual({ 'Perda de vídeo': 1 });
    expect(d.severidade).toBe('Grave'); // max(Grave, Normal)
    expect(stats.total).toBe(1);
    expect(stats.comIntervencao).toBe(1);
    expect(stats.totalEventos).toBe(3);
  });

  it('deve filtrar eventos de falso positivo', () => {
    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Bocejo',
        categoria_bucket: 'intervencao',
        analise_ia_plataforma: 'Falso positivo',
        ocorrido_em: '2026-06-26T10:00:00Z',
      }
    ];

    const { drivers, stats } = aggregate(events, [], mockPlatformSascar);
    expect(drivers).toEqual([]);
    expect(stats.falsosPositivos).toBe(1);
  });

  it('deve filtrar eventos com velocidade abaixo do limite', () => {
    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Bocejo',
        categoria_bucket: 'intervencao',
        velocidade_kmh: 5,
        analise_ia_plataforma: 'Positivo',
        ocorrido_em: '2026-06-26T10:00:00Z',
      }
    ];

    const { drivers, stats } = aggregate(events, [], mockPlatformSascar);
    expect(drivers).toEqual([]);
    expect(stats.filtradosPorVelocidade).toBe(1);
  });

  it('deve aplicar filtros de histórico de atendimentos recentes', () => {
    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Bocejo',
        categoria_bucket: 'intervencao',
        ocorrido_em: '2026-06-26T10:00:00Z',
      },
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Celular',
        categoria_bucket: 'reportar',
        ocorrido_em: '2026-06-26T10:15:00Z',
      }
    ];

    // AAA1A11 tem atendimento de intervenção em 10:10 (posterior ao Bocejo, anterior ao Celular)
    const history = [
      { placa: 'AAA1A11', tipo: 'intervencao', created_at: '2026-06-26T10:10:00Z' }
    ];

    const { drivers, stats } = aggregate(events, history, mockPlatformSascar);
    expect(drivers.length).toBe(1);
    expect(drivers[0].alertas).toBe(0); // limpou intervenção
    expect(drivers[0].reportaveis).toBe(1); // manteve celular
    expect(stats.filtradosPorHistorico).toBe(1);
  });

  it('deve aplicar pós-processamento específico de plataforma (Regra Dinon)', () => {
    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome: 'Motorista Dinon',
        transportadora: 'Transportes Dinon Ltda',
        nome_evento: 'Fumando ao volante',
        categoria_bucket: 'reportar',
        ocorrido_em: '2026-06-26T10:00:00Z',
      }
    ];

    const { drivers, stats } = aggregate(events, [], mockPlatformSascar);
    expect(drivers).toEqual([]); // Dinon fumo descartado -> esvaziou a fila desse motorista
    expect(stats.autoDescartes.length).toBe(1);
    expect(stats.autoDescartes[0].motivo).toBe('Regra Dinon · eventos de fumo');
  });

  it('deve calcular SLA corretamente', () => {
    const baseTime = Date.now();
    const eventTime1 = new Date(baseTime - 45 * 60 * 1000).toISOString(); // 45m atrás (estouro)
    const eventTime2 = new Date(baseTime - 15 * 60 * 1000).toISOString(); // 15m atrás

    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Bocejo',
        categoria_bucket: 'intervencao',
        ocorrido_em: eventTime1,
      },
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Olho fechado',
        categoria_bucket: 'intervencao',
        ocorrido_em: eventTime2,
      }
    ];

    const { drivers } = aggregate(events, [], mockPlatformSascar);
    expect(drivers.length).toBe(1);
    const d = drivers[0];
    expect(d.slaAgeMin).toBeCloseTo(45, 0); // mede pelo evento mais antigo
    expect(d.slaBreached).toBe(true);
  });

  it('deve aplicar filtros de histórico específicos de bucket (incluindo técnico)', () => {
    const events = [
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Bocejo',
        categoria_bucket: 'intervencao',
        ocorrido_em: '2026-06-26T10:00:00Z',
      },
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Celular',
        categoria_bucket: 'reportar',
        ocorrido_em: '2026-06-26T10:00:00Z',
      },
      {
        platform_id: 'sascar',
        placa: 'AAA1A11',
        nome_evento: 'Perda de vídeo',
        categoria_bucket: 'tecnico',
        ocorrido_em: '2026-06-26T10:00:00Z',
      }
    ];

    // AAA1A11 tem descarte técnico em 10:10 (posterior ao evento técnico de 10:00)
    const history = [
      { placa: 'AAA1A11', tipo: 'descarte', bucket: 'tecnico', created_at: '2026-06-26T10:10:00Z' }
    ];

    // now fixado 20min após os eventos (dentro da janela de 30min)
    const { drivers } = aggregate(events, history, mockPlatformSascar, { now: new Date('2026-06-26T10:20:00Z').getTime() });
    expect(drivers.length).toBe(1);
    const d = drivers[0];
    expect(d.alertas).toBe(1);      // Bocejo mantido (sem clear de intervencao)
    expect(d.reportaveis).toBe(1);  // Celular mantido (sem clear de reportar)
    expect(d.tecnicos).toBe(0);     // Perda de vídeo limpo pelo descarte técnico
  });
});

describe('aggregate.js · regra de burst (criticalAlertsCount + slaLimitMin)', () => {
  // mockPlatformMaxtrack: criticalAlertsCount 8, slaLimitMin 30 (definidos no topo do arquivo)
  const makeEvent = (placa, minutesAgo, nowMs) => ({
    platform_id: 'maxtrack',
    placa,
    nome_evento: 'Bocejo',
    categoria_bucket: 'intervencao',
    ocorrido_em: new Date(nowMs - minutesAgo * 60000).toISOString(),
  });

  it('esconde motorista da fila quando alertas < criticalAlertsCount, mesmo recentes', () => {
    const now = Date.now();
    const events = [
      makeEvent('BBB2B22', 10, now),
      makeEvent('BBB2B22', 5, now),
    ]; // só 2 alertas, limite do Maxtrack é 8

    const { drivers, stats } = aggregate(events, [], mockPlatformMaxtrack, { now });
    expect(drivers).toEqual([]);
    expect(stats.filtradosPorBurst).toBe(2);
  });

  it('mantém motorista na fila quando alertas >= criticalAlertsCount e último dentro de slaLimitMin', () => {
    const now = Date.now();
    const events = Array.from({ length: 8 }, (_, i) => makeEvent('BBB2B22', 25 - i * 3, now));
    // 8 alertas (limite do Maxtrack), o mais recente há 4min

    const { drivers } = aggregate(events, [], mockPlatformMaxtrack, { now });
    expect(drivers.length).toBe(1);
    expect(drivers[0].alertas).toBe(8);
  });

  it('remove motorista da fila quando o último alerta passa de slaLimitMin, mesmo com alertas >= criticalAlertsCount', () => {
    const now = Date.now();
    const events = Array.from({ length: 8 }, (_, i) => makeEvent('BBB2B22', 120 - i * 10, now));
    // 8 alertas (limite do Maxtrack), mas o mais recente há 50min > slaLimitMin (30)

    const { drivers, stats } = aggregate(events, [], mockPlatformMaxtrack, { now });
    expect(drivers).toEqual([]);
    expect(stats.filtradosPorBurst).toBe(8);
  });
});
