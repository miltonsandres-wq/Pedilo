-- ============================================================================
-- POS Restaurante — Esquema inicial (multi-tenant / multi-sucursal)
-- ============================================================================
-- Convenciones:
--   * Toda tabla de negocio lleva tenant_id (aislamiento por cliente/SaaS).
--   * Las tablas que cuelgan de una orden (orden_items, pagos) además llevan
--     sucursal_id/tenant_id DENORMALIZADOS (copiados por trigger) para que las
--     políticas de RLS puedan filtrar por columna simple en vez de hacer un
--     JOIN dentro de la policy (mejor rendimiento, ver 0002_rls.sql).
--   * Usamos CHECK constraints en vez de tipos ENUM de Postgres para poder
--     agregar valores nuevos (ej. otra forma de pago) con un simple ALTER
--     TABLE ... DROP/ADD CONSTRAINT, sin el dolor de ALTER TYPE.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- tenants: el negocio (el cliente del SaaS)
-- ----------------------------------------------------------------------------
create table public.tenants (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text unique, -- para subdominio propio a futuro (ej. taqueria-xyz)
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.tenants is 'Un cliente del SaaS (dueño de uno o más restaurantes/locales).';

-- ----------------------------------------------------------------------------
-- sucursales: locales de cada tenant
-- ----------------------------------------------------------------------------
create table public.sucursales (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nombre      text not null,
  direccion   text,
  telefono    text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index sucursales_tenant_id_idx on public.sucursales(tenant_id);

-- ----------------------------------------------------------------------------
-- usuarios: perfil extendido de auth.users (1:1). Amarra rol + tenant + sucursal.
-- ----------------------------------------------------------------------------
create table public.usuarios (
  id           uuid primary key references auth.users(id) on delete cascade,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  sucursal_id  uuid references public.sucursales(id) on delete set null,
  rol          text not null check (rol in ('admin', 'cajero', 'mesero')),
  nombre       text not null,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  -- cajero/mesero deben estar amarrados a una sucursal; el admin ve todo el tenant
  constraint usuarios_sucursal_requerida
    check (rol = 'admin' or sucursal_id is not null)
);

create index usuarios_tenant_id_idx on public.usuarios(tenant_id);
create index usuarios_sucursal_id_idx on public.usuarios(sucursal_id);

comment on table public.usuarios is 'Perfil de negocio de cada usuario de Supabase Auth: a qué tenant pertenece, su rol y su sucursal (null si es admin).';

-- ----------------------------------------------------------------------------
-- categorias: para organizar el menú
-- ----------------------------------------------------------------------------
create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nombre      text not null,
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  unique (tenant_id, nombre)
);

create index categorias_tenant_id_idx on public.categorias(tenant_id);

-- ----------------------------------------------------------------------------
-- productos: el menú digital (a nivel tenant; se habilita por sucursal via
-- producto_sucursales)
-- ----------------------------------------------------------------------------
create table public.productos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  categoria_id  uuid references public.categorias(id) on delete set null,
  nombre        text not null,
  descripcion   text,
  precio        numeric(10,2) not null check (precio >= 0),
  foto_url      text,
  disponible    boolean not null default true, -- agotado hoy = false
  activo        boolean not null default true, -- soft delete del catálogo
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index productos_tenant_id_idx on public.productos(tenant_id);
create index productos_categoria_id_idx on public.productos(categoria_id);

-- a qué sucursal(es) aplica cada producto
create table public.producto_sucursales (
  producto_id   uuid not null references public.productos(id) on delete cascade,
  sucursal_id   uuid not null references public.sucursales(id) on delete cascade,
  primary key (producto_id, sucursal_id)
);

create index producto_sucursales_sucursal_id_idx on public.producto_sucursales(sucursal_id);

-- ----------------------------------------------------------------------------
-- mesas: layout del restaurante por sucursal
-- ----------------------------------------------------------------------------
create table public.mesas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  nombre      text not null, -- "Mesa 5", "Barra 2"
  capacidad   int not null default 4,
  zona        text, -- para agrupar visualmente (ej. "Terraza", "Salón principal")
  pos_x       numeric, -- coordenadas (%) para el plano visual del admin
  pos_y       numeric,
  estado      text not null default 'libre' check (estado in ('libre', 'ocupada')),
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (sucursal_id, nombre)
);

create index mesas_tenant_id_idx on public.mesas(tenant_id);
create index mesas_sucursal_id_idx on public.mesas(sucursal_id);

-- ----------------------------------------------------------------------------
-- ordenes
-- ----------------------------------------------------------------------------
create table public.ordenes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  sucursal_id   uuid not null references public.sucursales(id) on delete cascade,
  mesa_id       uuid not null references public.mesas(id),
  usuario_id    uuid references public.usuarios(id), -- mesero que abrió la orden
  estado        text not null default 'abierta'
                  check (estado in ('abierta', 'enviada', 'pagada', 'cancelada')),
  total         numeric(10,2) not null default 0,
  created_at    timestamptz not null default now(),
  enviada_at    timestamptz,
  pagada_at     timestamptz,
  cancelada_at  timestamptz
);

create index ordenes_tenant_id_idx on public.ordenes(tenant_id);
create index ordenes_sucursal_id_idx on public.ordenes(sucursal_id);
create index ordenes_mesa_id_idx on public.ordenes(mesa_id);
create index ordenes_estado_idx on public.ordenes(estado);
-- Consulta típica del cierre diario: pagos del día por sucursal
create index ordenes_sucursal_pagada_idx on public.ordenes(sucursal_id, pagada_at);

-- ----------------------------------------------------------------------------
-- orden_items
-- ----------------------------------------------------------------------------
create table public.orden_items (
  id                uuid primary key default gen_random_uuid(),
  orden_id          uuid not null references public.ordenes(id) on delete cascade,
  tenant_id         uuid not null, -- denormalizado por trigger, ver abajo
  sucursal_id       uuid not null, -- denormalizado por trigger, ver abajo
  producto_id       uuid not null references public.productos(id),
  nombre_producto   text not null,           -- capturado al momento
  cantidad          int not null check (cantidad > 0),
  precio_unitario   numeric(10,2) not null,  -- capturado al momento, NO es una referencia viva
  nota              text,
  impreso           boolean not null default false, -- ya se mandó a cocina
  created_at        timestamptz not null default now()
);

create index orden_items_orden_id_idx on public.orden_items(orden_id);
create index orden_items_tenant_id_idx on public.orden_items(tenant_id);
create index orden_items_sucursal_id_idx on public.orden_items(sucursal_id);
create index orden_items_no_impresos_idx on public.orden_items(orden_id) where not impreso;

-- ----------------------------------------------------------------------------
-- pagos
-- ----------------------------------------------------------------------------
create table public.pagos (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references public.ordenes(id) on delete cascade,
  tenant_id   uuid not null, -- denormalizado por trigger
  sucursal_id uuid not null, -- denormalizado por trigger
  usuario_id  uuid references public.usuarios(id), -- cajero que cobró
  monto       numeric(10,2) not null check (monto > 0),
  forma_pago  text not null check (forma_pago in ('efectivo', 'tarjeta', 'transferencia')),
  referencia  text, -- ej. últimos 4 dígitos, # de transferencia
  created_at  timestamptz not null default now()
);

create index pagos_orden_id_idx on public.pagos(orden_id);
create index pagos_tenant_id_idx on public.pagos(tenant_id);
-- Consulta de cierre diario: pagos por sucursal/día/forma de pago
create index pagos_sucursal_fecha_idx on public.pagos(sucursal_id, created_at);

-- ----------------------------------------------------------------------------
-- formas_pago_sucursal: qué formas de pago acepta cada sucursal
-- ----------------------------------------------------------------------------
create table public.formas_pago_sucursal (
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  forma_pago  text not null check (forma_pago in ('efectivo', 'tarjeta', 'transferencia')),
  activo      boolean not null default true,
  primary key (sucursal_id, forma_pago)
);

-- ----------------------------------------------------------------------------
-- impresoras: config del servicio agente de impresión (ESC/POS) por sucursal
-- ----------------------------------------------------------------------------
create table public.impresoras (
  id          uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id) on delete cascade,
  nombre      text not null default 'Cocina', -- "Cocina", "Barra", etc.
  ip          inet not null,
  puerto      int not null default 9100,
  activa      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index impresoras_sucursal_id_idx on public.impresoras(sucursal_id);

-- ============================================================================
-- Triggers: denormalización de tenant_id/sucursal_id y totales
-- ============================================================================

-- orden_items: copia tenant_id/sucursal_id de la orden; si no viene precio,
-- lo toma del producto en ese instante (fallback, la app debería enviarlo).
create or replace function public.fn_orden_items_before_insert()
returns trigger
language plpgsql
as $$
begin
  select o.tenant_id, o.sucursal_id
    into new.tenant_id, new.sucursal_id
    from public.ordenes o
   where o.id = new.orden_id;

  if new.precio_unitario is null then
    select p.precio into new.precio_unitario
      from public.productos p
     where p.id = new.producto_id;
  end if;

  if new.nombre_producto is null then
    select p.nombre into new.nombre_producto
      from public.productos p
     where p.id = new.producto_id;
  end if;

  return new;
end;
$$;

create trigger trg_orden_items_before_insert
  before insert on public.orden_items
  for each row execute function public.fn_orden_items_before_insert();

-- pagos: copia tenant_id/sucursal_id de la orden
create or replace function public.fn_pagos_before_insert()
returns trigger
language plpgsql
as $$
begin
  select o.tenant_id, o.sucursal_id
    into new.tenant_id, new.sucursal_id
    from public.ordenes o
   where o.id = new.orden_id;
  return new;
end;
$$;

create trigger trg_pagos_before_insert
  before insert on public.pagos
  for each row execute function public.fn_pagos_before_insert();

-- ordenes.total = suma de sus orden_items (se recalcula solo)
create or replace function public.fn_recalcular_total_orden()
returns trigger
language plpgsql
as $$
declare
  v_orden_id uuid := coalesce(new.orden_id, old.orden_id);
begin
  update public.ordenes o
     set total = coalesce((
           select sum(cantidad * precio_unitario)
             from public.orden_items
            where orden_id = v_orden_id
         ), 0)
   where o.id = v_orden_id;
  return null;
end;
$$;

create trigger trg_orden_items_recalcular_total
  after insert or update or delete on public.orden_items
  for each row execute function public.fn_recalcular_total_orden();

-- productos.updated_at automático
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_productos_updated_at
  before update on public.productos
  for each row execute function public.fn_set_updated_at();

-- Al registrar un pago: si la suma de pagos ya cubre el total, la orden pasa a
-- 'pagada' (con su hora) y la mesa vuelve a 'libre'. Esto es una salvaguarda a
-- nivel de datos; el flujo normal lo dispara el server action de cobro.
create or replace function public.fn_pagos_after_insert()
returns trigger
language plpgsql
as $$
declare
  v_total numeric(10,2);
  v_pagado numeric(10,2);
  v_mesa_id uuid;
begin
  select total, mesa_id into v_total, v_mesa_id
    from public.ordenes where id = new.orden_id;

  select coalesce(sum(monto), 0) into v_pagado
    from public.pagos where orden_id = new.orden_id;

  if v_pagado >= v_total then
    update public.ordenes
       set estado = 'pagada', pagada_at = now()
     where id = new.orden_id
       and estado <> 'pagada';

    update public.mesas
       set estado = 'libre'
     where id = v_mesa_id;
  end if;

  return new;
end;
$$;

create trigger trg_pagos_after_insert
  after insert on public.pagos
  for each row execute function public.fn_pagos_after_insert();
