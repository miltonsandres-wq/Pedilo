-- ============================================================================
-- Inventario: control de existencias del negocio (botellas, alimentos,
-- insumos, etc.), separado del menú (categorias/productos son el catálogo
-- que ve el cliente; esto es control interno, solo lo administra el admin).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- inventario_categorias: agrupa los artículos (ej. "Bebidas alcohólicas",
-- "Abarrotes", "Limpieza")
-- ----------------------------------------------------------------------------
create table public.inventario_categorias (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nombre      text not null,
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, nombre)
);

create index inventario_categorias_tenant_id_idx on public.inventario_categorias(tenant_id);

-- ----------------------------------------------------------------------------
-- inventario_items: el artículo en sí (a nivel tenant; la cantidad existente
-- vive por sucursal en inventario_stock, ver abajo)
-- ----------------------------------------------------------------------------
create table public.inventario_items (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  categoria_id    uuid references public.inventario_categorias(id) on delete set null,
  nombre          text not null,
  unidad          text not null default 'unidad', -- botella, kg, lb, litro, caja, unidad...
  stock_minimo    numeric(10,2) not null default 0 check (stock_minimo >= 0),
  costo_unitario  numeric(10,2) check (costo_unitario >= 0),
  proveedor       text,
  activo          boolean not null default true, -- soft delete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index inventario_items_tenant_id_idx on public.inventario_items(tenant_id);
create index inventario_items_categoria_id_idx on public.inventario_items(categoria_id);

create trigger trg_inventario_items_updated_at
  before update on public.inventario_items
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- inventario_stock: cantidad existente de cada artículo, por sucursal
-- ----------------------------------------------------------------------------
create table public.inventario_stock (
  item_id     uuid not null references public.inventario_items(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  cantidad    numeric(10,2) not null default 0 check (cantidad >= 0),
  updated_at  timestamptz not null default now(),
  primary key (item_id, sucursal_id)
);

create index inventario_stock_sucursal_id_idx on public.inventario_stock(sucursal_id);

create trigger trg_inventario_stock_updated_at
  before update on public.inventario_stock
  for each row execute function public.fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: inventario es control interno, solo el admin del tenant lo ve/edita
-- (a diferencia del menú, que también leen cajero/mesero).
-- ----------------------------------------------------------------------------
alter table public.inventario_categorias enable row level security;
alter table public.inventario_items enable row level security;
alter table public.inventario_stock enable row level security;

create policy inventario_categorias_all on public.inventario_categorias
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy inventario_items_all on public.inventario_items
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy inventario_stock_all on public.inventario_stock
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.inventario_items i
       where i.id = inventario_stock.item_id
         and i.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.inventario_items i
       where i.id = inventario_stock.item_id
         and i.tenant_id = public.current_tenant_id()
    )
  );
