// Mapeamento de colunas e taxonomia de eventos do Sascar.
// Estes valores refletem o relatório "Detalhes de evento" exportado do portal
// Sascar (Michelin Smart Camera). Se a Sascar mudar a estrutura, ajustar aqui.

// Nomes literais das colunas do relatório.
export const COLUMNS = {
  status:         'Status',
  placa:          'Placa',
  transportadora: 'Transportadora',
  motorista:      'Motorista',
  frota:          'Frota',
  evento:         'Evento',
  categoria:      'Categoria',
  severidade:     'Severidade',
  hora:           'Hora do evento',
  // A coluna de velocidade pode aparecer com nomes variados; resolvemos por
  // includes('velocidade') no parser.
};

// Eventos que disparam INTERVENÇÃO IMEDIATA (operador liga para o motorista).
// "Distração Genérica" aparece tanto como Evento quanto como Categoria — o
// parser detecta ambas as variações.
export const INTERVENCAO_EVENTOS = ['Bocejo', 'Olho fechado', 'Distração Genérica', 'Sonolência'];

// Eventos puramente TÉCNICOS (não acionáveis pelo operador, apenas registrados).
export const TECNICO_CATS    = ['Obstrução de Câmera'];
export const TECNICO_EVENTOS = ['Perda de vídeo', 'Sem motorista'];

// Velocidade mínima (km/h) para considerar o motorista "em movimento".
// Eventos abaixo deste limite são ignorados (motorista parado não fadiga).
export const MIN_MOVING_SPEED_KMH = 10;

// Transportadoras com regra especial de auto-descarte (case e acento insensitive).
// Sascar/Dinon: eventos de fumo são descartados automaticamente, registrados
// como atendimento "descarte" no histórico em vez de virem para a fila.
export const DINON_CARRIERS_NORM = ['dinon'];

// Status que indica falso positivo — eventos com este status são descartados.
export const STATUS_FALSO_POSITIVO = 'Falso positivo';

// Taxonomia agregada (usada pelo Monitor para popular o filtro de eventos).
// O front pode exibir um subset; isto reflete o que a plataforma sabe gerar.
export const TAXONOMY = {
  intervencao: ['Bocejo', 'Olho fechado', 'Sonolência'],
  reportar:    ['Distração', 'Uso de celular', 'Fumando'],
  tecnico:     ['Obstrução de Câmera', 'Perda de vídeo', 'Sem motorista'],
};
