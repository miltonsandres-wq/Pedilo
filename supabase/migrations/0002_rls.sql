-- ============================================================================
-- POS Restaurante — Row Level Security (aislamiento multi-tenant/sucursal)
-- ============================================================================
-- Regla general:
--   admin     -> ve/edita TODO lo de su tenant_id (todas sus sucursales)
--   cajero    -> ve/opera solo su sucursal_id (tomar/cobrar órdenes, registrar pagos)
--   mesero    -> ve/opera solo su sucursal_id (abrir órdenes, agregar ítems)
--   catálogo (productos/categorias) y config (formas_pago, impresoras) las
--   escribe solo el admin; cajero/mesero solo leen lo de su sucursal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Funciones helper (SECURITY DEFINER para no recursar RLS sobre "usuarios")
-- ----------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.usuarios where id = auth.uid()
$$;

create or replace function public.current_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.usuarios where id = auth.uid()
$$;

create or replace function public.current_sucursal_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sucursal_id from public.usuarios where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol from public.usuarios where id = auth.uid()) = 'admin', false)
$$;

-- Revocar ejecución pública directa no hace falta (son SQL, no exponen datos
-- por sí solas), pero las dejamos solo para authenticated por prolijidad.
revoke all on function public.current_tenant_id() from public;
revoke all on function public.current_rol() from public;
revoke all on function public.current_sucursal_id() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_tenant_id() to authenticated;
grant execute on function public.current_rol() to authenticated;
grant execute on function public.current_sucursal_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- Enable RLS en todas las tablas de negocio
-- ----------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.sucursales enable row level security;
alter table public.usuarios enable row level security;
alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.producto_sucursales enable row level security;
alter table public.mesas enable row level security;
alter table public.ordenes enable row level security;
alter table public.orden_items enable row level security;
alter table public.pagos enable row level security;
alter table public.formas_pago_sucursal enable row level security;
alter table public.impresoras enable row level security;

-- ----------------------------------------------------------------------------
-- tenants: solo lectura del propio tenant. Alta de tenants nuevos se hace por
-- fuera (onboarding con service_role), no desde el cliente.
-- ----------------------------------------------------------------------------
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

-- ----------------------------------------------------------------------------
-- sucursales
-- ----------------------------------------------------------------------------
create policy sucursales_select on public.sucursales
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or id = public.current_sucursal_id())
  );

create policy sucursales_insert on public.sucursales
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy sucursales_update on public.sucursales
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy sucursales_delete on public.sucursales
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

-- ----------------------------------------------------------------------------
-- usuarios: cada quien ve su propio perfil; el admin ve/administra todos los
-- de su tenant.
-- ----------------------------------------------------------------------------
create policy usuarios_select on public.usuarios
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or id = auth.uid())
  );

create policy usuarios_insert on public.usuarios
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy usuarios_update on public.usuarios
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or id = auth.uid())
  )
  with check (tenant_id = public.current_tenant_id());

create policy usuarios_delete on public.usuarios
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

-- ----------------------------------------------------------------------------
-- categorias / productos / producto_sucursales: catálogo. Todos leen lo de su
-- tenant (el mesero necesita ver todo el menú); solo admin escribe.
-- ----------------------------------------------------------------------------
create policy categorias_select on public.categorias
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy categorias_write on public.categorias
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy productos_select on public.productos
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy productos_write on public.productos
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- producto_sucursales no tiene tenant_id propio: se valida vía producto/sucursal
create policy producto_sucursales_select on public.producto_sucursales
  for select to authenticated
  using (
    exists (
      select 1 from public.productos p
       where p.id = producto_sucursales.producto_id
         and p.tenant_id = public.current_tenant_id()
    )
  );

create policy producto_sucursales_write on public.producto_sucursales
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.productos p
       where p.id = producto_sucursales.producto_id
         and p.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.productos p
       where p.id = producto_sucursales.producto_id
         and p.tenant_id = public.current_tenant_id()
    )
  );

-- ----------------------------------------------------------------------------
-- mesas: admin administra el layout de cualquier sucursal de su tenant;
-- cajero/mesero solo ven/operan (cambiar estado libre/ocupada) su sucursal.
-- ----------------------------------------------------------------------------
create policy mesas_select on public.mesas
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy mesas_insert on public.mesas
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- update: admin edita layout completo; cajero/mesero solo pueden tocar el
-- estado de SU sucursal (ej. liberar/ocupar mesa) vía el flujo de la orden.
create policy mesas_update on public.mesas
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy mesas_delete on public.mesas
  for delete to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

-- ----------------------------------------------------------------------------
-- ordenes: admin ve todas las de su tenant; cajero/mesero solo las de su
-- sucursal. Cualquiera de los dos roles operativos puede abrir/editar/cobrar
-- dentro de su propia sucursal (la separación mesero-abre / cajero-cobra es
-- una regla de UI/negocio, no de RLS, para no bloquear turnos mixtos).
-- ----------------------------------------------------------------------------
create policy ordenes_select on public.ordenes
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy ordenes_insert on public.ordenes
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy ordenes_update on public.ordenes
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

-- No delete de ordenes desde el cliente: se cancelan (estado = 'cancelada'),
-- nunca se borran (son el registro contable/historial).

-- ----------------------------------------------------------------------------
-- orden_items: mismas reglas que ordenes, filtrando por las columnas
-- denormalizadas tenant_id/sucursal_id (sin JOIN).
-- ----------------------------------------------------------------------------
create policy orden_items_select on public.orden_items
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy orden_items_insert on public.orden_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ordenes o
       where o.id = orden_items.orden_id
         and o.tenant_id = public.current_tenant_id()
         and (public.is_admin() or o.sucursal_id = public.current_sucursal_id())
    )
  );

create policy orden_items_update on public.orden_items
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy orden_items_delete on public.orden_items
  for delete to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

-- ----------------------------------------------------------------------------
-- pagos: se insertan (cobro), no se editan ni se borran desde el cliente
-- (registro contable). Admin/cajero/mesero de la sucursal pueden verlos.
-- ----------------------------------------------------------------------------
create policy pagos_select on public.pagos
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy pagos_insert on public.pagos
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ordenes o
       where o.id = pagos.orden_id
         and o.tenant_id = public.current_tenant_id()
         and (public.is_admin() or o.sucursal_id = public.current_sucursal_id())
    )
  );

-- ----------------------------------------------------------------------------
-- formas_pago_sucursal / impresoras: config administrada solo por el admin;
-- cajero/mesero de la sucursal pueden leerla (para saber qué formas de pago
-- ofrecer, o a qué impresora está apuntando su sucursal).
-- ----------------------------------------------------------------------------
create policy formas_pago_sucursal_select on public.formas_pago_sucursal
  for select to authenticated
  using (
    exists (
      select 1 from public.sucursales s
       where s.id = formas_pago_sucursal.sucursal_id
         and s.tenant_id = public.current_tenant_id()
         and (public.is_admin() or s.id = public.current_sucursal_id())
    )
  );

create policy formas_pago_sucursal_write on public.formas_pago_sucursal
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.sucursales s
       where s.id = formas_pago_sucursal.sucursal_id
         and s.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.sucursales s
       where s.id = formas_pago_sucursal.sucursal_id
         and s.tenant_id = public.current_tenant_id()
    )
  );

create policy impresoras_select on public.impresoras
  for select to authenticated
  using (
    exists (
      select 1 from public.sucursales s
       where s.id = impresoras.sucursal_id
         and s.tenant_id = public.current_tenant_id()
         and (public.is_admin() or s.id = public.current_sucursal_id())
    )
  );

create policy impresoras_write on public.impresoras
  for all to authenticated
  using (
    public.is_admin()
    and exists (
      select 1 from public.sucursales s
       where s.id = impresoras.sucursal_id
         and s.tenant_id = public.current_tenant_id()
    )
  )
  with check (
    public.is_admin()
    and exists (
      select 1 from public.sucursales s
       where s.id = impresoras.sucursal_id
         and s.tenant_id = public.current_tenant_id()
    )
  );
