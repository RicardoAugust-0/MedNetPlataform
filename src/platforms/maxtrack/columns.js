// Taxonomia e constantes da plataforma Maxtrack (modo planilha).

export const MIN_MOVING_SPEED_KMH = 10;

// Mapa de colunas esperadas na planilha exportada pelo portal Maxtrack.
// Os nomes refletem o cabeçalho padrão da exportação.
export const COLUMNS = {
  placa: "Placa",
  motorista: "Motorista",
  transportadora: "Empresa",
  frota: "Frota",
  evento: "Evento",
  severidade: "Criticidade",
  hora: "Data/Hora",
  velocidade: "Velocidade",
};

// Eventos que disparam INTERVENÇÃO IMEDIATA.
export const INTERVENCAO_EVENTOS = [
  "Detecção de bocejo",
  "Detecção olhos fechados ou falta de atenção - N1",
  "Detecção olhos fechados ou falta de atenção - N2",
  "Somatório de olhos fechados ou falta de atenção na ultima hora - N1",
];

// Eventos TÉCNICOS (não acionáveis pelo operador).
export const TECNICO_EVENTOS = ["Câmera obstruída"];

// Mapeamento de severidade Maxtrack → canônico (base.js usa Gravíssimo/Grave/Normal).
export const SEV_MAP = {
  Gravíssimo: "Gravíssimo",
  Grave: "Grave",
  Médio: "Normal",
};

// Taxonomia agregada para filtros do Monitor.
export const TAXONOMY = {
  intervencao: [
    "Bocejo",
    "Olhos fechados N1",
    "Olhos fechados N2",
    "Somatório olhos última hora",
  ],
  reportar: ["Risco / Comportamento indevido"],
  tecnico: ["Câmera obstruída"],
};
