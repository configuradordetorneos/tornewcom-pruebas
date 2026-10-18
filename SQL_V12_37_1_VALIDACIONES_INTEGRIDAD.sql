-- TORNEWCOM V12.37.1 - Validaciones de integridad
-- Ejecutar en el SQL Editor del proyecto de PRUEBA antes de pasar a producción.
-- No modifica datos existentes. Los triggers se aplican a INSERT y a cambios de los campos validados.

create or replace function public.tornewcom_validar_identidad_jugador()
returns trigger
language plpgsql
as $$
begin
  if new.dni is null or btrim(new.dni::text) = '' or new.dni::text !~ '^[0-9]+$' then
    raise exception 'DNI_INVALIDO: el DNI debe contener solo números';
  end if;

  if new.fecha_nacimiento is null then
    raise exception 'FECHA_NACIMIENTO_INVALIDA: la fecha de nacimiento es obligatoria';
  end if;

  if new.fecha_nacimiento > current_date then
    raise exception 'FECHA_NACIMIENTO_INVALIDA: la fecha de nacimiento no puede ser futura';
  end if;

  if new.fecha_nacimiento < (current_date - interval '100 years')::date then
    raise exception 'FECHA_NACIMIENTO_INVALIDA: la edad máxima permitida es 100 años';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tornewcom_validar_identidad_jugadores_maestros on public.jugadores_maestros;
create trigger trg_tornewcom_validar_identidad_jugadores_maestros
before insert or update of dni, fecha_nacimiento on public.jugadores_maestros
for each row execute function public.tornewcom_validar_identidad_jugador();

-- La tabla histórica jugadores sigue existiendo en el sistema.
-- Protegemos también nuevas altas/cambios directos sobre ella.
drop trigger if exists trg_tornewcom_validar_identidad_jugadores on public.jugadores;
create trigger trg_tornewcom_validar_identidad_jugadores
before insert or update of dni, fecha_nacimiento on public.jugadores
for each row execute function public.tornewcom_validar_identidad_jugador();

create or replace function public.tornewcom_validar_fecha_jornada()
returns trigger
language plpgsql
as $$
begin
  if new.fecha is not null and (new.fecha < date '2000-01-01' or new.fecha > date '2100-12-31') then
    raise exception 'FECHA_JORNADA_INVALIDA: la fecha debe estar entre 01/01/2000 y 31/12/2100';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tornewcom_validar_fecha_jornada on public.jornadas;
create trigger trg_tornewcom_validar_fecha_jornada
before insert or update of fecha on public.jornadas
for each row execute function public.tornewcom_validar_fecha_jornada();
