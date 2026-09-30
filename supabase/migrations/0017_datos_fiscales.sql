-- ============================================================================
-- Facturación fiscal (SAR Honduras, Acuerdo 481-2017): base de datos fiscales
-- ============================================================================
-- Esta migración deja listo lo que NO cambia por documento:
--   * flag por tenant para activar la facturación fiscal
--   * datos del emisor (por tenant, con override opcional por sucursal)
--   * dispositivos POS (cada caja se amarra a UN punto de emisión)
--   * tasa de ISV por producto (y su snapshot en orden_items)
-- Los rangos CAI y los documentos fiscales viven en 0018.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Flag por tenant. Apagado por defecto: activarlo pasa el cobro a modo
-- ESTRICTO (sin CAI vigente no se puede cobrar), así que un tenant que aún no
-- ha tramitado su CAI no se rompe por desplegar esto.
-- ----------------------------------------------------------------------------
alter table public.tenants
  add column if not exists facturacion_fiscal_activa boolean not null default false;

-- ----------------------------------------------------------------------------
-- datos_fiscales_emisor: sucursal_id null = datos del tenant (default);
-- con sucursal_id = override solo para esa sucursal.
-- ----------------------------------------------------------------------------
create table public.datos_fiscales_emisor (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  sucursal_id       uuid references public.sucursales(id) on delete cascade,
  razon_social      text,
  nombre_comercial  text,
  rtn               text check (rtn is null or rtn ~ '^[0-9]{14}$'),
  direccion_fiscal  text,
  telefono          text,
  correo            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index datos_fiscales_emisor_uniq
  on public.datos_fiscales_emisor (tenant_id, coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger trg_datos_fiscales_emisor_updated_at
  before update on public.datos_fiscales_emisor
  for each row execute function public.fn_set_updated_at();

-- El emisor de cada tenant existente arranca con lo que ya tenía en tenants
-- (nombre, rtn, dirección, teléfono); el RTN solo pasa si tiene 14 dígitos.
insert into public.datos_fiscales_emisor
  (tenant_id, razon_social, nombre_comercial, rtn, direccion_fiscal, telefono)
select
  t.id,
  t.nombre,
  t.nombre,
  case when regexp_replace(coalesce(t.rtn, ''), '\D', '', 'g') ~ '^[0-9]{14}$'
       then regexp_replace(t.rtn, '\D', '', 'g') end,
  t.direccion,
  t.telefono
from public.tenants t
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- dispositivos_pos: cada caja/tablet registrada se vincula a UN punto de
-- emisión; dos dispositivos NUNCA comparten punto dentro de un tenant.
-- vinculo_hash es el sha256 del token que guarda el navegador al vincularse:
-- así el token no se puede leer desde la API y un segundo navegador no puede
-- "robar" el punto sin que el admin lo libere primero.
-- ----------------------------------------------------------------------------
create table public.dispositivos_pos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  sucursal_id      uuid not null references public.sucursales(id) on delete cascade,
  nombre           text not null,
  establecimiento  char(3) not null check (establecimiento ~ '^[0-9]{3}$'),
  punto_emision    char(3) not null check (punto_emision ~ '^[0-9]{3}$'),
  activo           boolean not null default true,
  vinculo_hash     text,
  vinculado_at     timestamptz,
  created_at       timestamptz not null default now(),
  unique (tenant_id, establecimiento, punto_emision)
);

create index dispositivos_pos_sucursal_id_idx on public.dispositivos_pos(sucursal_id);

-- Vincula ESTE navegador a un dispositivo libre (o re-vincula el mismo si
-- presenta el mismo token). Si ya está vinculado con otro token, falla: el
-- admin tiene que liberarlo desde /admin/fiscal/dispositivos.
create or replace function public.vincular_dispositivo(p_id uuid, p_token uuid)
returns public.dispositivos_pos
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dispositivos_pos;
  v_hash text := encode(sha256(convert_to(p_token::text, 'utf8')), 'hex');
begin
  select * into d from public.dispositivos_pos where id = p_id;

  if not found
     or d.tenant_id <> public.current_tenant_id()
     or not d.activo
     or not (public.is_admin() or d.sucursal_id = public.current_sucursal_id())
  then
    raise exception 'DISPOSITIVO_NO_DISPONIBLE';
  end if;

  if d.vinculo_hash is not null and d.vinculo_hash <> v_hash then
    raise exception 'DISPOSITIVO_YA_VINCULADO';
  end if;

  update public.dispositivos_pos
     set vinculo_hash = v_hash,
         vinculado_at = coalesce(vinculado_at, now())
   where id = p_id
   returning * into d;

  return d;
end;
$$;

revoke all on function public.vincular_dispositivo(uuid, uuid) from public;
grant execute on function public.vincular_dispositivo(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- ISV por producto. Convención del proyecto: CHECK en vez de ENUM.
-- Bebidas alcohólicas y tabaco = '18' (lo asigna el admin en el menú).
-- ----------------------------------------------------------------------------
alter table public.productos
  add column if not exists tasa_isv text not null default '15'
    check (tasa_isv in ('exento', '15', '18'));

-- orden_items captura la tasa al agregar el ítem (igual que el precio): si el
-- admin cambia la tasa del producto después, las órdenes viejas no se mueven.
alter table public.orden_items
  add column if not exists tasa_isv text not null default '15'
    check (tasa_isv in ('exento', '15', '18'));

-- La tasa del ítem la fija el SERVIDOR al insertar, copiándola del producto
-- (igual que se captura el precio). Así también quedan bien los ítems que
-- entran por la carta QR, que no la mandan.
create or replace function public.fn_orden_items_tasa_isv()
returns trigger
language plpgsql
as $$
begin
  select p.tasa_isv into new.tasa_isv
    from public.productos p
   where p.id = new.producto_id;
  return new;
end;
$$;

create trigger trg_orden_items_tasa_isv
  before insert on public.orden_items
  for each row execute function public.fn_orden_items_tasa_isv();

-- ----------------------------------------------------------------------------
-- RLS
--   emisor / dispositivos: todos los usuarios del tenant leen (el cajero los
--   necesita para imprimir y para vincular su caja); solo el admin escribe.
-- ----------------------------------------------------------------------------
alter table public.datos_fiscales_emisor enable row level security;
alter table public.dispositivos_pos enable row level security;

create policy datos_fiscales_emisor_select on public.datos_fiscales_emisor
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy datos_fiscales_emisor_write on public.datos_fiscales_emisor
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy dispositivos_pos_select on public.dispositivos_pos
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy dispositivos_pos_write on public.dispositivos_pos
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
    and exists (
      select 1 from public.sucursales s
       where s.id = dispositivos_pos.sucursal_id
         and s.tenant_id = public.current_tenant_id()
    )
  );
