-- ============================================================================
-- Número de orden del día, por sucursal (arranca en 1 cada día). Se asigna
-- en el servidor (nunca en el cliente) para que dos dispositivos offline no
-- puedan repetir número al sincronizar — un contador con upsert atómico es
-- seguro ante inserciones concurrentes; un SELECT max()+1 no lo sería.
-- ============================================================================

alter table public.ordenes add column if not exists numero_dia integer;

create table public.contadores_orden_diario (
  sucursal_id    uuid not null references public.sucursales(id) on delete cascade,
  fecha          date not null,
  ultimo_numero  integer not null default 0,
  primary key (sucursal_id, fecha)
);

-- Sin políticas de RLS: la tabla solo la toca esta función (security definer),
-- nunca se lee/escribe directo desde el cliente.
alter table public.contadores_orden_diario enable row level security;

create or replace function public.asignar_numero_orden_dia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  siguiente integer;
begin
  insert into public.contadores_orden_diario (sucursal_id, fecha, ultimo_numero)
  values (new.sucursal_id, current_date, 1)
  on conflict (sucursal_id, fecha)
  do update set ultimo_numero = contadores_orden_diario.ultimo_numero + 1
  returning ultimo_numero into siguiente;

  new.numero_dia := siguiente;
  return new;
end;
$$;

create trigger ordenes_asignar_numero_dia
  before insert on public.ordenes
  for each row
  when (new.numero_dia is null)
  execute function public.asignar_numero_orden_dia();
