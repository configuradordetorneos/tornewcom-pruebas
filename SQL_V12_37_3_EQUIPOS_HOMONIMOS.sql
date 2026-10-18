-- TORNEWCOM V12.37.3 — Identidad de equipos en partidos
-- Ejecutar en tornewcom-test antes de probar esta versión.

alter table public.partidos
  add column if not exists equipo_a_id uuid references public.equipos_competitivos(id) on delete set null,
  add column if not exists equipo_b_id uuid references public.equipos_competitivos(id) on delete set null;

create index if not exists partidos_equipo_a_id_idx on public.partidos(equipo_a_id);
create index if not exists partidos_equipo_b_id_idx on public.partidos(equipo_b_id);

-- Backfill seguro: solo completa IDs cuando nombre+torneo+categoría+modalidad identifica un único equipo.
update public.partidos p
set equipo_a_id = (
  select e.id from public.equipos_competitivos e
  where e.torneo_id=p.torneo_id and e.nombre=p.equipo_a
    and e.categoria=p.categoria and e.modalidad=p.modalidad
  limit 1
)
where p.equipo_a_id is null
  and 1=(select count(*) from public.equipos_competitivos e
         where e.torneo_id=p.torneo_id and e.nombre=p.equipo_a
           and e.categoria=p.categoria and e.modalidad=p.modalidad);

update public.partidos p
set equipo_b_id = (
  select e.id from public.equipos_competitivos e
  where e.torneo_id=p.torneo_id and e.nombre=p.equipo_b
    and e.categoria=p.categoria and e.modalidad=p.modalidad
  limit 1
)
where p.equipo_b_id is null
  and 1=(select count(*) from public.equipos_competitivos e
         where e.torneo_id=p.torneo_id and e.nombre=p.equipo_b
           and e.categoria=p.categoria and e.modalidad=p.modalidad);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='partidos_equipos_ids_distintos') then
    alter table public.partidos add constraint partidos_equipos_ids_distintos
      check (equipo_a_id is null or equipo_b_id is null or equipo_a_id <> equipo_b_id);
  end if;
end $$;
