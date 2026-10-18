-- TorNewcom V12.37.26 — Mensajería y organizadores suspendidos
-- Proyecto de prueba: tornewcom-test
-- Objetivos:
-- 1) Un Organizador suspendido conserva comunicación con el Administrador General.
-- 2) Un Organizador suspendido NO puede comunicarse operativamente con Responsables.
-- 3) Los Responsables no ven Organizadores suspendidos como destinatarios.
-- 4) El Administrador General puede escribir a Organizadores (activos o suspendidos)
--    y a Responsables. El Responsable no puede escribir directamente al Admin General.
-- 5) Los destinatarios incluyen el nombre de la institución cuando corresponde.

begin;

create or replace function public.enviar_mensaje_interno(
  p_destinatario uuid,
  p_torneo uuid,
  p_asunto text,
  p_mensaje text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remitente uuid := auth.uid();
  v_id uuid;
  v_rem_admin boolean := false;
  v_dest_admin boolean := false;
  v_rem_org_habilitado boolean := false;
  v_dest_org_habilitado boolean := false;
  v_rem_org_miembro boolean := false;
  v_dest_org_miembro boolean := false;
  v_rem_resp boolean := false;
  v_dest_resp boolean := false;
begin
  if v_remitente is null then
    raise exception 'Usuario no autenticado';
  end if;

  if p_destinatario is null or p_destinatario = v_remitente then
    raise exception 'Destinatario inválido';
  end if;

  if p_torneo is null then
    raise exception 'Falta identificar el torneo';
  end if;

  if nullif(trim(coalesce(p_mensaje,'')),'') is null then
    raise exception 'El mensaje está vacío';
  end if;

  select
    coalesce(es_admin_general,false),
    coalesce(puede_crear_torneos,false)
  into v_rem_admin, v_rem_org_habilitado
  from public.perfiles
  where id = v_remitente;

  if not found then
    raise exception 'Remitente inexistente';
  end if;

  select
    coalesce(es_admin_general,false),
    coalesce(puede_crear_torneos,false)
  into v_dest_admin, v_dest_org_habilitado
  from public.perfiles
  where id = p_destinatario;

  if not found then
    raise exception 'Destinatario inexistente';
  end if;

  select exists(
    select 1 from public.usuarios_torneos
    where torneo_id=p_torneo and usuario_id=v_remitente
      and rol='ORGANIZADOR' and activo=true
  ) into v_rem_org_miembro;

  select exists(
    select 1 from public.usuarios_torneos
    where torneo_id=p_torneo and usuario_id=p_destinatario
      and rol='ORGANIZADOR' and activo=true
  ) into v_dest_org_miembro;

  select exists(
    select 1 from public.usuarios_torneos
    where torneo_id=p_torneo and usuario_id=v_remitente
      and rol='RESPONSABLE' and activo=true
  ) into v_rem_resp;

  select exists(
    select 1 from public.usuarios_torneos
    where torneo_id=p_torneo and usuario_id=p_destinatario
      and rol='RESPONSABLE' and activo=true
  ) into v_dest_resp;

  -- ADMIN GENERAL -> ORGANIZADOR (activo o suspendido) / RESPONSABLE.
  if v_rem_admin then
    if not (v_dest_org_miembro or v_dest_resp) then
      raise exception 'No tenés permiso para enviar este mensaje';
    end if;

  -- ORGANIZADOR (activo o suspendido) -> ADMIN GENERAL.
  elsif v_dest_admin then
    if not v_rem_org_miembro then
      raise exception 'No tenés permiso para enviar este mensaje';
    end if;

  -- ORGANIZADOR ACTIVO <-> RESPONSABLE.
  else
    if not (
      (v_rem_org_miembro and v_rem_org_habilitado and v_dest_resp)
      or
      (v_dest_org_miembro and v_dest_org_habilitado and v_rem_resp)
    ) then
      raise exception 'No tenés permiso para enviar este mensaje';
    end if;
  end if;

  insert into public.mensajes_internos(
    torneo_id, remitente_id, destinatario_id, asunto, mensaje
  ) values (
    p_torneo,
    v_remitente,
    p_destinatario,
    nullif(trim(p_asunto),''),
    trim(p_mensaje)
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.enviar_mensaje_interno(uuid,uuid,text,text) from public, anon;
grant execute on function public.enviar_mensaje_interno(uuid,uuid,text,text) to authenticated;

-- Se cambia el tipo de retorno para agregar institucion_nombre.
drop function if exists public.mis_destinatarios_mensajeria();

create function public.mis_destinatarios_mensajeria()
returns table(
  destinatario_id uuid,
  destinatario_nombre text,
  destinatario_email text,
  tipo_relacion text,
  torneo_id uuid,
  torneo_nombre text,
  institucion_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_org_habilitado boolean := false;
  v_tiene_org boolean := false;
begin
  if v_uid is null then
    raise exception 'Usuario no autenticado';
  end if;

  select
    coalesce(es_admin_general,false),
    coalesce(puede_crear_torneos,false)
  into v_admin, v_org_habilitado
  from public.perfiles
  where id = v_uid;

  -- ADMIN -> ORGANIZADORES (activos o suspendidos), por torneo.
  -- ADMIN -> RESPONSABLES, por institución y torneo.
  if v_admin then
    return query
    select distinct
      p.id,
      p.nombre,
      p.email,
      'ADMIN_ORGANIZADOR'::text,
      t.id,
      t.nombre,
      null::text
    from public.usuarios_torneos ut
    join public.perfiles p on p.id=ut.usuario_id
    join public.torneos t on t.id=ut.torneo_id
    where ut.rol='ORGANIZADOR'
      and ut.activo=true
      and p.id<>v_uid
      and coalesce(p.es_admin_general,false)=false;

    return query
    select distinct
      p.id,
      p.nombre,
      p.email,
      'ADMIN_RESPONSABLE'::text,
      t.id,
      t.nombre,
      i.nombre
    from public.usuarios_torneos ur
    join public.perfiles p on p.id=ur.usuario_id
    join public.torneos t on t.id=ur.torneo_id
    left join public.instituciones i on i.id=ur.institucion_id
    where ur.rol='RESPONSABLE'
      and ur.activo=true
      and p.id<>v_uid;

    return;
  end if;

  select exists(
    select 1 from public.usuarios_torneos
    where usuario_id=v_uid and rol='ORGANIZADOR' and activo=true
  ) into v_tiene_org;

  -- Todo Organizador asignado, aun suspendido, puede escribir al Admin General.
  if v_tiene_org then
    return query
    select distinct
      a.id,
      a.nombre,
      a.email,
      'ORGANIZADOR_ADMIN'::text,
      t.id,
      t.nombre,
      null::text
    from public.usuarios_torneos uo
    join public.torneos t on t.id=uo.torneo_id
    cross join public.perfiles a
    where uo.usuario_id=v_uid
      and uo.rol='ORGANIZADOR'
      and uo.activo=true
      and a.es_admin_general=true
      and a.id<>v_uid;

    -- Solo un Organizador habilitado ve Responsables como destinatarios.
    if v_org_habilitado then
      return query
      select distinct
        p.id,
        p.nombre,
        p.email,
        'ORGANIZADOR_RESPONSABLE'::text,
        t.id,
        t.nombre,
        i.nombre
      from public.usuarios_torneos uo
      join public.usuarios_torneos ur
        on ur.torneo_id=uo.torneo_id
       and ur.rol='RESPONSABLE'
       and ur.activo=true
      join public.perfiles p on p.id=ur.usuario_id
      join public.torneos t on t.id=uo.torneo_id
      left join public.instituciones i on i.id=ur.institucion_id
      where uo.usuario_id=v_uid
        and uo.rol='ORGANIZADOR'
        and uo.activo=true
        and p.id<>v_uid;
    end if;
  end if;

  -- RESPONSABLE -> ORGANIZADOR, solo si ese Organizador está habilitado.
  return query
  select distinct
    p.id,
    p.nombre,
    p.email,
    'RESPONSABLE_ORGANIZADOR'::text,
    t.id,
    t.nombre,
    i.nombre
  from public.usuarios_torneos ur
  join public.usuarios_torneos uo
    on uo.torneo_id=ur.torneo_id
   and uo.rol='ORGANIZADOR'
   and uo.activo=true
  join public.perfiles p on p.id=uo.usuario_id
  join public.torneos t on t.id=ur.torneo_id
  left join public.instituciones i on i.id=ur.institucion_id
  where ur.usuario_id=v_uid
    and ur.rol='RESPONSABLE'
    and ur.activo=true
    and p.id<>v_uid
    and coalesce(p.es_admin_general,false)=false
    and coalesce(p.puede_crear_torneos,false)=true;
end;
$$;

revoke all on function public.mis_destinatarios_mensajeria() from public, anon;
grant execute on function public.mis_destinatarios_mensajeria() to authenticated;

-- Estado de suspensión visible para las tarjetas del Responsable.
create or replace function public.estado_organizador_torneos_responsable()
returns table(
  torneo_id uuid,
  suspendido boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    ur.torneo_id,
    not bool_or(coalesce(po.es_admin_general,false) or coalesce(po.puede_crear_torneos,false)) as suspendido
  from public.usuarios_torneos ur
  join public.usuarios_torneos uo
    on uo.torneo_id=ur.torneo_id
   and uo.rol='ORGANIZADOR'
   and uo.activo=true
  join public.perfiles po on po.id=uo.usuario_id
  where ur.usuario_id=auth.uid()
    and ur.rol='RESPONSABLE'
    and ur.activo=true
  group by ur.torneo_id;
$$;

revoke all on function public.estado_organizador_torneos_responsable() from public, anon;
grant execute on function public.estado_organizador_torneos_responsable() to authenticated;

commit;
