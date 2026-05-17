alter table public.templates add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as pos
  from public.templates
)
update public.templates
set position = ordered.pos
from ordered
where public.templates.id = ordered.id;
