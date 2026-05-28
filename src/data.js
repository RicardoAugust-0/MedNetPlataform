export const APP_CONFIG = {
  empresa: 'MedNet',
  setor: 'Fadiga Zero',
  usuario: { nome: 'Ana Ribeiro', iniciais: 'AR', cargo: 'Analista Sênior · Fadiga Zero' },
};

export const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',       icon: 'ti-layout-dashboard', group: 'Operação',     path: '/dashboard' },
  { id: 'monitor',    label: 'Monitor de Frota', icon: 'ti-truck-delivery',  group: 'Operação',     path: '/monitor/intervencao' },
  { id: 'planilha',   label: 'Planilha Embedded',icon: 'ti-table-alias',     group: 'Operação',     path: '/planilha' },
  { id: 'dossies',    label: 'Dossiês Clínicos', icon: 'ti-steering-wheel',  group: 'Operação',     path: '/dossies' },
  { id: 'agenda',     label: 'Agenda',           icon: 'ti-calendar-event',  group: 'Operação',     path: '/agenda' },
  { id: 'crosscheck', label: 'Cross-Check',      icon: 'ti-list-check',      group: 'Operação',     path: '/crosscheck' },
  { id: 'templates',  label: 'Templates',        icon: 'ti-message-2',       group: 'Conhecimento', path: '/templates' },
  { id: 'workspace',  label: 'Workspace',        icon: 'ti-notebook',        group: 'Conhecimento', path: '/workspace' },
  { id: 'notas',      label: 'Bloco de Notas',   icon: 'ti-file-text',       group: 'Conhecimento', path: '/notas' },
  { id: 'links',      label: 'Links Rápidos',    icon: 'ti-link',            group: 'Conhecimento', path: '/links' },
  { id: 'perfil',     label: 'Meu Perfil',       icon: 'ti-user-circle',     group: 'Conta',        path: '/perfil' },
  { id: 'admin',      label: 'Administração',    icon: 'ti-shield',          group: 'Conta',        path: '/admin',      adminOnly: true },
  { id: 'analytics',  label: 'Analytics',        icon: 'ti-chart-pie',       group: 'Conta',        path: '/analytics',  adminOnly: true },
  { id: 'relatorios', label: 'Relatórios IA',    icon: 'ti-report-analytics',group: 'Conta',        path: '/relatorios', adminOnly: true },
];

export const PANEL_TITLES = {
  dashboard: { t: 'Dashboard · Gestão à Vista', s: 'Visão da diretoria' },
  monitor:   { t: 'Monitor de Frota',       s: 'Alertas logísticos & fila de intervenção' },
  planilha:  { t: 'Planilha Embedded',      s: 'Edição inline de intervenções com sincronização em tempo real' },
  dossies:    { t: 'Dossiês Clínicos',      s: 'Histórico de fadiga, tratativas e prontuário médico dos motoristas' },
  agenda:    { t: 'Agenda & Lembretes',     s: 'Compromissos e ações do dia' },
  templates: { t: 'Templates de Mensagem',  s: 'Scripts prontos para atendimento' },
  workspace: { t: 'Workspace',              s: 'Páginas e procedimentos da equipe' },
  notas:     { t: 'Bloco de Notas',         s: 'Anotações pessoais e operacionais' },
  links:     { t: 'Links Rápidos',          s: 'Acessos a sistemas e ferramentas' },
  perfil:    { t: 'Meu Perfil',             s: 'Configurações da sua conta' },
  admin:     { t: 'Administração',          s: 'Gerenciamento da equipe' },
  analytics:  { t: 'Analytics',              s: 'Análise de reincidência e métricas da operação' },
  relatorios: { t: 'Relatórios IA',          s: 'Relatórios executivos gerados por IA para reuniões com transportadoras' },
  crosscheck: { t: 'Cross-Check',           s: 'Comparar alertas entre plataformas' },
};

export const MOCK_DRIVERS = [
  { nome: 'CARLOS EDUARDO SILVA',  placa: 'BWY-3K47', transportadora: 'Transval',        alertas: 8, tipos: ['Sonolência crítica','Distração'], tecnicos: 0, intervencoes: 0, turno: 'noite' },
  { nome: 'MARCOS RIBEIRO PEREIRA',placa: 'JLM-9P21', transportadora: 'LSL Logística',   alertas: 6, tipos: ['Olhos fechados','Bocejo'],        tecnicos: 1, intervencoes: 0, turno: 'noite' },
  { nome: 'PAULO HENRIQUE COSTA',  placa: 'GRT-2X88', transportadora: 'Transaguiar',     alertas: 5, tipos: ['Sonolência'],                     tecnicos: 0, intervencoes: 1, turno: 'tarde' },
  { nome: 'JOÃO BATISTA SOUZA',    placa: 'KOP-7B12', transportadora: 'Cobli Frota Sul', alertas: 7, tipos: ['Distração','Sonolência'],          tecnicos: 0, intervencoes: 0, turno: 'tarde' },
  { nome: 'RICARDO ALMEIDA',       placa: 'NXC-4T55', transportadora: 'Transval',        alertas: 5, tipos: ['Bocejo'],                         tecnicos: 2, intervencoes: 0, turno: 'manha' },
  { nome: 'ANDERSON LIMA',         placa: 'PFK-1H03', transportadora: 'Autotrack Express',alertas: 3,tipos: ['Sonolência leve'],                 tecnicos: 0, intervencoes: 1, turno: 'manha' },
  { nome: 'FERNANDO VIEIRA',       placa: 'QSV-8M29', transportadora: 'LSL Logística',   alertas: 0, tipos: [],                                 tecnicos: 4, intervencoes: 0, turno: 'noite' },
  { nome: 'DANIEL BORGES',         placa: 'RTU-5J64', transportadora: 'Transaguiar',     alertas: 0, tipos: [],                                 tecnicos: 3, intervencoes: 0, turno: 'tarde' },
];

export const MOCK_HISTORY = [
  { motorista: 'PAULO HENRIQUE COSTA', operador: 'Ana Ribeiro', obs: 'Solicitou pausa de 30min — confirmado posto BR-101 km 88', hora: '08:42' },
  { motorista: 'ANDERSON LIMA',        operador: 'Diego Santos', obs: 'Encerrou jornada — descanso obrigatório', hora: '07:15' },
  { motorista: 'JOSÉ APARECIDO LUZ',   operador: 'Ana Ribeiro', obs: 'Sem resposta no 1º contato — 2ª tentativa em 5min', hora: '06:58' },
];

export const MOCK_HOURLY = [3,2,4,8,12,15,9,6,4,3,2,3,5,7,9,11,13,14,18,22,19,12,8,5];

export const TEMPLATES_DEFAULT = [
  { id:1, tag:'contato',      tagLabel:'Contato',       title:'Contato Inicial – Motorista',    text:'Olá, [NOME]! Tudo bem? Aqui é [SEU NOME] da MedNet, setor Fadiga Zero.\n\nEstamos entrando em contato pois identificamos um alerta de fadiga no seu monitoramento. Poderia responder algumas perguntas rápidas?' },
  { id:2, tag:'questionario', tagLabel:'Questionário',  title:'Questionário de Fadiga',          text:'Vou realizar algumas perguntas sobre seu estado atual:\n\n1. Há quantas horas está dirigindo sem pausa?\n2. Dormiu quantas horas na última noite?\n3. Está sentindo sonolência, visão turva ou dificuldade de concentração?\n4. Quando foi a última pausa para descanso?\n5. Está em condições de continuar a viagem?' },
  { id:3, tag:'alerta',       tagLabel:'Alerta',        title:'Solicitação de Intervenção',      text:'Prezado [GESTOR/TRANSPORTADORA],\n\nIdentificamos alerta crítico de fadiga para o motorista [NOME], placa [PLACA], rota [ROTA].\n\nSolicitamos intervenção imediata para garantir a segurança do condutor e da carga.\n\nHorário: [HORA]\nLocalização: [LOCAL]\n\nMedNet – Fadiga Zero' },
  { id:4, tag:'encerramento', tagLabel:'Encerramento',  title:'Encerramento de Alerta',          text:'Olá! Informamos que o alerta de fadiga do motorista [NOME] foi encerrado após contato.\n\nStatus: [RESOLVIDO]\nObservações: [DETALHE]\n\nRegistro atualizado.\n\nEquipe MedNet Fadiga Zero' },
  { id:5, tag:'contato',      tagLabel:'Contato',       title:'Sem Resposta – 2ª Tentativa',     text:'Olá, [NOME]! Tentamos contato anteriormente mas não obtivemos resposta.\n\nPor favor, responda assim que possível. Em caso de emergência, encoste em local seguro e ligue para nós.' },
  { id:6, tag:'contato',      tagLabel:'Contato',       title:'Motorista Hostil – Protocolo',    text:'Registro de ocorrência: Motorista [NOME] demonstrou comportamento hostil durante contato.\n\nData/Hora: [DATA]\nDescrição: [DETALHE]\nAção: Notificação à transportadora [NOME].\n\nAnalista: [SEU NOME]' },
  { id:7, tag:'questionario', tagLabel:'Questionário',  title:'Avaliação de Início de Jornada',  text:'Olá [NOME]! Antes de iniciar sua jornada:\n\n1. Quantas horas dormiu nas últimas 24h?\n2. Consumiu álcool nas últimas 12h?\n3. Está em uso de medicação que cause sonolência?\n4. Como está se sentindo agora?\n\nObrigado!' },
  { id:8, tag:'encerramento', tagLabel:'Encerramento',  title:'Retorno após Intervenção',        text:'Olá [NOME], tudo bem?\n\nComo você está após a pausa solicitada? O motorista realizou descanso? Está apto a retornar à viagem?\n\nConfirme sua situação para registrarmos no sistema.' },
];

export const LINKS_DEFAULT = [
  { id:1, section:'interno', name:'Sistema Fadiga', desc:'Painel de alertas',    icon:'ti-activity',         bg:'#E6F1FB', ic:'#0C447C', url:'#' },
  { id:2, section:'interno', name:'CRM Motoristas', desc:'Cadastro e histórico', icon:'ti-users',            bg:'#EAF3DE', ic:'#27500A', url:'#' },
  { id:3, section:'interno', name:'Relatórios',     desc:'Indicadores e dados',  icon:'ti-chart-bar',        bg:'#EEEDFE', ic:'#3C3489', url:'#' },
  { id:4, section:'interno', name:'Escala Equipe',  desc:'Turnos e plantões',    icon:'ti-calendar',         bg:'#FAECE7', ic:'#7D2E10', url:'#' },
  { id:5, section:'externo', name:'WhatsApp Web',   desc:'Atendimento',          icon:'ti-brand-whatsapp',   bg:'#EAF3DE', ic:'#27500A', url:'https://web.whatsapp.com' },
  { id:6, section:'externo', name:'E-mail',         desc:'Caixa de entrada',     icon:'ti-mail',             bg:'#E6F1FB', ic:'#0C447C', url:'https://gmail.com' },
  { id:7, section:'externo', name:'Google Maps',    desc:'Localização de rotas', icon:'ti-map-pin',          bg:'#FAECE7', ic:'#7D2E10', url:'https://maps.google.com' },
  { id:8, section:'externo', name:'aNotepad',       desc:'Notas online',         icon:'ti-file-text',        bg:'#EEEDFE', ic:'#3C3489', url:'https://anotepad.com' },
];

export const WS_ICONS = [
  { i:'ti-file-text',      bg:'#E6F1FB', ic:'#0C447C' },
  { i:'ti-clipboard-list', bg:'#EAF3DE', ic:'#27500A' },
  { i:'ti-alert-triangle', bg:'#FAECE7', ic:'#7D2E10' },
  { i:'ti-users',          bg:'#EEEDFE', ic:'#3C3489' },
  { i:'ti-link',           bg:'#FAEEDA', ic:'#633806' },
  { i:'ti-shield-check',   bg:'#E1F5EE', ic:'#085041' },
  { i:'ti-truck',          bg:'#FAECE7', ic:'#993C1D' },
  { i:'ti-settings',       bg:'#F1EFE8', ic:'#444441' },
];

export const WS_CATEGORIES = [
  { id:'protocolos', label:'Protocolos',         icon:'ti-shield-check' },
  { id:'sistemas',   label:'Sistemas & Acessos', icon:'ti-key' },
  { id:'config',     label:'Configurações',      icon:'ti-settings' },
];

export const WS_PAGES_DEFAULT = [
  { id:1,  title:'Padronização de Tratativas', icon:1, category:'protocolos', favorite:true,  content:'<h2>Padronização de Tratativas</h2><p>Fluxo padrão de atendimento para alertas de fadiga.</p><ol><li>Identificar o alerta no sistema</li><li>Localizar o motorista</li><li>Realizar contato telefônico</li><li>Aplicar questionário de fadiga</li><li>Registrar resultado e encerrar</li></ol>' },
  { id:2,  title:'Retorno Intervenção',         icon:2, category:'protocolos', favorite:false, content:'<h2>Retorno Intervenção</h2><ul><li>Confirmar que o motorista encostou o veículo</li><li>Aguardar retorno em até 30 minutos</li><li>Se não houver retorno, acionar gestor da frota</li></ul>' },
  { id:3,  title:'Sem Contato — Condutor',      icon:2, category:'protocolos', favorite:true,  content:'<h2>Sem Contato — Condutor</h2><ol><li>Tentar ligar 3 vezes com intervalo de 5 minutos</li><li>Enviar mensagem via WhatsApp</li><li>Notificar transportadora responsável</li><li>Registrar ocorrência no sistema</li></ol>' },
  { id:4,  title:'Motorista Hostil',            icon:2, category:'protocolos', favorite:false, content:'<h2>Motorista Hostil</h2><p>Protocolo para situações em que o motorista apresenta comportamento hostil durante o contato.</p>' },
  { id:5,  title:'ALB-MAXTRACK',                icon:6, category:'sistemas',   favorite:false, content:'<h2>ALB-MAXTRACK</h2><ul><li>Link de acesso ao sistema</li><li>Login padrão da equipe</li><li>Procedimentos de consulta de alertas</li></ul>' },
  { id:6,  title:'Acessos Horizon',             icon:4, category:'sistemas',   favorite:false, content:'<h2>Acessos Horizon</h2><p>Credenciais e links de acesso ao sistema Horizon.</p>' },
  { id:7,  title:'Trimble',                     icon:0, category:'sistemas',   favorite:false, content:'<h2>Trimble</h2><p>Informações sobre acesso e uso da plataforma Trimble.</p>' },
  { id:8,  title:'Autotrack',                   icon:6, category:'sistemas',   favorite:false, content:'<h2>Autotrack</h2><p>Informações de acesso e procedimentos na plataforma Autotrack.</p>' },
  { id:9,  title:'Cobli — Link',                icon:4, category:'sistemas',   favorite:false, content:'<h2>Cobli — Link</h2><p>Link direto de acesso à plataforma Cobli e instruções de uso.</p>' },
  { id:10, title:'Filtros do Sistema',          icon:7, category:'config',     favorite:false, content:'<h2>Filtros do Sistema</h2><p>Configurações de filtros e visualizações utilizados no monitoramento diário.</p>' },
];

export const NOTES_DEFAULT = [
  { id:1, title:'Protocolo de Contato',  body:'1. Ligar 3x com intervalo de 5min\n2. Se não atender, enviar WhatsApp\n3. Notificar transportadora\n4. Registrar no sistema', date:'Hoje · 09:14' },
  { id:2, title:'Códigos de Alerta',     body:'NV1 – Sonolência leve\nNV2 – Sonolência moderada\nNV3 – Sonolência grave (intervir imediatamente)\nNV4 – Crítico (acionar gestor)', date:'Ontem' },
  { id:3, title:'Reunião 06/05',         body:'Pontos discutidos:\n- Aumento de alertas no turno noturno\n- Novo template para Transval\n- Revisar tempo médio de intervenção', date:'06 mai' },
];

export const REMINDERS_DEFAULT = [];
