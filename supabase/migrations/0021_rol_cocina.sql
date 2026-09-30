-- ============================================================================
-- Rol «cocina»: usuario de la pantalla de cocina. Solo VE las órdenes de su
-- sucursal y solo puede marcarlas como listas (despachar). No ve pagos ni
-- facturas, no toma pedidos, no cobra y no mueve mesas.
-- ============================================================================

-- El rol nuevo (el check original de 0001 no tiene nombre: usuarios_rol_check).
-- cocina, como cajero/mesero, debe estar amarrado a una sucursal
-- (usuarios_sucursal_requerida ya lo exige: solo el admin va sin sucursal).
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios
  add constraint usuarios_rol_check check (rol in ('admin', 'cajero', 'mesero', 'cocina'));

create or replace function public.fn_es_cocina()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol from public.usuarios where id = auth.uid()) = 'cocina', false)
$$;

revoke all on function public.fn_es_cocina() from public;
grant execute on function public.fn_es_cocina() to authenticated;

-- ----------------------------------------------------------------------------
-- Las políticas de 0002 dejan escribir a cualquier usuario de la sucursal; para
-- cocina se cierra con triggers (RLS no puede limitar COLUMNAS). Las escrituras
-- de las demás roles y las del servidor (sin usuario) no se tocan.
-- ----------------------------------------------------------------------------
create or replace function public.fn_cocina_solo_lectura()
returns trigger
language plpgsql
as $$
begin
  if public.fn_es_cocina() then
    raise exception 'COCINA_SOLO_LECTURA: el rol de cocina solo puede marcar órdenes como listas';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_orden_items_cocina
  before insert or update or delete on public.orden_items
  for each row execute function public.fn_cocina_solo_lectura();

create trigger trg_mesas_cocina
  before insert or update or delete on public.mesas
  for each row execute function public.fn_cocina_solo_lectura();

create trigger trg_ordenes_cocina_altas_bajas
  before insert or delete on public.ordenes
  for each row execute function public.fn_cocina_solo_lectura();

-- En ordenes cocina SOLO puede cambiar lista_cocina (el botón «Listo»)
create or replace function public.fn_cocina_ordenes_update()
returns trigger
language plpgsql
as $$
begin
  if public.fn_es_cocina()
     and (to_jsonb(new) - 'lista_cocina') is distinct from (to_jsonb(old) - 'lista_cocina')
  then
    raise exception 'COCINA_SOLO_LECTURA: el rol de cocina solo puede marcar órdenes como listas';
  end if;
  return new;
end;
$$;

create trigger trg_ordenes_cocina_update
  before update on public.ordenes
  for each row execute function public.fn_cocina_ordenes_update();

-- ----------------------------------------------------------------------------
-- Lo que cocina no necesita ver: dinero y facturación (mismas políticas de
-- 0002/0017/0018, agregando «y no es cocina»)
-- ----------------------------------------------------------------------------
drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );

drop policy if exists pagos_insert on public.pagos;
create policy pagos_insert on public.pagos
  for insert to authenticated
  with check (
    not public.fn_es_cocina()
    and exists (
      select 1 from public.ordenes o
       where o.id = pagos.orden_id
         and o.tenant_id = public.current_tenant_id()
         and (public.is_admin() or o.sucursal_id = public.current_sucursal_id())
    )
  );

drop policy if exists documentos_fiscales_select on public.documentos_fiscales;
create policy documentos_fiscales_select on public.documentos_fiscales
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );

drop policy if exists cai_rangos_select on public.cai_rangos;
create policy cai_rangos_select on public.cai_rangos
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );

drop policy if exists dispositivos_pos_select on public.dispositivos_pos;
create policy dispositivos_pos_select on public.dispositivos_pos
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );
