alter table public.ws_pages add column if not exists position integer;

with ordered as (
  select id, row_number() over (order by created_at) - 1 as pos
  from public.ws_pages
)
update public.ws_pages
set position = ordered.pos
from ordered
where public.ws_pages.id = ordered.id;
