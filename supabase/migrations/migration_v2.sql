-- ============================================================
-- MedNet · Migration v2 — dados compartilhados da equipe
-- Execute no SQL Editor do Supabase (supabase.com)
-- ============================================================

-- ── Templates ──────────────────────────────────────────────
create table if not exists public.templates (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tag        text not null,
  tag_label  text not null,
  title      text not null,
  body       text not null
);
alter table public.templates enable row level security;
create policy "auth_all_templates" on public.templates
  for all to authenticated using (true) with check (true);

-- ── Links rápidos ──────────────────────────────────────────
create table if not exists public.links (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  section     text not null default 'interno',
  name        text not null,
  description text,
  icon        text default 'ti-link',
  bg          text,
  ic          text,
  url         text not null
);
alter table public.links enable row level security;
create policy "auth_all_links" on public.links
  for all to authenticated using (true) with check (true);

-- ── Workspace (páginas) ─────────────────────────────────────
create table if not exists public.ws_pages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,
  icon_index  int not null default 0,
  category    text not null default 'protocolos',
  favorite    boolean not null default false,
  content     text
);
alter table public.ws_pages enable row level security;
create policy "auth_all_ws_pages" on public.ws_pages
  for all to authenticated using (true) with check (true);

-- ── Notas ──────────────────────────────────────────────────
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title      text not null,
  body       text
);
alter table public.notes enable row level security;
create policy "auth_all_notes" on public.notes
  for all to authenticated using (true) with check (true);

-- ── Lembretes ──────────────────────────────────────────────
create table if not exists public.reminders (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title      text not null,
  sub        text,
  time       text not null,
  urgent     boolean not null default false,
  done       boolean not null default false
);
alter table public.reminders enable row level security;
create policy "auth_all_reminders" on public.reminders
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Seed: Templates padrão (insere apenas se a tabela estiver vazia)
-- ============================================================
do $$ begin
  if not exists (select 1 from public.templates limit 1) then
    insert into public.templates (tag, tag_label, title, body) values
      ('contato',      'Contato',      'Contato Inicial – Motorista',   'Olá, [NOME]! Tudo bem? Aqui é [SEU NOME] da MedNet, setor Fadiga Zero.' || chr(10) || chr(10) || 'Estamos entrando em contato pois identificamos um alerta de fadiga no seu monitoramento. Poderia responder algumas perguntas rápidas?'),
      ('questionario', 'Questionário', 'Questionário de Fadiga',        'Vou realizar algumas perguntas sobre seu estado atual:' || chr(10) || chr(10) || '1. Há quantas horas está dirigindo sem pausa?' || chr(10) || '2. Dormiu quantas horas na última noite?' || chr(10) || '3. Está sentindo sonolência, visão turva ou dificuldade de concentração?' || chr(10) || '4. Quando foi a última pausa para descanso?' || chr(10) || '5. Está em condições de continuar a viagem?'),
      ('alerta',       'Alerta',       'Solicitação de Intervenção',    'Prezado [GESTOR/TRANSPORTADORA],' || chr(10) || chr(10) || 'Identificamos alerta crítico de fadiga para o motorista [NOME], placa [PLACA], rota [ROTA].' || chr(10) || chr(10) || 'Solicitamos intervenção imediata para garantir a segurança do condutor e da carga.' || chr(10) || chr(10) || 'Horário: [HORA]' || chr(10) || 'Localização: [LOCAL]' || chr(10) || chr(10) || 'MedNet – Fadiga Zero'),
      ('encerramento', 'Encerramento', 'Encerramento de Alerta',        'Olá! Informamos que o alerta de fadiga do motorista [NOME] foi encerrado após contato.' || chr(10) || chr(10) || 'Status: [RESOLVIDO]' || chr(10) || 'Observações: [DETALHE]' || chr(10) || chr(10) || 'Registro atualizado.' || chr(10) || chr(10) || 'Equipe MedNet Fadiga Zero'),
      ('contato',      'Contato',      'Sem Resposta – 2ª Tentativa',   'Olá, [NOME]! Tentamos contato anteriormente mas não obtivemos resposta.' || chr(10) || chr(10) || 'Por favor, responda assim que possível. Em caso de emergência, encoste em local seguro e ligue para nós.'),
      ('contato',      'Contato',      'Motorista Hostil – Protocolo',  'Registro de ocorrência: Motorista [NOME] demonstrou comportamento hostil durante contato.' || chr(10) || chr(10) || 'Data/Hora: [DATA]' || chr(10) || 'Descrição: [DETALHE]' || chr(10) || 'Ação: Notificação à transportadora [NOME].' || chr(10) || chr(10) || 'Analista: [SEU NOME]'),
      ('questionario', 'Questionário', 'Avaliação de Início de Jornada', 'Olá [NOME]! Antes de iniciar sua jornada:' || chr(10) || chr(10) || '1. Quantas horas dormiu nas últimas 24h?' || chr(10) || '2. Consumiu álcool nas últimas 12h?' || chr(10) || '3. Está em uso de medicação que cause sonolência?' || chr(10) || '4. Como está se sentindo agora?' || chr(10) || chr(10) || 'Obrigado!'),
      ('encerramento', 'Encerramento', 'Retorno após Intervenção',      'Olá [NOME], tudo bem?' || chr(10) || chr(10) || 'Como você está após a pausa solicitada? O motorista realizou descanso? Está apto a retornar à viagem?' || chr(10) || chr(10) || 'Confirme sua situação para registrarmos no sistema.');
  end if;
end $$;

-- ============================================================
-- Seed: Links padrão
-- ============================================================
do $$ begin
  if not exists (select 1 from public.links limit 1) then
    insert into public.links (section, name, description, icon, bg, ic, url) values
      ('interno', 'Sistema Fadiga',  'Painel de alertas',    'ti-activity',       '#E6F1FB', '#0C447C', '#'),
      ('interno', 'CRM Motoristas',  'Cadastro e histórico', 'ti-users',          '#EAF3DE', '#27500A', '#'),
      ('interno', 'Relatórios',      'Indicadores e dados',  'ti-chart-bar',      '#EEEDFE', '#3C3489', '#'),
      ('interno', 'Escala Equipe',   'Turnos e plantões',    'ti-calendar',       '#FAECE7', '#7D2E10', '#'),
      ('externo', 'WhatsApp Web',    'Atendimento',          'ti-brand-whatsapp', '#EAF3DE', '#27500A', 'https://web.whatsapp.com'),
      ('externo', 'E-mail',          'Caixa de entrada',     'ti-mail',           '#E6F1FB', '#0C447C', 'https://gmail.com'),
      ('externo', 'Google Maps',     'Localização de rotas', 'ti-map-pin',        '#FAECE7', '#7D2E10', 'https://maps.google.com');
  end if;
end $$;

-- ============================================================
-- Seed: Workspace padrão
-- ============================================================
do $$ begin
  if not exists (select 1 from public.ws_pages limit 1) then
    insert into public.ws_pages (title, icon_index, category, favorite, content) values
      ('Padronização de Tratativas', 1, 'protocolos', true,  '<h2>Padronização de Tratativas</h2><p>Fluxo padrão de atendimento para alertas de fadiga.</p><ol><li>Identificar o alerta no sistema</li><li>Localizar o motorista</li><li>Realizar contato telefônico</li><li>Aplicar questionário de fadiga</li><li>Registrar resultado e encerrar</li></ol>'),
      ('Retorno Intervenção',        2, 'protocolos', false, '<h2>Retorno Intervenção</h2><ul><li>Confirmar que o motorista encostou o veículo</li><li>Aguardar retorno em até 30 minutos</li><li>Se não houver retorno, acionar gestor da frota</li></ul>'),
      ('Sem Contato — Condutor',     2, 'protocolos', true,  '<h2>Sem Contato — Condutor</h2><ol><li>Tentar ligar 3 vezes com intervalo de 5 minutos</li><li>Enviar mensagem via WhatsApp</li><li>Notificar transportadora responsável</li><li>Registrar ocorrência no sistema</li></ol>'),
      ('Motorista Hostil',           2, 'protocolos', false, '<h2>Motorista Hostil</h2><p>Protocolo para situações em que o motorista apresenta comportamento hostil durante o contato.</p>'),
      ('ALB-MAXTRACK',               6, 'sistemas',   false, '<h2>ALB-MAXTRACK</h2><ul><li>Link de acesso ao sistema</li><li>Login padrão da equipe</li><li>Procedimentos de consulta de alertas</li></ul>'),
      ('Acessos Horizon',            4, 'sistemas',   false, '<h2>Acessos Horizon</h2><p>Credenciais e links de acesso ao sistema Horizon.</p>'),
      ('Trimble',                    0, 'sistemas',   false, '<h2>Trimble</h2><p>Informações sobre acesso e uso da plataforma Trimble.</p>'),
      ('Autotrack',                  6, 'sistemas',   false, '<h2>Autotrack</h2><p>Informações de acesso e procedimentos na plataforma Autotrack.</p>'),
      ('Cobli — Link',               4, 'sistemas',   false, '<h2>Cobli — Link</h2><p>Link direto de acesso à plataforma Cobli e instruções de uso.</p>'),
      ('Filtros do Sistema',         7, 'config',     false, '<h2>Filtros do Sistema</h2><p>Configurações de filtros e visualizações utilizados no monitoramento diário.</p>');
  end if;
end $$;
