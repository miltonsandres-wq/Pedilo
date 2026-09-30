-- ============================================================================
-- Repartidores. NO son usuarios del POS (no tienen auth.users): entran con
-- sucursal + PIN por una server action que valida el PIN con
-- repartidor_login() y firma un JWT propio con el claim `repartidor_id`.
-- Las políticas de RLS leen ese claim (current_repartidor_id()).
--
-- El hash del PIN vive en repartidor_credenciales, SIN políticas: ni el
-- personal ni el propio repartidor pueden leerlo (un REVOKE por columna no
-- aguanta los GRANT globales de Supabase).
-- ============================================================================

create table public.repartidores (
  id                         uuid primary key default gen_random_uuid(),
  tenant_id                  uuid not null references public.tenants(id) on delete cascade,
  sucursal_id                uuid not null references public.sucursales(id) on delete cascade,
  nombre                     text not null check (length(trim(nombre)) > 0),
  telefono                   text,
  activo                     boolean not null default true,
  tipo_pago                  text not null default 'por_entrega' check (tipo_pago in ('fijo', 'por_entrega')),
  monto_por_entrega          numeric(10,2) not null default 0 check (monto_por_entrega >= 0),
  -- Cuándo aceptó compartir su ubicación (privacidad: queda registrado)
  aceptacion_ubicacion_at    timestamptz,
  -- Inicio del turno vigente; se limpia al liquidar
  turno_inicio               timestamptz,
  created_at                 timestamptz not null default now()
);

create index repartidores_tenant_idx on public.repartidores(tenant_id);
create index repartidores_sucursal_idx on public.repartidores(sucursal_id);

create trigger trg_repartidores_tenant
  before insert or update of sucursal_id on public.repartidores
  for each row execute function public.fn_delivery_tenant_de_sucursal();

create table public.repartidor_credenciales (
  repartidor_id      uuid primary key references public.repartidores(id) on delete cascade,
  pin_hash           text not null,
  intentos_fallidos  int not null default 0,
  bloqueado_hasta    timestamptz
);

alter table public.repartidor_credenciales enable row level security; -- sin políticas a propósito

-- Hash del PIN (bcrypt). Solo la llama el servidor con la service role.
create or replace function public.repartidor_hash_pin(p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN_INVALIDO: el PIN debe tener de 4 a 6 dígitos';
  end if;
  return crypt(p_pin, gen_salt('bf'));
end;
$$;

-- Login: valida PIN, cuenta fallos y bloquea 15 min tras 5 intentos seguidos.
create or replace function public.repartidor_login(p_repartidor uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  c record;
begin
  select id, tenant_id, sucursal_id, nombre, activo into r from public.repartidores where id = p_repartidor;
  select * into c from public.repartidor_credenciales where repartidor_id = p_repartidor;
  if r.id is null or not r.activo or c.repartidor_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;

  if c.bloqueado_hasta is not null and c.bloqueado_hasta > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'hasta', c.bloqueado_hasta);
  end if;

  if crypt(coalesce(p_pin, ''), c.pin_hash) <> c.pin_hash then
    update public.repartidor_credenciales
       set intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end,
           bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' else null end
     where repartidor_id = p_repartidor;
    return jsonb_build_object('ok', false, 'motivo', 'pin_incorrecto');
  end if;

  update public.repartidor_credenciales
     set intentos_fallidos = 0, bloqueado_hasta = null
   where repartidor_id = p_repartidor;
  update public.repartidores
     set turno_inicio = coalesce(turno_inicio, now())
   where id = p_repartidor;

  return jsonb_build_object('ok', true, 'repartidor_id', r.id, 'tenant_id', r.tenant_id,
                            'sucursal_id', r.sucursal_id, 'nombre', r.nombre);
end;
$$;

revoke all on function public.repartidor_hash_pin(text) from public, anon, authenticated;
revoke all on function public.repartidor_login(uuid, text) from public, anon, authenticated;

-- Id del repartidor que hace la petición (claim del JWT propio); null si no es uno.
-- Se valida contra la tabla: un repartidor dado de baja pierde el acceso al instante.
create or replace function public.current_repartidor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from public.repartidores r
   where r.activo
     and r.id = nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'repartidor_id', '')::uuid
$$;

revoke all on function public.current_repartidor_id() from public;
grant execute on function public.current_repartidor_id() to authenticated;

alter table public.repartidores enable row level security;

create policy repartidores_select on public.repartidores
  for select to authenticated
  using (
    (tenant_id = public.current_tenant_id()
      and (public.is_admin() or sucursal_id = public.current_sucursal_id())
      and not public.fn_es_cocina())
    or id = public.current_repartidor_id()
  );
create policy repartidores_admin_insert on public.repartidores
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
create policy repartidores_admin_update on public.repartidores
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());
