-- O diretório implantado no orquestrador chama-se BOT_HorizonTratamento.
-- Corrige o endpoint legado em inglês e preserva o modo assíncrono.
update public.automations
set name = 'BOT_HorizonTratamento',
    endpoint = 'https://botsplaywright.duckdns.org/automacoes/BOT_HorizonTratamento?background=true',
    active = true,
    trigger = 'agendado',
    schedule = 'a cada 15 minutos',
    schedule_type = 'interval',
    schedule_interval_minutes = 15,
    event_type = null
where id = 'f0a94e82-e3e7-4c74-bfd4-3a56df93df27';
