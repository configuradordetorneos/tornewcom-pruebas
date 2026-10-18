-- TORNEWCOM V12.36.19 CANDIDATA
-- AJUSTE PARA UNIFICAR ALTAS/BAJAS/REASIGNACIONES EN LISTAS CERRADAS.
-- SOLO tornewcom-test hasta terminar la batería de pruebas.
-- Migración aditiva: NO borra solicitudes ni jugadores existentes.

begin;


-- Refuerzo de vínculo del Responsable.
-- Además del ID/membresía, acepta el email exacto cargado por el Organizador,
-- que es la regla de acceso definida para el Responsable en TorNewcom.
create or replace function public.es_responsable_de_institucion(p_institucion uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(exists(
    select 1
    from public.instituciones i
    left join public.perfiles p on p.id=auth.uid()
    where i.id=p_institucion
      and auth.uid() is not null
      and (
        i.responsable_usuario_id=auth.uid()
        or exists (
          select 1
          from public.usuarios_torneos ut
          where ut.usuario_id=auth.uid()
            and ut.torneo_id=i.torneo_id
            and ut.rol='RESPONSABLE'
            and ut.institucion_id=i.id
            and ut.activo=true
        )
        or (
          nullif(trim(coalesce(p.email,'')),'') is not null
          and nullif(trim(coalesce(i.responsable_email,'')),'') is not null
          and lower(trim(p.email))=lower(trim(i.responsable_email))
        )
      )
  ),false);
$$;

revoke all on function public.es_responsable_de_institucion(uuid) from public, anon;
grant execute on function public.es_responsable_de_institucion(uuid) to authenticated;

alter table public.solicitudes_lista_cerrada
  add column if not exists jugador_maestro_id uuid
  references public.jugadores_maestros(id) on delete set null;

-- La solicitud pendiente debe ser única tanto si apunta a un jugador ya creado
-- dentro del torneo como si la ALTA nace desde "Mis jugadores".
drop index if exists public.solicitudes_lista_pendiente_unica_idx;
create unique index if not exists solicitudes_lista_pendiente_unica_idx
  on public.solicitudes_lista_cerrada(
    equipo_origen_id,
    coalesce(jugador_id,jugador_maestro_id,'00000000-0000-0000-0000-000000000000'::uuid),
    accion,
    coalesce(equipo_destino_id,'00000000-0000-0000-0000-000000000000'::uuid)
  )
  where estado='PENDIENTE';

-- Nueva sobrecarga: mantiene la función anterior por compatibilidad y agrega
-- jugador_maestro_id para las ALTA iniciadas desde "Mis jugadores".
create or replace function public.crear_solicitud_lista_cerrada(
  p_equipo_origen_id uuid,
  p_jugador_id uuid,
  p_accion text,
  p_motivo text,
  p_equipo_destino_id uuid default null,
  p_solicitante_rol text default null,
  p_jugador_maestro_id uuid default null
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
  v_resp_id uuid;
  v_dest_torneo uuid;
  v_dest_inst uuid;
  v_dest_nombre text;
  v_j_torneo uuid;
  v_j_inst uuid;
  v_j_nombre text;
  v_j_dni text;
  v_jugador_id uuid := p_jugador_id;
  v_jm_id uuid := p_jugador_maestro_id;
  v_jm_resp uuid;
  v_existente uuid;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'No hay una sesión autenticada.'; end if;
  if v_accion not in ('ALTA','BAJA','MODIFICACION') then raise exception 'Acción inválida.'; end if;
  if v_motivo='' then raise exception 'El motivo es obligatorio.'; end if;
  if coalesce(array_length(regexp_split_to_array(v_motivo,E'\\s+'),1),0)>300 then
    raise exception 'El motivo no puede superar 300 palabras.';
  end if;

  select e.torneo_id,e.institucion_id,e.categoria_torneo_id,e.nombre,i.responsable_usuario_id
    into v_torneo,v_inst,v_cat,v_eq_nombre,v_resp_id
  from public.equipos_competitivos e
  join public.instituciones i on i.id=e.institucion_id
  where e.id=p_equipo_origen_id;
  if v_torneo is null then raise exception 'No se encontró el equipo.'; end if;

  if coalesce(public.plantel_categoria_abierto(v_cat),true) then
    raise exception 'La lista de este equipo todavía está abierta. No necesita una solicitud excepcional.';
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
    if v_resp_id is null then
      raise exception 'La institución no tiene un Responsable registrado que pueda resolver el cambio.';
    end if;
    v_aprobador:='RESPONSABLE';
  else
    raise exception 'Debe indicarse si la solicitud la inicia el Responsable o el Organizador.';
  end if;

  if v_accion='ALTA' then
    if v_jugador_id is null and v_jm_id is null then
      raise exception 'Elegí un jugador de Mis jugadores.';
    end if;

    if v_jugador_id is not null then
      select j.torneo_id,j.institucion_id,j.nombre_apellido,j.dni,j.jugador_maestro_id
        into v_j_torneo,v_j_inst,v_j_nombre,v_j_dni,v_jm_id
      from public.jugadores j
      where j.id=v_jugador_id;
      if v_j_torneo is null then raise exception 'No se encontró el jugador.'; end if;
      if v_j_torneo<>v_torneo or v_j_inst<>v_inst then
        raise exception 'El jugador no pertenece a la misma institución y torneo del equipo.';
      end if;
    else
      select jm.responsable_usuario_id,jm.nombre_apellido,jm.dni
        into v_jm_resp,v_j_nombre,v_j_dni
      from public.jugadores_maestros jm
      where jm.id=v_jm_id and jm.activo=true;
      if v_jm_resp is null then raise exception 'No se encontró el jugador en Mis jugadores.'; end if;
      if v_rol='RESPONSABLE' then
        if v_jm_resp<>auth.uid() then
          raise exception 'Ese jugador no pertenece a tu bolsa Mis jugadores.';
        end if;
      else
        if v_resp_id is null or v_jm_resp<>v_resp_id then
          raise exception 'Ese jugador de Mis jugadores no pertenece al Responsable de esta institución.';
        end if;
      end if;

      select j.id,j.institucion_id
        into v_existente,v_j_inst
      from public.jugadores j
      where j.torneo_id=v_torneo and j.dni=v_j_dni
      limit 1;
      if v_existente is not null then
        if v_j_inst<>v_inst then
          raise exception 'DNI BLOQUEADO: el jugador ya pertenece a otra institución dentro de este torneo.';
        end if;
        v_jugador_id:=v_existente;
      end if;
    end if;

    if v_jugador_id is not null and exists (
      select 1 from public.jugador_equipos je
      where je.jugador_id=v_jugador_id and je.equipo_competitivo_id=p_equipo_origen_id
    ) then raise exception 'El jugador ya está declarado en este equipo.'; end if;

    if v_jugador_id is not null and exists (
      select 1
      from public.jugador_equipos je
      join public.equipos_competitivos ex on ex.id=je.equipo_competitivo_id
      where je.jugador_id=v_jugador_id
        and ex.torneo_id=v_torneo
    ) then
      raise exception 'El jugador ya integra otro equipo de este torneo. Para cambiarlo usá REASIGNACIÓN.';
    end if;

    if p_equipo_destino_id is not null then raise exception 'ALTA no utiliza equipo de destino.'; end if;

  else
    if v_jugador_id is null then raise exception 'Elegí un jugador de la lista del torneo.'; end if;
    select j.torneo_id,j.institucion_id,j.nombre_apellido,j.dni,j.jugador_maestro_id
      into v_j_torneo,v_j_inst,v_j_nombre,v_j_dni,v_jm_id
    from public.jugadores j
    where j.id=v_jugador_id;
    if v_j_torneo is null then raise exception 'No se encontró el jugador.'; end if;
    if v_j_torneo<>v_torneo or v_j_inst<>v_inst then
      raise exception 'El jugador no pertenece a la misma institución y torneo del equipo.';
    end if;

    if v_accion='BAJA' then
      if not exists (
        select 1 from public.jugador_equipos je
        where je.jugador_id=v_jugador_id and je.equipo_competitivo_id=p_equipo_origen_id
      ) then raise exception 'El jugador no está declarado en este equipo.'; end if;
      if p_equipo_destino_id is not null then raise exception 'BAJA no utiliza equipo de destino.'; end if;
    else
      if not exists (
        select 1 from public.jugador_equipos je
        where je.jugador_id=v_jugador_id and je.equipo_competitivo_id=p_equipo_origen_id
      ) then raise exception 'El jugador no está declarado en el equipo de origen.'; end if;
      if p_equipo_destino_id is null then raise exception 'La REASIGNACIÓN requiere equipo de destino.'; end if;
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
        where je.jugador_id=v_jugador_id and je.equipo_competitivo_id=p_equipo_destino_id
      ) then raise exception 'El jugador ya está declarado en el equipo de destino.'; end if;
    end if;
  end if;

  insert into public.solicitudes_lista_cerrada(
    torneo_id,institucion_id,equipo_origen_id,equipo_destino_id,jugador_id,jugador_maestro_id,
    accion,motivo,solicitante_id,solicitante_rol,aprobador_rol,
    jugador_nombre_snapshot,jugador_dni_snapshot,equipo_origen_snapshot,equipo_destino_snapshot
  ) values (
    v_torneo,v_inst,p_equipo_origen_id,p_equipo_destino_id,v_jugador_id,v_jm_id,
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
  v_jugador_id uuid;
  v_j_torneo uuid;
  v_j_inst uuid;
  v_dst_torneo uuid;
  v_dst_inst uuid;
  v_resp_id uuid;
  jm record;
begin
  if auth.uid() is null then raise exception 'No hay una sesión autenticada.'; end if;
  if v_decision not in ('AUTORIZAR','RECHAZAR') then raise exception 'Decisión inválida.'; end if;

  select * into s
  from public.solicitudes_lista_cerrada
  where id=p_solicitud
  for update;

  if s.id is null then raise exception 'Solicitud inexistente.'; end if;
  if s.estado<>'PENDIENTE' then raise exception 'La solicitud ya fue resuelta.'; end if;
  if s.solicitante_id=auth.uid() then raise exception 'La misma persona que solicita no puede resolver su propio cambio.'; end if;

  if s.aprobador_rol='ORGANIZADOR' then
    if not (public.es_admin_actual() or public.es_organizador_de(s.torneo_id)) then
      raise exception 'Esta solicitud debe resolverla el Organizador del torneo.';
    end if;
  elsif s.aprobador_rol='RESPONSABLE' then
    if not public.es_responsable_de_institucion(s.institucion_id) then
      raise exception 'Esta solicitud debe resolverla el Responsable de la institución.';
    end if;
  else
    raise exception 'La solicitud no tiene un rol resolutor válido.';
  end if;

  if v_decision='RECHAZAR' then
    update public.solicitudes_lista_cerrada
       set estado='RECHAZADA',resuelto_por=auth.uid(),resuelto_en=now()
     where id=s.id;
    return 'Solicitud rechazada. La lista no fue modificada.';
  end if;

  v_jugador_id:=s.jugador_id;

  if s.accion='ALTA' and v_jugador_id is null then
    if s.jugador_maestro_id is null then
      raise exception 'La solicitud no conserva el jugador de Mis jugadores.';
    end if;

    select responsable_usuario_id into v_resp_id
    from public.instituciones where id=s.institucion_id;

    select id,nombre_apellido,dni,fecha_nacimiento,posicion,responsable_usuario_id
      into jm
    from public.jugadores_maestros
    where id=s.jugador_maestro_id and activo=true;

    if jm.id is null then raise exception 'El jugador ya no está disponible en Mis jugadores.'; end if;
    if s.solicitante_rol='RESPONSABLE' then
      if jm.responsable_usuario_id<>s.solicitante_id then
        raise exception 'El jugador ya no pertenece a la bolsa Mis jugadores del Responsable que hizo la solicitud.';
      end if;
    else
      if v_resp_id is null or jm.responsable_usuario_id<>v_resp_id then
        raise exception 'El jugador ya no corresponde al Responsable de esta institución.';
      end if;
    end if;

    select j.id,j.institucion_id into v_jugador_id,v_j_inst
    from public.jugadores j
    where j.torneo_id=s.torneo_id and j.dni=jm.dni
    limit 1;

    if v_jugador_id is not null and v_j_inst<>s.institucion_id then
      raise exception 'DNI BLOQUEADO: el jugador ya pertenece a otra institución dentro de este torneo.';
    end if;

    if v_jugador_id is null then
      insert into public.jugadores(
        torneo_id,institucion_id,nombre_apellido,dni,fecha_nacimiento,posicion,foto_url,jugador_maestro_id
      ) values (
        s.torneo_id,s.institucion_id,jm.nombre_apellido,jm.dni,jm.fecha_nacimiento,jm.posicion,null,jm.id
      ) returning id into v_jugador_id;
    else
      update public.jugadores
         set jugador_maestro_id=coalesce(jugador_maestro_id,jm.id)
       where id=v_jugador_id;
    end if;

    update public.solicitudes_lista_cerrada
       set jugador_id=v_jugador_id
     where id=s.id;
  end if;

  if v_jugador_id is null then
    raise exception 'La solicitud perdió la referencia del jugador.';
  end if;

  select torneo_id,institucion_id into v_j_torneo,v_j_inst
  from public.jugadores where id=v_jugador_id;
  if v_j_torneo is null or v_j_torneo<>s.torneo_id or v_j_inst<>s.institucion_id then
    raise exception 'El jugador ya no pertenece al contexto original de la solicitud.';
  end if;

  if s.accion='ALTA' then
    if exists (
      select 1 from public.jugador_equipos
      where jugador_id=v_jugador_id and equipo_competitivo_id=s.equipo_origen_id
    ) then raise exception 'El jugador ya está declarado en ese equipo.'; end if;
    if exists (
      select 1
      from public.jugador_equipos je
      join public.equipos_competitivos ex on ex.id=je.equipo_competitivo_id
      where je.jugador_id=v_jugador_id
        and ex.torneo_id=s.torneo_id
    ) then
      raise exception 'El jugador ya integra otro equipo de este torneo. La ALTA ya no puede aplicarse; corresponde una REASIGNACIÓN.';
    end if;
    insert into public.jugador_equipos(jugador_id,equipo_competitivo_id)
    values(v_jugador_id,s.equipo_origen_id);

  elsif s.accion='BAJA' then
    delete from public.jugador_equipos
    where jugador_id=v_jugador_id and equipo_competitivo_id=s.equipo_origen_id;
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
      where jugador_id=v_jugador_id and equipo_competitivo_id=s.equipo_origen_id
    ) then raise exception 'La asignación de origen ya no existe.'; end if;
    if exists (
      select 1 from public.jugador_equipos
      where jugador_id=v_jugador_id and equipo_competitivo_id=s.equipo_destino_id
    ) then raise exception 'El jugador ya está declarado en el equipo de destino.'; end if;
    insert into public.jugador_equipos(jugador_id,equipo_competitivo_id)
    values(v_jugador_id,s.equipo_destino_id);
    delete from public.jugador_equipos
    where jugador_id=v_jugador_id and equipo_competitivo_id=s.equipo_origen_id;
  else
    raise exception 'Acción inválida en la solicitud.';
  end if;

  update public.solicitudes_lista_cerrada
     set estado='APLICADA',resuelto_por=auth.uid(),resuelto_en=now()
   where id=s.id;

  return 'Solicitud resuelta y cambio aplicado correctamente.';
end;
$$;

revoke all on function public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text,uuid) from public, anon;
grant execute on function public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text,uuid) to authenticated;


-- El Organizador puede consultar la bolsa del Responsable únicamente cuando
-- esa persona está vinculada a una institución de un torneo que organiza.
drop policy if exists "mis jugadores ver organizador vinculado" on public.jugadores_maestros;
create policy "mis jugadores ver organizador vinculado"
on public.jugadores_maestros
for select
to authenticated
using (
  exists (
    select 1
    from public.instituciones i
    where i.responsable_usuario_id = jugadores_maestros.responsable_usuario_id
      and public.es_organizador_de(i.torneo_id)
  )
);

commit;

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='solicitudes_lista_cerrada' and column_name='jugador_maestro_id'
  ) as jugador_maestro_habilitado,
  to_regprocedure('public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text,uuid)') as crear_unificada,
  to_regprocedure('public.resolver_solicitud_lista_cerrada(uuid,text)') as resolver_unificada;
