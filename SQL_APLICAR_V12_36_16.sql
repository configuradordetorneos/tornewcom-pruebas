-- TORNEWCOM V12.36.16 CANDIDATA
-- SOLICITUDES BILATERALES PARA LISTAS DE EQUIPOS CERRADOS
-- SOLO tornewcom-test hasta completar pruebas.
-- Migración ADITIVA y AISLADA: no modifica solicitudes_cambio_plantel ni datos existentes.

begin;

create table if not exists public.solicitudes_lista_cerrada (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references public.torneos(id) on delete cascade,
  institucion_id uuid not null references public.instituciones(id) on delete cascade,
  equipo_origen_id uuid references public.equipos_competitivos(id) on delete set null,
  equipo_destino_id uuid references public.equipos_competitivos(id) on delete set null,
  jugador_id uuid references public.jugadores(id) on delete set null,
  accion text not null check (accion in ('ALTA','BAJA','MODIFICACION')),
  motivo text not null,
  solicitante_id uuid references public.perfiles(id) on delete set null,
  solicitante_rol text not null check (solicitante_rol in ('RESPONSABLE','ORGANIZADOR')),
  aprobador_rol text not null check (aprobador_rol in ('RESPONSABLE','ORGANIZADOR')),
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','APLICADA','RECHAZADA')),
  resuelto_por uuid references public.perfiles(id) on delete set null,
  solicitado_en timestamptz not null default now(),
  resuelto_en timestamptz,
  jugador_nombre_snapshot text not null,
  jugador_dni_snapshot text,
  equipo_origen_snapshot text not null,
  equipo_destino_snapshot text,
  constraint solicitudes_lista_motivo_no_vacio check (length(trim(motivo))>0),
  constraint solicitudes_lista_motivo_max_300 check (
    coalesce(array_length(regexp_split_to_array(trim(motivo), E'\\s+'),1),0) <= 300
  )
);

create index if not exists solicitudes_lista_torneo_idx on public.solicitudes_lista_cerrada(torneo_id);
create index if not exists solicitudes_lista_institucion_idx on public.solicitudes_lista_cerrada(institucion_id);
create index if not exists solicitudes_lista_estado_idx on public.solicitudes_lista_cerrada(estado,solicitado_en desc);
create unique index if not exists solicitudes_lista_pendiente_unica_idx
  on public.solicitudes_lista_cerrada(
    equipo_origen_id,
    jugador_id,
    accion,
    coalesce(equipo_destino_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  where estado='PENDIENTE';

alter table public.solicitudes_lista_cerrada enable row level security;
revoke all on table public.solicitudes_lista_cerrada from public, anon, authenticated;

create or replace function public.crear_solicitud_lista_cerrada(
  p_equipo_origen_id uuid,
  p_jugador_id uuid,
  p_accion text,
  p_motivo text,
  p_equipo_destino_id uuid default null,
  p_solicitante_rol text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_accion text := upper(trim(coalesce(p_accion,'')));
  v_motivo text := trim(coalesce(p_motivo,''));
  v_rol text := upper(trim(coalesce(p_solicitante_rol,'')));
  v_aprobador text;
  v_torneo uuid;
  v_inst uuid;
  v_cat uuid;
  v_eq_nombre text;
  v_dest_torneo uuid;
  v_dest_inst uuid;
  v_dest_nombre text;
  v_j_torneo uuid;
  v_j_inst uuid;
  v_j_nombre text;
  v_j_dni text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'No hay una sesión autenticada.'; end if;
  if v_accion not in ('ALTA','BAJA','MODIFICACION') then raise exception 'Acción inválida.'; end if;
  if v_motivo='' then raise exception 'El motivo es obligatorio.'; end if;
  if coalesce(array_length(regexp_split_to_array(v_motivo,E'\\s+'),1),0)>300 then
    raise exception 'El motivo no puede superar 300 palabras.';
  end if;

  select e.torneo_id,e.institucion_id,e.categoria_torneo_id,e.nombre
    into v_torneo,v_inst,v_cat,v_eq_nombre
  from public.equipos_competitivos e
  where e.id=p_equipo_origen_id;
  if v_torneo is null then raise exception 'No se encontró el equipo.'; end if;

  if coalesce(public.plantel_categoria_abierto(v_cat),true) then
    raise exception 'La lista de este equipo todavía está abierta. No necesita solicitud excepcional.';
  end if;

  select j.torneo_id,j.institucion_id,j.nombre_apellido,j.dni
    into v_j_torneo,v_j_inst,v_j_nombre,v_j_dni
  from public.jugadores j
  where j.id=p_jugador_id;
  if v_j_torneo is null then raise exception 'No se encontró el jugador.'; end if;
  if v_j_torneo<>v_torneo or v_j_inst<>v_inst then
    raise exception 'El jugador no pertenece a la misma institución y torneo del equipo.';
  end if;

  if v_rol='RESPONSABLE' then
    if not public.es_responsable_de_institucion(v_inst) then
      raise exception 'No tenés permiso como Responsable de esta institución.';
    end if;
    v_aprobador:='ORGANIZADOR';
  elsif v_rol='ORGANIZADOR' then
    if not (public.es_admin_actual() or public.es_organizador_de(v_torneo)) then
      raise exception 'No tenés permiso como Organizador de este torneo.';
    end if;
    if not exists (
      select 1 from public.instituciones i
      where i.id=v_inst and i.responsable_usuario_id is not null
    ) then
      raise exception 'La institución no tiene un Responsable registrado que pueda autorizar el cambio.';
    end if;
    v_aprobador:='RESPONSABLE';
  else
    raise exception 'Debe indicarse si la solicitud la inicia el Responsable o el Organizador.';
  end if;

  if v_accion='ALTA' then
    if exists (
      select 1 from public.jugador_equipos je
      where je.jugador_id=p_jugador_id and je.equipo_competitivo_id=p_equipo_origen_id
    ) then raise exception 'El jugador ya está declarado en este equipo.'; end if;
    if p_equipo_destino_id is not null then raise exception 'ALTA no utiliza equipo de destino.'; end if;
  elsif v_accion='BAJA' then
    if not exists (
      select 1 from public.jugador_equipos je
      where je.jugador_id=p_jugador_id and je.equipo_competitivo_id=p_equipo_origen_id
    ) then raise exception 'El jugador no está declarado en este equipo.'; end if;
    if p_equipo_destino_id is not null then raise exception 'BAJA no utiliza equipo de destino.'; end if;
  else
    if not exists (
      select 1 from public.jugador_equipos je
      where je.jugador_id=p_jugador_id and je.equipo_competitivo_id=p_equipo_origen_id
    ) then raise exception 'El jugador no está declarado en el equipo de origen.'; end if;
    if p_equipo_destino_id is null then raise exception 'La MODIFICACIÓN requiere equipo de destino.'; end if;
    if p_equipo_destino_id=p_equipo_origen_id then raise exception 'El destino debe ser distinto del origen.'; end if;
    select e.torneo_id,e.institucion_id,e.nombre
      into v_dest_torneo,v_dest_inst,v_dest_nombre
    from public.equipos_competitivos e where e.id=p_equipo_destino_id;
    if v_dest_torneo is null then raise exception 'No se encontró el equipo de destino.'; end if;
    if v_dest_torneo<>v_torneo or v_dest_inst<>v_inst then
      raise exception 'El equipo de destino debe pertenecer a la misma institución y torneo.';
    end if;
    if exists (
      select 1 from public.jugador_equipos je
      where je.jugador_id=p_jugador_id and je.equipo_competitivo_id=p_equipo_destino_id
    ) then raise exception 'El jugador ya está declarado en el equipo de destino.'; end if;
  end if;

  insert into public.solicitudes_lista_cerrada(
    torneo_id,institucion_id,equipo_origen_id,equipo_destino_id,jugador_id,
    accion,motivo,solicitante_id,solicitante_rol,aprobador_rol,
    jugador_nombre_snapshot,jugador_dni_snapshot,equipo_origen_snapshot,equipo_destino_snapshot
  ) values (
    v_torneo,v_inst,p_equipo_origen_id,p_equipo_destino_id,p_jugador_id,
    v_accion,v_motivo,auth.uid(),v_rol,v_aprobador,
    v_j_nombre,v_j_dni,v_eq_nombre,v_dest_nombre
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.resolver_solicitud_lista_cerrada(
  p_solicitud uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.solicitudes_lista_cerrada%rowtype;
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_j_torneo uuid;
  v_j_inst uuid;
  v_dst_torneo uuid;
  v_dst_inst uuid;
begin
  if auth.uid() is null then raise exception 'No hay una sesión autenticada.'; end if;
  if v_decision not in ('AUTORIZAR','RECHAZAR') then raise exception 'Decisión inválida.'; end if;

  select * into s
  from public.solicitudes_lista_cerrada
  where id=p_solicitud
  for update;

  if s.id is null then raise exception 'Solicitud inexistente.'; end if;
  if s.estado<>'PENDIENTE' then raise exception 'La solicitud ya fue resuelta.'; end if;
  if s.solicitante_id=auth.uid() then raise exception 'La misma persona que solicita no puede autorizar su propio cambio.'; end if;

  if s.aprobador_rol='ORGANIZADOR' then
    if not (public.es_admin_actual() or public.es_organizador_de(s.torneo_id)) then
      raise exception 'Esta solicitud debe resolverla el Organizador del torneo.';
    end if;
  elsif s.aprobador_rol='RESPONSABLE' then
    if not public.es_responsable_de_institucion(s.institucion_id) then
      raise exception 'Esta solicitud debe resolverla el Responsable de la institución.';
    end if;
  else
    raise exception 'La solicitud no tiene un rol aprobador válido.';
  end if;

  if v_decision='RECHAZAR' then
    update public.solicitudes_lista_cerrada
       set estado='RECHAZADA',resuelto_por=auth.uid(),resuelto_en=now()
     where id=s.id;
    return 'Solicitud rechazada. La lista no fue modificada.';
  end if;

  if s.jugador_id is null or s.equipo_origen_id is null then
    raise exception 'La solicitud perdió referencias necesarias y no puede aplicarse.';
  end if;

  select torneo_id,institucion_id into v_j_torneo,v_j_inst
  from public.jugadores where id=s.jugador_id;
  if v_j_torneo is null or v_j_torneo<>s.torneo_id or v_j_inst<>s.institucion_id then
    raise exception 'El jugador ya no pertenece al contexto original de la solicitud.';
  end if;

  if s.accion='ALTA' then
    if exists (
      select 1 from public.jugador_equipos
      where jugador_id=s.jugador_id and equipo_competitivo_id=s.equipo_origen_id
    ) then raise exception 'El jugador ya está declarado en ese equipo.'; end if;
    insert into public.jugador_equipos(jugador_id,equipo_competitivo_id)
    values(s.jugador_id,s.equipo_origen_id);

  elsif s.accion='BAJA' then
    delete from public.jugador_equipos
    where jugador_id=s.jugador_id and equipo_competitivo_id=s.equipo_origen_id;
    if not found then raise exception 'La asignación ya no existe.'; end if;

  elsif s.accion='MODIFICACION' then
    if s.equipo_destino_id is null then raise exception 'Falta el equipo de destino.'; end if;
    select torneo_id,institucion_id into v_dst_torneo,v_dst_inst
    from public.equipos_competitivos where id=s.equipo_destino_id;
    if v_dst_torneo is null or v_dst_torneo<>s.torneo_id or v_dst_inst<>s.institucion_id then
      raise exception 'El equipo de destino ya no corresponde al mismo torneo e institución.';
    end if;
    if not exists (
      select 1 from public.jugador_equipos
      where jugador_id=s.jugador_id and equipo_competitivo_id=s.equipo_origen_id
    ) then raise exception 'La asignación de origen ya no existe.'; end if;
    if exists (
      select 1 from public.jugador_equipos
      where jugador_id=s.jugador_id and equipo_competitivo_id=s.equipo_destino_id
    ) then raise exception 'El jugador ya está declarado en el equipo de destino.'; end if;
    -- Primero el destino. Si un trigger de edad/pertenencia falla, toda la función revierte.
    insert into public.jugador_equipos(jugador_id,equipo_competitivo_id)
    values(s.jugador_id,s.equipo_destino_id);
    delete from public.jugador_equipos
    where jugador_id=s.jugador_id and equipo_competitivo_id=s.equipo_origen_id;
  else
    raise exception 'Acción inválida en la solicitud.';
  end if;

  update public.solicitudes_lista_cerrada
     set estado='APLICADA',resuelto_por=auth.uid(),resuelto_en=now()
   where id=s.id;

  return 'Solicitud autorizada y cambio aplicado correctamente.';
end;
$$;

create or replace function public.listar_solicitudes_lista_cerrada()
returns table(
  id uuid,
  torneo_id uuid,
  torneo_nombre text,
  institucion_id uuid,
  institucion_nombre text,
  equipo_origen_id uuid,
  equipo_origen_nombre text,
  equipo_destino_id uuid,
  equipo_destino_nombre text,
  jugador_id uuid,
  jugador_nombre text,
  jugador_dni text,
  accion text,
  motivo text,
  solicitante_rol text,
  aprobador_rol text,
  estado text,
  solicitado_en timestamptz,
  resuelto_en timestamptz,
  puede_resolver boolean,
  es_propia boolean
)
language sql
security definer
stable
set search_path=public
as $$
  select
    s.id,
    s.torneo_id,
    t.nombre,
    s.institucion_id,
    i.nombre,
    s.equipo_origen_id,
    s.equipo_origen_snapshot,
    s.equipo_destino_id,
    s.equipo_destino_snapshot,
    s.jugador_id,
    s.jugador_nombre_snapshot,
    s.jugador_dni_snapshot,
    s.accion,
    s.motivo,
    s.solicitante_rol,
    s.aprobador_rol,
    s.estado,
    s.solicitado_en,
    s.resuelto_en,
    (
      s.estado='PENDIENTE'
      and s.solicitante_id is distinct from auth.uid()
      and (
        (s.aprobador_rol='ORGANIZADOR' and (public.es_admin_actual() or public.es_organizador_de(s.torneo_id)))
        or
        (s.aprobador_rol='RESPONSABLE' and public.es_responsable_de_institucion(s.institucion_id))
      )
    ) as puede_resolver,
    (s.solicitante_id=auth.uid()) as es_propia
  from public.solicitudes_lista_cerrada s
  join public.torneos t on t.id=s.torneo_id
  join public.instituciones i on i.id=s.institucion_id
  where auth.uid() is not null
    and (
      public.es_admin_actual()
      or public.es_organizador_de(s.torneo_id)
      or public.es_responsable_de_institucion(s.institucion_id)
    )
  order by s.solicitado_en desc;
$$;

create or replace function public.resumen_solicitudes_lista_cerrada()
returns jsonb
language sql
security definer
stable
set search_path=public
as $$
  select jsonb_build_object(
    'como_organizador', count(*) filter (
      where s.estado='PENDIENTE'
        and s.solicitante_id is distinct from auth.uid()
        and s.aprobador_rol='ORGANIZADOR'
        and (public.es_admin_actual() or public.es_organizador_de(s.torneo_id))
    ),
    'como_responsable', count(*) filter (
      where s.estado='PENDIENTE'
        and s.solicitante_id is distinct from auth.uid()
        and s.aprobador_rol='RESPONSABLE'
        and public.es_responsable_de_institucion(s.institucion_id)
    )
  )
  from public.solicitudes_lista_cerrada s
  where auth.uid() is not null;
$$;

revoke all on function public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text) from public, anon;
revoke all on function public.resolver_solicitud_lista_cerrada(uuid,text) from public, anon;
revoke all on function public.listar_solicitudes_lista_cerrada() from public, anon;
revoke all on function public.resumen_solicitudes_lista_cerrada() from public, anon;
grant execute on function public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text) to authenticated;
grant execute on function public.resolver_solicitud_lista_cerrada(uuid,text) to authenticated;
grant execute on function public.listar_solicitudes_lista_cerrada() to authenticated;
grant execute on function public.resumen_solicitudes_lista_cerrada() to authenticated;

commit;

select
  to_regclass('public.solicitudes_lista_cerrada') as tabla,
  to_regprocedure('public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text)') as crear,
  to_regprocedure('public.resolver_solicitud_lista_cerrada(uuid,text)') as resolver,
  to_regprocedure('public.listar_solicitudes_lista_cerrada()') as listar,
  to_regprocedure('public.resumen_solicitudes_lista_cerrada()') as resumen;
