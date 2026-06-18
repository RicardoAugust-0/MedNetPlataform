// Taxonomia e mapeamento de colunas da plataforma OmniLink.

// Mapeamento das colunas literais da planilha exportada pelo portal OmniLink.
export const COLUMNS = {
  placa:          'Placa',
  motorista:      'Motorista',
  transportadora: 'Origem do motorista', // "Origem do motorista" guarda a transportadora/frota no OmniLink
  evento:         'Evento',
  velocidade:     'Velocidade',
  localidade:     'Endereço',
  hora:           'Data da ocorrência',
  status:         'Status',
  tratadoPor:     'Tratado por',
};

// Eventos que disparam INTERVENÇÃO IMEDIATA (Fadiga humana detectada).
export const INTERVENCAO_EVENTOS = [
  'Bocejo',
  'Olhos fechados',
  'Sonolência',
  'Fadiga',
  'Fadiga detectada',
  'Fadiga extrema',
  'Micro sono',
  'Dormindo ao volante'
];

// Eventos TÉCNICOS (falhas de hardware ou câmera).
export const TECNICO_EVENTOS = [
  'Câmera obstruída',
  'Obstrução de câmera',
  'Perda de vídeo',
  'Sem motorista',
  'Ausência de motorista',
  'Câmera desconectada',
  'Falha no sensor'
];

// Limiar mínimo de velocidade para motorista ser considerado em trânsito.
export const MIN_MOVING_SPEED_KMH = 10;

// Taxonomia de eventos usada nos filtros do Monitor na UI.
export const TAXONOMY = {
  intervencao: ['Bocejo', 'Olhos fechados', 'Sonolência', 'Fadiga'],
  reportar:    ['Distração', 'Celular', 'Cinto de segurança', 'Fumando'],
  tecnico:     ['Câmera obstruída', 'Perda de vídeo', 'Sem motorista'],
};
