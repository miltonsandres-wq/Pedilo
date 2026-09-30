-- ============================================================================
-- Delivery (fase 1): configuración por sucursal y zonas de entrega.
-- El menú público NO lee estas tablas directo: pasa por el servidor (cliente
-- admin), igual que /carta. Por eso no hay políticas para anon.
-- ============================================================================

create table public.delivery_config (
  sucursal_id           uuid primary key references public.sucursales(id) on delete cascade,
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  activo                boolean not null default false,
  pausado               boolean not null default false, -- pausa manual (cocina saturada)
  -- { "lun": [{"desde":"10:00","hasta":"22:00"}], "mar": [...], ... } en hora de Honduras.
  -- Un día sin entrada está cerrado. Si hasta <= desde, el tramo cruza la medianoche.
  horario               jsonb not null default '{}'::jsonb,
  monto_minimo          numeric(10,2) not null default 0 check (monto_minimo >= 0),
  tiempo_estimado_min   int not null default 45 check (tiempo_estimado_min > 0),
  metodos_pago          text[] not null default array['efectivo']
                          check (metodos_pago <@ array['efectivo','tarjeta_contra_entrega','transferencia']::text[]
                                 and cardinality(metodos_pago) > 0),
  cuenta_transferencia  text, -- banco / cuenta / titular que ve el cliente
  slug                  text unique
                          check (slug is null or (
                            slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'
                            and slug <> all (array['admin','pos','cocina','login','registro','auth','api','carta',
                              'repartidor','plataforma','privacidad','terminos','suspendida','configuracion-inicial',
                              'manifest','sw','icons','static'])
                          )),
  mensaje_bienvenida    text,
  tasa_isv_envio        text not null default '15' check (tasa_isv_envio in ('exento','15','18')),
  radio_llegada_m       int not null default 100 check (radio_llegada_m between 20 and 1000),
  velocidad_moto_kmh    numeric(5,1) not null default 25 check (velocidad_moto_kmh > 0),
  retencion_rastro_dias int not null default 90 check (retencion_rastro_dias >= 1),
  updated_at            timestamptz not null default now()
);

create index delivery_config_tenant_idx on public.delivery_config(tenant_id);

create trigger trg_delivery_config_updated_at
  before update on public.delivery_config
  for each row execute function public.fn_set_updated_at();

-- tenant_id siempre sale de la sucursal (no se confía en el cliente)
create or replace function public.fn_delivery_tenant_de_sucursal()
returns trigger
language plpgsql
as $$
begin
  select s.tenant_id into new.tenant_id from public.sucursales s where s.id = new.sucursal_id;
  if new.tenant_id is null then
    raise exception 'DELIVERY_SUCURSAL: la sucursal no existe';
  end if;
  return new;
end;
$$;

create trigger trg_delivery_config_tenant
  before insert or update of sucursal_id on public.delivery_config
  for each row execute function public.fn_delivery_tenant_de_sucursal();

create table public.delivery_zonas (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  sucursal_id       uuid not null references public.sucursales(id) on delete cascade,
  nombre            text not null check (length(trim(nombre)) > 0),
  tarifa            numeric(10,2) not null default 0 check (tarifa >= 0),
  activa            boolean not null default true,
  poligono_geojson  jsonb, -- fase 2: tarifa automática por polígono
  created_at        timestamptz not null default now(),
  unique (sucursal_id, nombre)
);

create index delivery_zonas_sucursal_idx on public.delivery_zonas(sucursal_id);

create trigger trg_delivery_zonas_tenant
  before insert or update of sucursal_id on public.delivery_zonas
  for each row execute function public.fn_delivery_tenant_de_sucursal();

-- ¿Está recibiendo pedidos AHORA? (activo, no pausado y dentro de horario HN)
create or replace function public.delivery_abierto(p_sucursal uuid, p_ahora timestamptz default now())
returns boolean
language plpgsql
stable
as $$
declare
  c record;
  v_local timestamp := p_ahora at time zone 'America/Tegucigalpa';
  v_dias text[] := array['dom','lun','mar','mie','jue','vie','sab'];
  v_t time := (p_ahora at time zone 'America/Tegucigalpa')::time;
  v_tramo jsonb;
  v_desde time;
  v_hasta time;
begin
  select activo, pausado, horario into c from public.delivery_config where sucursal_id = p_sucursal;
  if not found or not c.activo or c.pausado then
    return false;
  end if;

  for v_tramo in
    select * from jsonb_array_elements(coalesce(c.horario -> v_dias[extract(dow from v_local)::int + 1], '[]'::jsonb))
  loop
    v_desde := (v_tramo ->> 'desde')::time;
    v_hasta := (v_tramo ->> 'hasta')::time;
    if v_hasta > v_desde then
      if v_t >= v_desde and v_t < v_hasta then return true; end if;
    elsif v_t >= v_desde then
      return true; -- tramo que cruza la medianoche, parte de hoy
    end if;
  end loop;

  -- la parte de madrugada de un tramo de AYER que cruzaba la medianoche
  for v_tramo in
    select * from jsonb_array_elements(coalesce(c.horario -> v_dias[((extract(dow from v_local)::int + 6) % 7) + 1], '[]'::jsonb))
  loop
    v_desde := (v_tramo ->> 'desde')::time;
    v_hasta := (v_tramo ->> 'hasta')::time;
    if v_hasta <= v_desde and v_t < v_hasta then return true; end if;
  end loop;
  return false;
end;
$$;

-- Pausar / reanudar: lo puede hacer el admin o el personal operativo de ESA sucursal
create or replace function public.delivery_pausar(p_sucursal uuid, p_pausado boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_tenant_id() is null
     or not exists (select 1 from public.sucursales s
                     where s.id = p_sucursal and s.tenant_id = public.current_tenant_id())
     or not (public.is_admin() or p_sucursal = public.current_sucursal_id())
     or public.fn_es_cocina() then
    raise exception 'DELIVERY_SIN_PERMISO: no puedes pausar el delivery de esta sucursal';
  end if;
  update public.delivery_config set pausado = p_pausado where sucursal_id = p_sucursal;
end;
$$;

revoke all on function public.delivery_pausar(uuid, boolean) from public, anon;
grant execute on function public.delivery_pausar(uuid, boolean) to authenticated;

-- RLS
alter table public.delivery_config enable row level security;
alter table public.delivery_zonas enable row level security;

create policy delivery_config_select on public.delivery_config
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );
create policy delivery_config_admin_insert on public.delivery_config
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy delivery_config_admin_update on public.delivery_config
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy delivery_zonas_select on public.delivery_zonas
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );
create policy delivery_zonas_admin_insert on public.delivery_zonas
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy delivery_zonas_admin_update on public.delivery_zonas
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy delivery_zonas_admin_delete on public.delivery_zonas
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());
