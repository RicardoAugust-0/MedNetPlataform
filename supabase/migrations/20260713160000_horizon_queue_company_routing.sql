-- Propaga a empresa do alerta MaxTrack para a fila de tratamento Horizon.
-- O bot usa este campo para abrir apenas a conta correspondente, evitando
-- varrer todas as credenciais e resolver captchas desnecessarios.
alter table public.horizon_treatment_queue
  add column if not exists empresa text;

update public.horizon_treatment_queue q
set empresa = nullif(trim(e.frota), '')
from public.driver_events e
where e.id = q.driver_event_id
  and q.empresa is null;

create index if not exists horizon_treatment_queue_empresa_pending_idx
  on public.horizon_treatment_queue (empresa)
  where status = 'pending';
