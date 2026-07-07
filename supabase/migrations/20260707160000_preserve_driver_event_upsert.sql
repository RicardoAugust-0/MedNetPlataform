-- Upsert preservativo para ingestao de eventos.
--
-- O bot da MaxTrack pode reenviar eventos ja existentes com campos que chegam
-- depois (evidencia, inicio/fim de tratativa, operador). O upsert antigo usava
-- DO NOTHING, entao esses campos nunca preenchiam duplicatas existentes.

create or replace function public.upsert_driver_events_preserve(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  insert into public.driver_events (
    platform_id,
    placa,
    nome,
    cpf,
    matricula,
    transportadora,
    frota,
    nome_evento,
    descricao,
    categoria_bucket,
    severidade,
    turno,
    localidade,
    velocidade_kmh,
    duracao_seg,
    analise_ia_plataforma,
    raw_event_type_id,
    ocorrido_em,
    evidencia,
    inicio_tratativa,
    fim_tratativa,
    operador
  )
  select
    platform_id,
    placa,
    nome,
    cpf,
    matricula,
    transportadora,
    frota,
    nome_evento,
    descricao,
    categoria_bucket,
    severidade,
    turno,
    localidade,
    velocidade_kmh,
    duracao_seg,
    analise_ia_plataforma,
    raw_event_type_id,
    ocorrido_em,
    evidencia,
    inicio_tratativa,
    fim_tratativa,
    operador
  from jsonb_to_recordset(p_rows) as r(
    platform_id text,
    placa text,
    nome text,
    cpf text,
    matricula text,
    transportadora text,
    frota text,
    nome_evento text,
    descricao text,
    categoria_bucket text,
    severidade text,
    turno text,
    localidade text,
    velocidade_kmh numeric,
    duracao_seg numeric,
    analise_ia_plataforma text,
    raw_event_type_id text,
    ocorrido_em timestamptz,
    evidencia text,
    inicio_tratativa timestamptz,
    fim_tratativa timestamptz,
    operador text
  )
  on conflict (platform_id, placa, ocorrido_em, nome_evento) do update set
    nome = coalesce(excluded.nome, driver_events.nome),
    cpf = coalesce(excluded.cpf, driver_events.cpf),
    matricula = coalesce(excluded.matricula, driver_events.matricula),
    transportadora = coalesce(excluded.transportadora, driver_events.transportadora),
    frota = coalesce(excluded.frota, driver_events.frota),
    descricao = coalesce(excluded.descricao, driver_events.descricao),
    categoria_bucket = coalesce(excluded.categoria_bucket, driver_events.categoria_bucket),
    severidade = coalesce(excluded.severidade, driver_events.severidade),
    turno = coalesce(excluded.turno, driver_events.turno),
    localidade = coalesce(excluded.localidade, driver_events.localidade),
    velocidade_kmh = coalesce(excluded.velocidade_kmh, driver_events.velocidade_kmh),
    duracao_seg = coalesce(excluded.duracao_seg, driver_events.duracao_seg),
    analise_ia_plataforma = coalesce(excluded.analise_ia_plataforma, driver_events.analise_ia_plataforma),
    raw_event_type_id = coalesce(excluded.raw_event_type_id, driver_events.raw_event_type_id),
    evidencia = coalesce(excluded.evidencia, driver_events.evidencia),
    inicio_tratativa = coalesce(excluded.inicio_tratativa, driver_events.inicio_tratativa),
    fim_tratativa = coalesce(excluded.fim_tratativa, driver_events.fim_tratativa),
    operador = coalesce(excluded.operador, driver_events.operador);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.upsert_driver_events_preserve(jsonb) from anon;
grant execute on function public.upsert_driver_events_preserve(jsonb) to authenticated;
grant execute on function public.upsert_driver_events_preserve(jsonb) to service_role;
