-- TORNEWCOM V12.36.16 CANDIDATA - PRECHECK SOLO LECTURA
-- Ejecutar SOLO en tornewcom-test antes de aplicar la migración.

select current_database() as base_actual;

select
  to_regprocedure('public.plantel_categoria_abierto(uuid)') is not null as cierre_ok,
  to_regprocedure('public.es_admin_actual()') is not null as admin_ok,
  to_regprocedure('public.es_organizador_de(uuid)') is not null as organizador_ok,
  to_regprocedure('public.es_responsable_de_institucion(uuid)') is not null as responsable_ok;

select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('torneos','instituciones','equipos_competitivos','jugadores','jugador_equipos','perfiles')
  and column_name in (
    'id','nombre','torneo_id','institucion_id','categoria_torneo_id','categoria','modalidad',
    'responsable_usuario_id','nombre_apellido','dni','jugador_id','equipo_competitivo_id'
  )
order by table_name, ordinal_position;

select to_regclass('public.solicitudes_lista_cerrada') as tabla_candidata_existente;
