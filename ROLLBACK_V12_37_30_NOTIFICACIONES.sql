drop function if exists public.payload_email_notificacion(uuid);
-- Rollback SOLO de la infraestructura nueva V12.37.30.
-- Ejecutar únicamente si se decide retirar por completo el módulo antes de usarlo en producción.
drop function if exists public.crear_notificaciones_cambio_partido(uuid,text,text,text,jsonb,uuid[]);
drop table if exists public.notificaciones_sistema;
