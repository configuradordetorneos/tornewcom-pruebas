-- TORNEWCOM V12.37.2 - Protección adicional de DNI
-- Ejecutar DESPUÉS de SQL_V12_37_1_VALIDACIONES_INTEGRIDAD.sql
-- Proyecto de prueba: tornewcom-test
-- No modifica datos existentes. Solo endurece futuras altas/cambios.

create or replace function public.tornewcom_validar_identidad_jugador()
returns trigger
language plpgsql
as $$
begin
  if new.dni is null or btrim(new.dni::text) = '' or new.dni::text !~ '^[0-9]+$' then
    raise exception 'DNI_INVALIDO: el DNI debe contener solo números';
  end if;

  if char_length(new.dni::text) not between 7 and 8 then
    raise exception 'DNI_INVALIDO: el DNI debe tener 7 u 8 dígitos';
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
