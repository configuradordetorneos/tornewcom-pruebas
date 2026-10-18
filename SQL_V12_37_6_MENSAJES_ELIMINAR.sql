-- TorNewcom V12.37.6 — eliminación definitiva de mensajes internos
-- Ejecutar en tornewcom-test > SQL Editor.
-- No modifica solicitudes ni ningún otro historial.

create or replace function public.eliminar_mensaje_interno(p_mensaje uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tabla regclass;
  v_cantidad integer := 0;
begin
  if v_uid is null then
    raise exception 'Sesión no autenticada.';
  end if;

  -- Compatibilidad: usa el nombre real disponible en la base.
  v_tabla := to_regclass('public.mensajes_internos');
  if v_tabla is null then
    v_tabla := to_regclass('public.mensajes');
  end if;
  if v_tabla is null then
    raise exception 'No se encontró la tabla de mensajes internos.';
  end if;

  execute format(
    'delete from %s where id = $1 and (remitente_id = $2 or destinatario_id = $2)',
    v_tabla
  ) using p_mensaje, v_uid;

  get diagnostics v_cantidad = row_count;
  return v_cantidad > 0;
end;
$$;

revoke all on function public.eliminar_mensaje_interno(uuid) from public;
grant execute on function public.eliminar_mensaje_interno(uuid) to authenticated;
