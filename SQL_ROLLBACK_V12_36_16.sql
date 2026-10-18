-- TORNEWCOM V12.36.16 CANDIDATA - ROLLBACK COMPLETO
-- SOLO revierte el módulo NUEVO de solicitudes bilaterales.
-- No toca solicitudes_cambio_plantel ni ningún jugador/equipo/torneo existente.

begin;

drop function if exists public.resumen_solicitudes_lista_cerrada();
drop function if exists public.listar_solicitudes_lista_cerrada();
drop function if exists public.resolver_solicitud_lista_cerrada(uuid,text);
drop function if exists public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text);
drop table if exists public.solicitudes_lista_cerrada;

commit;

select
  to_regclass('public.solicitudes_lista_cerrada') as tabla,
  to_regprocedure('public.crear_solicitud_lista_cerrada(uuid,uuid,text,text,uuid,text)') as crear,
  to_regprocedure('public.resolver_solicitud_lista_cerrada(uuid,text)') as resolver,
  to_regprocedure('public.listar_solicitudes_lista_cerrada()') as listar,
  to_regprocedure('public.resumen_solicitudes_lista_cerrada()') as resumen;
