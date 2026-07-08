-- Ensure atendimentos.bucket exists in environments that drifted from migrations.

alter table public.atendimentos
  add column if not exists bucket text
  check (bucket in ('intervencao', 'reportar', 'tecnico'));

update public.atendimentos
set bucket = case
  when tipo in ('intervencao', 'descarte') then 'intervencao'
  when tipo = 'reportar' then 'reportar'
  else null
end
where bucket is null;

create index if not exists atendimentos_bucket_idx
  on public.atendimentos (bucket);
