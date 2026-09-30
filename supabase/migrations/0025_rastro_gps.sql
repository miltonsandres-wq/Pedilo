-- ============================================================================
-- Rastro GPS del repartidor. Solo puntos MUESTREADOS (cada ~60 s) y los
-- eventos de salida / llegada / entrega; la posición en vivo NO se escribe
-- aquí: viaja por Realtime broadcast.
-- Privacidad: solo se acepta un punto si el pedido está en camino (o ya
-- entregado, para el evento de entrega que llega desde una cola offline).
-- ============================================================================

create table public.repartidor_rastro (
  id              bigint generated always as identity primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  sucursal_id     uuid not null references public.sucursales(id) on delete cascade,
  orden_id        uuid not null references public.ordenes(id) on delete cascade,
  repartidor_id   uuid not null references public.repartidores(id) on delete cascade,
  lat             double precision not null check (lat between -90 and 90),
  lng             double precision not null check (lng between -180 and 180),
  precision_m     real check (precision_m is null or precision_m >= 0),
  velocidad       real check (velocidad is null or velocidad >= 0), -- m/s
  evento          text not null default 'muestra' check (evento in ('muestra', 'salida', 'llegada', 'entrega')),
  registrado_at   timestamptz not null default now()
);

-- Reintentos de una cola offline no duplican puntos
create unique index repartidor_rastro_unico on public.repartidor_rastro(orden_id, registrado_at, evento);
create index repartidor_rastro_sucursal_fecha_idx on public.repartidor_rastro(sucursal_id, registrado_at);

create or replace function public.fn_rastro_antes_insert()
returns trigger
language plpgsql
as $$
declare
  d public.ordenes_delivery;
  v_rep uuid := public.current_repartidor_id();
begin
  select * into d from public.ordenes_delivery where orden_id = new.orden_id;
  if not found then
    raise exception 'RASTRO_ORDEN: el pedido no existe';
  end if;
  new.tenant_id := d.tenant_id;
  new.sucursal_id := d.sucursal_id;
  new.registrado_at := least(new.registrado_at, now());

  if v_rep is not null then
    if d.repartidor_id is distinct from v_rep then
      raise exception 'RASTRO_ORDEN: el pedido no es tuyo';
    end if;
    new.repartidor_id := v_rep;
    if d.estado_delivery not in ('en_camino', 'entregado') then
      raise exception 'RASTRO_PRIVACIDAD: solo se registra la ubicación con el pedido en camino';
    end if;
  elsif new.repartidor_id is distinct from d.repartidor_id then
    raise exception 'RASTRO_ORDEN: el repartidor no corresponde al pedido';
  end if;
  return new;
end;
$$;

create trigger trg_rastro_antes_insert
  before insert on public.repartidor_rastro
  for each row execute function public.fn_rastro_antes_insert();

alter table public.repartidor_rastro enable row level security;

create policy rastro_select on public.repartidor_rastro
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );

create policy rastro_insert_repartidor on public.repartidor_rastro
  for insert to authenticated
  with check (repartidor_id = public.current_repartidor_id());

-- El repartidor acepta compartir su ubicación (queda la fecha)
create or replace function public.repartidor_aceptar_ubicacion()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep uuid := public.current_repartidor_id();
  v_ahora timestamptz := now();
begin
  if v_rep is null then
    raise exception 'REPARTIDOR_SIN_SESION: inicia sesión como repartidor';
  end if;
  update public.repartidores set aceptacion_ubicacion_at = v_ahora where id = v_rep;
  return v_ahora;
end;
$$;

revoke all on function public.repartidor_aceptar_ubicacion() from public, anon;
grant execute on function public.repartidor_aceptar_ubicacion() to authenticated;

-- Retención: borra el rastro más viejo que lo configurado (90 días por
-- omisión) y deja solo el punto de entrega. La llama un cron del servidor.
create or replace function public.purgar_rastro_delivery()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrados int;
begin
  delete from public.repartidor_rastro r
   where r.evento <> 'entrega'
     and r.registrado_at < now() - make_interval(days => coalesce(
           (select c.retencion_rastro_dias from public.delivery_config c where c.sucursal_id = r.sucursal_id), 90));
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

revoke all on function public.purgar_rastro_delivery() from public, anon, authenticated;

-- Comprobantes de transferencia: bucket PRIVADO. Se sube desde el servidor y
-- el personal los ve con URL firmada de corta vida (no hay políticas de storage).
insert into storage.buckets (id, name, public)
values ('comprobantes-transferencia', 'comprobantes-transferencia', false)
on conflict (id) do nothing;
