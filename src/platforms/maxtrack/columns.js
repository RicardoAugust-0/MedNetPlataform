// Taxonomia e constantes da plataforma Maxtrack (modo planilha).

export const MIN_MOVING_SPEED_KMH = 10;

// Mapa de colunas esperadas na planilha exportada pelo portal Maxtrack.
// Nomes conferidos contra exportação real (.csv, delimitador ponto-e-vírgula).
export const COLUMNS = {
  placa:          'Identificador/Placa',
  motorista:      'Motorista',
  cpf:            'CPF',
  matricula:      'Matricula do Motorista',
  transportadora: 'Empresa',
  frota:          'Frota',
  evento:         'Nome',
  descricao:      'Descrição',
  severidade:     'Criticidade',
  hora:           'Data',
  velocidade:     'Velocidade Inicial',
  localidade:     'Localidade',
  duracao:        'Duração',
  analise_ia:     'Análise de IA',
  id_evento:      'Id do Evento',
  status:         'Status',
  evidence:       'Possui evidência?',
  treatStart:     'Início da Tratativa',
  treatEnd:       'Data finalização evento',
  tipo_classificacao: 'Tipo de Classificação',
};

export const FINALIZADO_STATUS = new Set([
  'Finalizado',
  'Auto Finalizado (complementar)',
]);

// Eventos que disparam INTERVENÇÃO IMEDIATA (coluna "Nome" do CSV).
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
  Gravíssimo: 'Gravíssimo',
  Grave:      'Grave',
  Médio:      'Normal',
};

// Taxonomia agregada para filtros do Monitor.
export const TAXONOMY = {
  intervencao: [
    'Bocejo',
    'Olhos fechados N1',
    'Olhos fechados N2',
    'Somatório olhos última hora',
  ],
  reportar: ['Risco / Comportamento indevido'],
  tecnico:  ['Câmera obstruída'],
};
