// Taxonomia e constantes da plataforma Maxtrack.
// Os nomes de evento refletem o campo `event.name` retornado pela API.

export const MIN_MOVING_SPEED_KMH = 10;

// Eventos que disparam INTERVENÇÃO IMEDIATA.
export const INTERVENCAO_EVENTOS = [
  'Detecção de bocejo',
  'Detecção olhos fechados ou falta de atenção - N1',
  'Detecção olhos fechados ou falta de atenção - N2',
  'Somatório de olhos fechados ou falta de atenção na ultima hora - N1',
];

// Eventos TÉCNICOS (não acionáveis pelo operador).
export const TECNICO_EVENTOS = ['Câmera obstruída'];

// Mapeamento de severidade Maxtrack → canônico (base.js usa Gravíssimo/Grave/Normal).
export const SEV_MAP = {
  'Gravíssimo': 'Gravíssimo',
  'Grave':      'Grave',
  'Médio':      'Normal',
  'Leve':       'Normal',
};

// Taxonomia agregada para filtros do Monitor.
export const TAXONOMY = {
  intervencao: ['Bocejo', 'Olhos fechados N1', 'Olhos fechados N2', 'Somatório olhos última hora'],
  reportar:    ['Risco / Comportamento indevido'],
  tecnico:     ['Câmera obstruída'],
};

// Todos os stepEvents que representam eventos ainda abertos (não encerrados).
export const OPEN_STEP_EVENTS = ['NEW', 'IN_PROCESS', 'PENDING', 'ATTACHMENT', 'REOPEN'];

// IDs das categorias de fadiga na API Maxtrack.
export const FATIGUE_CATEGORIES = [
  { id: 57, selectable: true, name: 'Análise de Fadiga (Global)',            canEdit: false, global: true },
  { id: 63, selectable: true, name: 'Análise desatenção/fadiga (Global)',    canEdit: false, global: true },
];

// IDs de criticidade: Grave, Gravíssimo, Médio.
export const CRITICALITY_LEVELS = [
  { id: 3, selectable: true, name: 'Grave',      color: '#d97e17', canEdit: false, level: 80  },
  { id: 4, selectable: true, name: 'Gravíssimo', color: '#da1010', canEdit: false, level: 100 },
  { id: 2, selectable: true, name: 'Médio',      color: '#ecce09', canEdit: false, level: 50  },
];
