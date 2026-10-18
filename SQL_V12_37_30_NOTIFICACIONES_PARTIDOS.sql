-- TorNewcom V12.37.30 — notificaciones automáticas por cambios de partidos
create table if not exists public.notificaciones_sistema (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  destinatario_id uuid not null references public.perfiles(id) on delete cascade,
  partido_id uuid null references public.partidos(id) on delete set null,
  tipo text not null,
  titulo text not null,
  detalle text not null,
  cambios jsonb not null default '{}'::jsonb,
  leida boolean not null default false,
  creado_por uuid null references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  leida_en timestamptz null
);
alter table public.notificaciones_sistema enable row level security;

drop policy if exists "notificaciones ver propias" on public.notificaciones_sistema;
create policy "notificaciones ver propias" on public.notificaciones_sistema for select to authenticated
using (destinatario_id=auth.uid() or es_admin_actual());
drop policy if exists "notificaciones actualizar propias" on public.notificaciones_sistema;
create policy "notificaciones actualizar propias" on public.notificaciones_sistema for update to authenticated
using (destinatario_id=auth.uid()) with check (destinatario_id=auth.uid());
drop policy if exists "notificaciones crear organizador" on public.notificaciones_sistema;
create policy "notificaciones crear organizador" on public.notificaciones_sistema for insert to authenticated
with check (es_organizador_de(torneo_id) or es_admin_actual());

grant select,insert,update on public.notificaciones_sistema to authenticated;

create or replace function public.crear_notificaciones_cambio_partido(
  p_partido uuid, p_tipo text, p_titulo text, p_detalle text, p_cambios jsonb default '{}'::jsonb,
  p_equipo_ids uuid[] default array[]::uuid[]
) returns table(id uuid)
language plpgsql security definer set search_path=public as $$
declare v_torneo uuid; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Sesión requerida'; end if;
  select torneo_id into v_torneo from public.partidos where partidos.id=p_partido;
  if v_torneo is null then raise exception 'Partido inexistente'; end if;
  if not (es_organizador_de(v_torneo) or es_admin_actual()) then raise exception 'Sin permiso'; end if;
  return query
  with destinatarios as (
    select distinct i.responsable_usuario_id uid
    from public.equipos_competitivos e join public.instituciones i on i.id=e.institucion_id
    where e.id=any(coalesce(p_equipo_ids,array[]::uuid[])) and i.responsable_usuario_id is not null
  ), ins as (
    insert into public.notificaciones_sistema(torneo_id,destinatario_id,partido_id,tipo,titulo,detalle,cambios,creado_por)
    select v_torneo,d.uid,p_partido,coalesce(nullif(trim(p_tipo),''),'PARTIDO_MODIFICADO'),p_titulo,p_detalle,coalesce(p_cambios,'{}'::jsonb),v_uid
    from destinatarios d returning notificaciones_sistema.id
  ) select ins.id from ins;
end $$;
revoke all on function public.crear_notificaciones_cambio_partido(uuid,text,text,text,jsonb,uuid[]) from public;
grant execute on function public.crear_notificaciones_cambio_partido(uuid,text,text,text,jsonb,uuid[]) to authenticated;


-- Payload seguro para Edge Function de email
create or replace function public.payload_email_notificacion(p_notificacion uuid)
returns table(notificacion_id uuid, destinatario_email text, destinatario_nombre text, torneo_nombre text, titulo text, detalle text)
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Sesión requerida'; end if;
  return query
  select n.id,p.email,p.nombre,t.nombre,n.titulo,n.detalle
  from public.notificaciones_sistema n
  join public.perfiles p on p.id=n.destinatario_id
  join public.torneos t on t.id=n.torneo_id
  where n.id=p_notificacion and n.creado_por=v_uid;
end $$;
revoke all on function public.payload_email_notificacion(uuid) from public;
grant execute on function public.payload_email_notificacion(uuid) to authenticated;
