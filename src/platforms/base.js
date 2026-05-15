// Contrato de adapters de plataforma.
//
// Cada plataforma de monitoramento (Sascar, Maxtrack, etc.) implementa este
// contrato e é registrada em `src/platforms/index.js`. O Monitor da UI consulta
// o registry para descobrir capacidades, exibir o seletor e despachar parse.
//
// Há três modos de ingestão suportados:
//   - 'spreadsheet': operador faz upload de .xlsx/.xls/.csv
//   - 'api':         polling de uma API REST (autenticada)
//   - 'scraper':     scraping via Edge Function dedicada
//
// O Sascar usa 'spreadsheet'. Maxtrack/Trimble/etc. provavelmente usarão 'api'
// ou 'scraper' (a ser definido na integração).
//
// ────────────────────────────────────────────────────────────────────────────
// Shape esperado de cada adapter (exemplo Sascar):
//
//   {
//     id: 'sascar',                            // slug único (kebab-case)
//     name: 'Sascar',                          // exibido na UI
//     label: 'Sascar (Michelin Smart Camera)', // descrição longa
//     sistema: 'SASCAR',                       // valor enviado p/ Google Sheets
//     portalUrl: 'https://...',                // botão "Abrir Portal"
//     description: '...',                      // 1-2 linhas
//     status: 'active'|'beta'|'planned',       // controla visibilidade
//     inputType: 'spreadsheet',
//
//     // Taxonomia de eventos (alimenta os filtros do Monitor)
//     taxonomy: {
//       intervencao: ['Bocejo', 'Olho fechado'],
//       reportar:    ['Distração genérica', 'Uso de celular', 'Fumando'],
//       tecnico:     ['Obstrução de Câmera', 'Perda de vídeo'],
//     },
//
//     // Severidades possíveis, ordenadas da mais grave para a menos grave
//     severidades: ['Gravíssimo', 'Grave', 'Normal'],
//
//     // Bloco específico do modo 'spreadsheet'
//     spreadsheet: {
//       accept: '.xlsx,.xls,.csv',
//       uploadTitle: 'Solte aqui o relatório de detalhes de evento do Sascar',
//       uploadHint:  '.xlsx · .xls · .csv · Falsos positivos removidos automaticamente',
//
//       // Tenta detectar se uma planilha pertence a esta plataforma.
//       // Recebe { fileName, headers: string[] } e devolve número (0..1) de confiança.
//       detect({ fileName, headers }) { ... return 0..1 },
//
//       // Parser principal: recebe o File e devolve Promise<{ drivers, stats }>.
//       // NÃO aplica filtro de histórico — isso é responsabilidade do Monitor via
//       // applyHistoryFilter() em src/platforms/shared/history.js.
//       parse(file) { ... },
//     },
//
//     // Bloco do modo 'api' (REST polling)
//     api: {
//       pollIntervalMs: 60_000,
//       pull() { ... return Promise<{ drivers, stats }> },
//     },
//
//     // Bloco do modo 'scraper' (Edge Function ou bookmarklet)
//     scraper: {
//       pull() { ... return Promise<{ drivers, stats }> },
//     },
//
//     // (Opcional) Regras de negócio pós-processamento aplicadas pelo Monitor
//     // APÓS o filtro de histórico. Útil para auto-descartes específicos da plataforma
//     // (ex: regra Dinon no Sascar). Recebe os drivers já filtrados.
//     postProcess(drivers) { ... return { drivers, autoDescartes } },
//   }
//
// ────────────────────────────────────────────────────────────────────────────
// Saída esperada do parser/puller (drivers + stats):
//
//   drivers: Array<{
//     nome:                 string,          // nome do motorista (ou placa)
//     placa:                string,
//     transportadora:       string,
//     frota:                string,
//     turno:                'diurno'|'noturno',
//     // Fila de intervenção
//     alertas:              number,          // total de eventos para intervir
//     tipos:                string[],        // tipos de evento únicos
//     ultimoEvento:         Date|null,
//     // Fila de reporte à transportadora
//     reportaveis:          number,
//     tiposReportar:        string[],
//     ultimoEventoReportar: Date|null,
//     // Eventos técnicos (não acionáveis pelo operador)
//     tecnicos:             number,
//     tiposTecnico:         Record<string, number>,
//     // Detalhamento individual de eventos (usado para export e filtro de histórico granular)
//     eventosDetalhados:    Array<{ tipo: string, bucket: 'intervencao'|'reportar'|'tecnico', severidade: string, ts: Date|null }>,
//     // Outros
//     severidade:           'Gravíssimo'|'Grave'|'Normal',
//     intervencoes:         number,          // legado, sempre 0 no parser
//   }>
//
//   stats: {
//     total:                  number,
//     comIntervencao:         number,
//     soReportar:             number,
//     soTecnico:              number,
//     totalEventos:           number,
//     falsosPositivos:        number,
//     filtradosPorVelocidade: number,
//     filtradosPorHistorico:  number,
//     autoDescartes:          Array<{ nome, placa, transportadora, count, motivo }>,
//   }
// ────────────────────────────────────────────────────────────────────────────

// Constrói um objeto driver "vazio" no formato canônico.
// Útil para adapters que querem montar a saída incrementalmente.
export function emptyDriver(overrides = {}) {
  return {
    nome:                 '',
    placa:                '',
    transportadora:       '—',
    frota:                '',
    turno:                'diurno',
    alertas:              0,
    tipos:                [],
    ultimoEvento:         null,
    reportaveis:          0,
    tiposReportar:        [],
    ultimoEventoReportar: null,
    tecnicos:             0,
    tiposTecnico:         {},
    eventosDetalhados:    [],
    severidade:           'Normal',
    intervencoes:         0,
    ...overrides,
  };
}

// Constrói um objeto stats "zerado" no formato canônico.
export function emptyStats(overrides = {}) {
  return {
    total:                  0,
    comIntervencao:         0,
    soReportar:             0,
    soTecnico:              0,
    totalEventos:           0,
    falsosPositivos:        0,
    filtradosPorVelocidade: 0,
    filtradosPorHistorico:  0,
    autoDescartes:          [],
    ...overrides,
  };
}
