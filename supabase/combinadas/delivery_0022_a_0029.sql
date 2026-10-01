-- ============================== 0022_delivery_config_zonas.sql ==============================
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

-- ============================== 0023_repartidores.sql ==============================
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

-- ============================== 0024_ordenes_delivery.sql ==============================
-- ============================================================================
-- Pedidos de delivery: `ordenes` sigue siendo la orden (ítems, total, cocina,
-- pagos, factura); `ordenes_delivery` (1:1) guarda lo propio del envío.
-- Así los datos del cliente (teléfono, dirección) quedan fuera de las consultas
-- del salón y de la pantalla de cocina, que no tiene acceso a esta tabla.
--
-- Estados: recibido → aceptado → en_cocina → listo → en_camino → entregado,
-- más rechazado y cancelado. "Llegué" NO es un estado: es `llegado_at` mientras
-- el pedido está en_camino. Las transiciones las valida el servidor (trigger).
-- ============================================================================

-- La orden de delivery no tiene mesa
alter table public.ordenes alter column mesa_id drop not null;
alter table public.ordenes
  add column canal text not null default 'local'
    check (canal in ('local', 'delivery_web', 'delivery_telefono'));
alter table public.ordenes
  add constraint ordenes_mesa_segun_canal check (canal <> 'local' or mesa_id is not null);

create index ordenes_canal_idx on public.ordenes(sucursal_id, canal) where canal <> 'local';

create table public.ordenes_delivery (
  orden_id                      uuid primary key references public.ordenes(id) on delete cascade,
  tenant_id                     uuid not null references public.tenants(id) on delete cascade,
  sucursal_id                   uuid not null references public.sucursales(id) on delete cascade,
  cliente_nombre                text not null check (length(trim(cliente_nombre)) > 0),
  cliente_telefono              text not null check (cliente_telefono ~ '^[0-9]{8}$'),
  direccion_referencia          text not null check (length(trim(direccion_referencia)) >= 5),
  ubicacion_lat                 double precision check (ubicacion_lat between -90 and 90),
  ubicacion_lng                 double precision check (ubicacion_lng between -180 and 180),
  zona_id                       uuid references public.delivery_zonas(id) on delete set null,
  zona_nombre                   text, -- snapshot (la zona se puede renombrar o borrar)
  tarifa_envio                  numeric(10,2) not null default 0 check (tarifa_envio >= 0),
  metodo_pago                   text not null
                                  check (metodo_pago in ('efectivo', 'tarjeta_contra_entrega', 'transferencia')),
  paga_con                      numeric(10,2) check (paga_con is null or paga_con > 0),
  comprobante_transferencia_url text,
  tipo_factura                  text not null default 'consumidor_final'
                                  check (tipo_factura in ('consumidor_final', 'con_rtn')),
  factura_nombre                text,
  factura_rtn                   text,
  repartidor_id                 uuid references public.repartidores(id) on delete set null,
  tracking_token                text not null unique
                                  default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  estado_delivery               text not null default 'recibido'
                                  check (estado_delivery in ('recibido','aceptado','en_cocina','listo',
                                                             'en_camino','entregado','rechazado','cancelado')),
  recibido_at                   timestamptz not null default now(),
  aceptado_at                   timestamptz,
  en_cocina_at                  timestamptz,
  listo_at                      timestamptz,
  en_camino_at                  timestamptz,
  llegado_at                    timestamptz,
  llegada_automatica            boolean not null default false,
  entregado_at                  timestamptz,
  cancelado_at                  timestamptz,
  motivo_cancelacion            text, -- también es el motivo del rechazo
  entrega_lat                   double precision check (entrega_lat between -90 and 90),
  entrega_lng                   double precision check (entrega_lng between -180 and 180),
  entrega_foto_url              text, -- fase 2: foto de prueba de entrega
  monto_cobrado                 numeric(10,2) check (monto_cobrado is null or monto_cobrado >= 0),
  liquidacion_id                uuid, -- FK en 0026
  created_at                    timestamptz not null default now(),
  constraint ordenes_delivery_rtn check (
    tipo_factura = 'consumidor_final'
    or (factura_rtn ~ '^[0-9]{14}$' and length(trim(coalesce(factura_nombre, ''))) > 0)
  ),
  constraint ordenes_delivery_motivo check (
    estado_delivery not in ('rechazado', 'cancelado') or length(trim(coalesce(motivo_cancelacion, ''))) > 0
  )
);

create index ordenes_delivery_sucursal_estado_idx on public.ordenes_delivery(sucursal_id, estado_delivery);
create index ordenes_delivery_repartidor_idx on public.ordenes_delivery(repartidor_id) where repartidor_id is not null;
create index ordenes_delivery_tenant_idx on public.ordenes_delivery(tenant_id);
create index ordenes_delivery_liquidacion_idx on public.ordenes_delivery(repartidor_id)
  where estado_delivery = 'entregado' and liquidacion_id is null;

-- ----------------------------------------------------------------------------
-- Denormalización + coherencia al insertar
-- ----------------------------------------------------------------------------
create or replace function public.fn_ordenes_delivery_antes_insert()
returns trigger
language plpgsql
as $$
declare
  v_canal text;
begin
  select o.tenant_id, o.sucursal_id, o.canal
    into new.tenant_id, new.sucursal_id, v_canal
    from public.ordenes o
   where o.id = new.orden_id;

  if v_canal is null or v_canal = 'local' then
    raise exception 'DELIVERY_ORDEN: la orden no es de delivery';
  end if;

  if new.zona_id is not null then
    select z.nombre into new.zona_nombre
      from public.delivery_zonas z
     where z.id = new.zona_id and z.sucursal_id = new.sucursal_id;
    if new.zona_nombre is null then
      raise exception 'DELIVERY_ZONA: la zona no pertenece a esta sucursal';
    end if;
  end if;

  if new.repartidor_id is not null and not exists (
    select 1 from public.repartidores r where r.id = new.repartidor_id and r.sucursal_id = new.sucursal_id
  ) then
    raise exception 'DELIVERY_REPARTIDOR: el repartidor no es de esta sucursal';
  end if;
  return new;
end;
$$;

create trigger trg_ordenes_delivery_antes_insert
  before insert on public.ordenes_delivery
  for each row execute function public.fn_ordenes_delivery_antes_insert();

-- Hora de un evento: la que mandó el dispositivo (puede venir de una cola
-- offline) sin pasarse del presente; si no mandó ninguna, ahora.
create or replace function public.fn_delivery_ts(p_nuevo timestamptz, p_viejo timestamptz)
returns timestamptz
language sql
stable
as $$
  select case when p_nuevo is not distinct from p_viejo then now() else least(p_nuevo, now()) end
$$;

-- ----------------------------------------------------------------------------
-- Máquina de estados (validada aquí, no solo en el cliente)
-- ----------------------------------------------------------------------------
create or replace function public.fn_delivery_antes_update()
returns trigger
language plpgsql
as $$
begin
  if new.orden_id is distinct from old.orden_id or new.tenant_id is distinct from old.tenant_id
     or new.sucursal_id is distinct from old.sucursal_id or new.tracking_token is distinct from old.tracking_token then
    raise exception 'DELIVERY_INMUTABLE: el pedido, el negocio y el token no se pueden cambiar';
  end if;

  -- Estados finales: solo se puede enlazar a una liquidación
  if old.estado_delivery in ('entregado', 'rechazado', 'cancelado') then
    if (to_jsonb(new) - 'liquidacion_id') is distinct from (to_jsonb(old) - 'liquidacion_id') then
      raise exception 'DELIVERY_TRANSICION: el pedido ya está % y no se puede modificar', old.estado_delivery;
    end if;
    return new;
  end if;

  if new.estado_delivery is distinct from old.estado_delivery then
    if not ((old.estado_delivery, new.estado_delivery) in (
      ('recibido', 'aceptado'), ('recibido', 'rechazado'), ('recibido', 'cancelado'),
      ('aceptado', 'en_cocina'), ('aceptado', 'cancelado'),
      ('en_cocina', 'listo'), ('en_cocina', 'cancelado'),
      ('listo', 'en_camino'), ('listo', 'cancelado'),
      ('en_camino', 'entregado'), ('en_camino', 'cancelado')
    )) then
      raise exception 'DELIVERY_TRANSICION: no se puede pasar de % a %', old.estado_delivery, new.estado_delivery;
    end if;

    case new.estado_delivery
      when 'aceptado' then new.aceptado_at := public.fn_delivery_ts(new.aceptado_at, old.aceptado_at);
      when 'en_cocina' then new.en_cocina_at := public.fn_delivery_ts(new.en_cocina_at, old.en_cocina_at);
      when 'listo' then new.listo_at := public.fn_delivery_ts(new.listo_at, old.listo_at);
      when 'en_camino' then
        if new.repartidor_id is null then
          raise exception 'DELIVERY_SIN_REPARTIDOR: asigna un repartidor antes de despachar';
        end if;
        new.en_camino_at := public.fn_delivery_ts(new.en_camino_at, old.en_camino_at);
      when 'entregado' then
        new.entregado_at := public.fn_delivery_ts(new.entregado_at, old.entregado_at);
        if new.llegado_at is null then
          new.llegado_at := new.entregado_at;
        end if;
        if new.monto_cobrado is null then
          new.monto_cobrado := (select o.total from public.ordenes o where o.id = new.orden_id) + new.tarifa_envio;
        end if;
      when 'rechazado', 'cancelado' then
        if length(trim(coalesce(new.motivo_cancelacion, ''))) = 0 then
          raise exception 'DELIVERY_MOTIVO: indica el motivo';
        end if;
        new.cancelado_at := public.fn_delivery_ts(new.cancelado_at, old.cancelado_at);
      else null;
    end case;
  else
    if new.llegado_at is distinct from old.llegado_at and new.estado_delivery <> 'en_camino' then
      raise exception 'DELIVERY_TRANSICION: solo se puede marcar la llegada con el pedido en camino';
    end if;
    if new.llegado_at is distinct from old.llegado_at then
      new.llegado_at := public.fn_delivery_ts(new.llegado_at, old.llegado_at);
    end if;
  end if;

  if new.repartidor_id is distinct from old.repartidor_id then
    if old.estado_delivery = 'en_camino' then
      raise exception 'DELIVERY_REPARTIDOR: no se puede cambiar el repartidor con el pedido en camino';
    end if;
    if new.repartidor_id is not null and not exists (
      select 1 from public.repartidores r
       where r.id = new.repartidor_id and r.sucursal_id = new.sucursal_id and r.activo
    ) then
      raise exception 'DELIVERY_REPARTIDOR: el repartidor no está activo en esta sucursal';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_ordenes_delivery_antes_update
  before update on public.ordenes_delivery
  for each row execute function public.fn_delivery_antes_update();

-- El repartidor solo toca lo suyo (RLS no limita columnas)
create or replace function public.fn_delivery_repartidor_columnas()
returns trigger
language plpgsql
as $$
begin
  if public.current_repartidor_id() is null then
    return new;
  end if;
  if (to_jsonb(new) - array['estado_delivery','en_camino_at','llegado_at','llegada_automatica','entregado_at',
                            'entrega_lat','entrega_lng','entrega_foto_url','monto_cobrado'])
     is distinct from
     (to_jsonb(old) - array['estado_delivery','en_camino_at','llegado_at','llegada_automatica','entregado_at',
                            'entrega_lat','entrega_lng','entrega_foto_url','monto_cobrado'])
  then
    raise exception 'DELIVERY_SOLO_ENTREGA: el repartidor solo puede actualizar el estado y la entrega';
  end if;
  if new.estado_delivery is distinct from old.estado_delivery
     and (old.estado_delivery, new.estado_delivery) not in (('listo', 'en_camino'), ('en_camino', 'entregado')) then
    raise exception 'DELIVERY_TRANSICION: el repartidor solo puede salir y entregar';
  end if;
  return new;
end;
$$;

-- se llama ANTES del trigger de transición (orden alfabético de triggers)
create trigger trg_ordenes_delivery_a_repartidor
  before update on public.ordenes_delivery
  for each row execute function public.fn_delivery_repartidor_columnas();

-- ----------------------------------------------------------------------------
-- Efectos sobre la orden (cocina / cobro). SECURITY DEFINER: lo dispara
-- también el repartidor, que no tiene acceso a `ordenes` ni a `pagos`.
-- ----------------------------------------------------------------------------
create or replace function public.fn_delivery_despues_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado_delivery is not distinct from old.estado_delivery then
    return new;
  end if;

  if new.estado_delivery = 'en_cocina' then
    update public.ordenes
       set estado = 'enviada', enviada_at = coalesce(enviada_at, now()), lista_cocina = false
     where id = new.orden_id and estado = 'abierta';
  elsif new.estado_delivery = 'listo' then
    update public.ordenes set lista_cocina = true where id = new.orden_id;
  elsif new.estado_delivery in ('rechazado', 'cancelado') then
    update public.ordenes
       set estado = 'cancelada', cancelada_at = now(), motivo_cancelacion = new.motivo_cancelacion
     where id = new.orden_id and estado <> 'pagada';
  elsif new.estado_delivery = 'entregado' and coalesce(new.monto_cobrado, 0) > 0 then
    -- Lo cobrado entra a `pagos` al entregar: así el cierre del día lo ve
    insert into public.pagos (orden_id, monto, forma_pago, referencia)
    values (
      new.orden_id,
      new.monto_cobrado,
      case new.metodo_pago
        when 'efectivo' then 'efectivo'
        when 'tarjeta_contra_entrega' then 'tarjeta'
        else 'transferencia'
      end,
      'delivery'
    );
  end if;
  return new;
end;
$$;

create trigger trg_ordenes_delivery_despues_update
  after update on public.ordenes_delivery
  for each row execute function public.fn_delivery_despues_update();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.ordenes_delivery enable row level security;

-- Personal: su sucursal (admin: todo el negocio). Cocina NO: no ve teléfono ni dirección.
create policy ordenes_delivery_select on public.ordenes_delivery
  for select to authenticated
  using (
    (tenant_id = public.current_tenant_id()
      and (public.is_admin() or sucursal_id = public.current_sucursal_id())
      and not public.fn_es_cocina())
    or repartidor_id = public.current_repartidor_id()
  );

create policy ordenes_delivery_insert on public.ordenes_delivery
  for insert to authenticated
  with check (
    exists (
      select 1 from public.ordenes o
       where o.id = ordenes_delivery.orden_id
         and o.tenant_id = public.current_tenant_id()
         and (public.is_admin() or o.sucursal_id = public.current_sucursal_id())
    )
    and not public.fn_es_cocina()
  );

create policy ordenes_delivery_update on public.ordenes_delivery
  for update to authenticated
  using (
    (tenant_id = public.current_tenant_id()
      and (public.is_admin() or sucursal_id = public.current_sucursal_id())
      and not public.fn_es_cocina())
    or repartidor_id = public.current_repartidor_id()
  )
  with check (
    (tenant_id = public.current_tenant_id()
      and (public.is_admin() or sucursal_id = public.current_sucursal_id())
      and not public.fn_es_cocina())
    or repartidor_id = public.current_repartidor_id()
  );

-- El repartidor ve la orden y los ítems SOLO de sus pedidos asignados
create policy ordenes_select_repartidor on public.ordenes
  for select to authenticated
  using (
    exists (select 1 from public.ordenes_delivery d
             where d.orden_id = ordenes.id and d.repartidor_id = public.current_repartidor_id())
  );

create policy orden_items_select_repartidor on public.orden_items
  for select to authenticated
  using (
    exists (select 1 from public.ordenes_delivery d
             where d.orden_id = orden_items.orden_id and d.repartidor_id = public.current_repartidor_id())
  );

alter publication supabase_realtime add table public.ordenes_delivery;

-- ----------------------------------------------------------------------------
-- Aviso en vivo al seguimiento del cliente (Realtime broadcast en el canal
-- público pedido:<token>, cuyo nombre es el secreto). Solo lleva el estado: la
-- página vuelve a pedir el detalle por seguimiento_pedido(). Si Realtime no
-- está (pruebas locales) se ignora; el seguimiento además consulta cada pocos
-- segundos, así que esto solo lo hace instantáneo.
-- ----------------------------------------------------------------------------
create or replace function public.fn_delivery_avisar_seguimiento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    execute format(
      'select realtime.send(%L::jsonb, %L, %L, false)',
      jsonb_build_object('estado', new.estado_delivery, 'llegado', new.llegado_at is not null)::text,
      'estado',
      'pedido:' || new.tracking_token
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger trg_ordenes_delivery_avisar
  after update on public.ordenes_delivery
  for each row
  when (old.estado_delivery is distinct from new.estado_delivery
        or old.llegado_at is distinct from new.llegado_at
        or old.repartidor_id is distinct from new.repartidor_id)
  execute function public.fn_delivery_avisar_seguimiento();

-- ----------------------------------------------------------------------------
-- Seguimiento público: SOLO con el token. Devuelve únicamente lo que el
-- cliente puede ver de SU pedido (la ubicación en vivo NO pasa por aquí: va
-- por Realtime broadcast y solo mientras está en camino).
-- ----------------------------------------------------------------------------
create or replace function public.seguimiento_pedido(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d public.ordenes_delivery;
  o public.ordenes;
  v_config public.delivery_config;
  v_repartidor jsonb := null;
  v_factura jsonb := null;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;
  select * into d from public.ordenes_delivery where tracking_token = p_token;
  if not found then
    return null;
  end if;
  select * into o from public.ordenes where id = d.orden_id;
  select * into v_config from public.delivery_config where sucursal_id = d.sucursal_id;

  if d.repartidor_id is not null and d.estado_delivery in ('en_camino', 'entregado') then
    select jsonb_build_object(
             'nombre', r.nombre,
             -- el teléfono solo mientras el pedido va en camino
             'telefono', case when d.estado_delivery = 'en_camino' then r.telefono else null end)
      into v_repartidor
      from public.repartidores r where r.id = d.repartidor_id;
  end if;

  select jsonb_build_object('id', f.id, 'numero', f.numero_completo)
    into v_factura
    from public.documentos_fiscales f
   where f.orden_id = d.orden_id and f.clase = 'factura' and f.estado = 'emitida'
   limit 1;

  return jsonb_build_object(
    'orden_id', d.orden_id,
    'slug', v_config.slug,
    'numero', o.numero_dia,
    'sucursal', (select s.nombre from public.sucursales s where s.id = d.sucursal_id),
    'estado', d.estado_delivery,
    'recibido_at', d.recibido_at, 'aceptado_at', d.aceptado_at, 'en_cocina_at', d.en_cocina_at,
    'listo_at', d.listo_at, 'en_camino_at', d.en_camino_at, 'llegado_at', d.llegado_at,
    'entregado_at', d.entregado_at, 'cancelado_at', d.cancelado_at,
    'motivo', case when d.estado_delivery in ('rechazado', 'cancelado') then d.motivo_cancelacion else null end,
    'destino', case when d.ubicacion_lat is not null
                    then jsonb_build_object('lat', d.ubicacion_lat, 'lng', d.ubicacion_lng) else null end,
    'direccion_referencia', d.direccion_referencia,
    'zona', d.zona_nombre,
    'subtotal', o.total,
    'envio', d.tarifa_envio,
    'total', o.total + d.tarifa_envio,
    'metodo_pago', d.metodo_pago,
    'repartidor', v_repartidor,
    'factura', v_factura,
    'tiempo_estimado_min', v_config.tiempo_estimado_min,
    'velocidad_kmh', v_config.velocidad_moto_kmh,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', i.nombre_producto, 'cantidad', i.cantidad,
                                          'precio', i.precio_unitario) order by i.created_at)
        from public.orden_items i where i.orden_id = d.orden_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.seguimiento_pedido(text) from public;
grant execute on function public.seguimiento_pedido(text) to anon, authenticated;

-- ============================== 0025_rastro_gps.sql ==============================
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

-- ============================== 0026_liquidaciones_repartidor.sql ==============================
-- ============================================================================
-- Liquidación del repartidor al cerrar su turno: el sistema calcula lo que
-- debió cobrar en efectivo; el cajero anota lo que entregó en caja y la
-- diferencia queda registrada (con usuario y hora). Inmutable: sin UPDATE ni
-- DELETE. El cálculo SIEMPRE lo hace el servidor.
-- ============================================================================

create table public.liquidaciones_repartidor (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  sucursal_id               uuid not null references public.sucursales(id) on delete cascade,
  repartidor_id             uuid not null references public.repartidores(id),
  turno_fecha               date not null,
  turno_inicio              timestamptz,
  pedidos                   jsonb not null,
  total_pedidos             int not null check (total_pedidos > 0),
  total_efectivo_cobrado    numeric(12,2) not null,
  total_entregado_en_caja   numeric(12,2) not null check (total_entregado_en_caja >= 0),
  diferencia                numeric(12,2) not null, -- entregado - cobrado (negativo = faltante)
  total_pago_envios         numeric(12,2) not null default 0,
  notas                     text,
  cerrada_por               uuid references public.usuarios(id) on delete set null,
  cerrada_at                timestamptz not null default now()
);

create index liquidaciones_sucursal_fecha_idx on public.liquidaciones_repartidor(sucursal_id, cerrada_at);
create index liquidaciones_repartidor_idx on public.liquidaciones_repartidor(repartidor_id);

alter table public.ordenes_delivery
  add constraint ordenes_delivery_liquidacion_fk
  foreign key (liquidacion_id) references public.liquidaciones_repartidor(id);

alter table public.liquidaciones_repartidor enable row level security;

create policy liquidaciones_select on public.liquidaciones_repartidor
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
    and not public.fn_es_cocina()
  );
-- sin políticas de insert/update/delete: solo cerrar_liquidacion()

-- Quién puede liquidar a este repartidor: admin del negocio o cajero/mesero de su sucursal
create or replace function public.fn_puede_liquidar(p_repartidor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.repartidores r
     where r.id = p_repartidor
       and r.tenant_id = public.current_tenant_id()
       and (public.is_admin() or r.sucursal_id = public.current_sucursal_id())
       and not public.fn_es_cocina()
  )
$$;

revoke all on function public.fn_puede_liquidar(uuid) from public, anon;
grant execute on function public.fn_puede_liquidar(uuid) to authenticated;

-- Lo que el sistema dice que el repartidor debe (sin cerrar nada)
create or replace function public.calcular_liquidacion(p_repartidor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.repartidores;
  v_pedidos jsonb;
  v_n int;
  v_efectivo numeric(12,2);
begin
  if not public.fn_puede_liquidar(p_repartidor) then
    raise exception 'LIQUIDACION_SIN_PERMISO: no puedes liquidar a este repartidor';
  end if;
  select * into r from public.repartidores where id = p_repartidor;

  select coalesce(jsonb_agg(jsonb_build_object(
           'orden_id', d.orden_id, 'numero', o.numero_dia, 'cliente', d.cliente_nombre,
           'metodo_pago', d.metodo_pago, 'monto_cobrado', d.monto_cobrado,
           'tarifa_envio', d.tarifa_envio, 'entregado_at', d.entregado_at
         ) order by d.entregado_at), '[]'::jsonb),
         count(*),
         coalesce(sum(d.monto_cobrado) filter (where d.metodo_pago = 'efectivo'), 0)
    into v_pedidos, v_n, v_efectivo
    from public.ordenes_delivery d
    join public.ordenes o on o.id = d.orden_id
   where d.repartidor_id = p_repartidor
     and d.estado_delivery = 'entregado'
     and d.liquidacion_id is null;

  return jsonb_build_object(
    'repartidor_id', p_repartidor,
    'turno_inicio', r.turno_inicio,
    'pedidos', v_pedidos,
    'total_pedidos', v_n,
    'total_efectivo_cobrado', v_efectivo,
    'total_pago_envios', case when r.tipo_pago = 'por_entrega' then v_n * r.monto_por_entrega else 0 end,
    'pendientes_en_camino', (select count(*) from public.ordenes_delivery d
                              where d.repartidor_id = p_repartidor and d.estado_delivery = 'en_camino')
  );
end;
$$;

create or replace function public.cerrar_liquidacion(p_repartidor uuid, p_entregado numeric, p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.repartidores;
  c jsonb;
  v_id uuid;
  v_efectivo numeric(12,2);
  v_diferencia numeric(12,2);
begin
  c := public.calcular_liquidacion(p_repartidor); -- también valida permiso
  select * into r from public.repartidores where id = p_repartidor;

  if p_entregado is null or p_entregado < 0 then
    raise exception 'LIQUIDACION_MONTO: indica cuánto entregó en caja';
  end if;
  if (c ->> 'total_pedidos')::int = 0 then
    raise exception 'LIQUIDACION_VACIA: no hay pedidos entregados por liquidar';
  end if;
  if (c ->> 'pendientes_en_camino')::int > 0 then
    raise exception 'LIQUIDACION_PENDIENTES: todavía tiene pedidos en camino';
  end if;

  v_efectivo := (c ->> 'total_efectivo_cobrado')::numeric;
  v_diferencia := p_entregado - v_efectivo;

  insert into public.liquidaciones_repartidor (
    tenant_id, sucursal_id, repartidor_id, turno_fecha, turno_inicio, pedidos, total_pedidos,
    total_efectivo_cobrado, total_entregado_en_caja, diferencia, total_pago_envios, notas, cerrada_por
  ) values (
    r.tenant_id, r.sucursal_id, p_repartidor, public.fn_hoy_hn(), r.turno_inicio, c -> 'pedidos',
    (c ->> 'total_pedidos')::int, v_efectivo, p_entregado, v_diferencia,
    (c ->> 'total_pago_envios')::numeric, nullif(trim(p_notas), ''), auth.uid()
  ) returning id into v_id;

  update public.ordenes_delivery
     set liquidacion_id = v_id
   where repartidor_id = p_repartidor and estado_delivery = 'entregado' and liquidacion_id is null;

  update public.repartidores set turno_inicio = null where id = p_repartidor; -- cierra el turno

  return jsonb_build_object('id', v_id, 'total_efectivo_cobrado', v_efectivo,
                            'total_entregado_en_caja', p_entregado, 'diferencia', v_diferencia,
                            'total_pago_envios', (c ->> 'total_pago_envios')::numeric);
end;
$$;

revoke all on function public.calcular_liquidacion(uuid) from public, anon;
revoke all on function public.cerrar_liquidacion(uuid, numeric, text) from public, anon;
grant execute on function public.calcular_liquidacion(uuid) to authenticated;
grant execute on function public.cerrar_liquidacion(uuid, numeric, text) to authenticated;

-- ============================== 0027_delivery_rate_limit.sql ==============================
-- ============================================================================
-- Rate limiting del pedido público (por IP y por teléfono). No hay Redis: un
-- contador por ventana con upsert atómico. Solo lo llama el servidor con la
-- service role.
-- ============================================================================

create table public.delivery_rate_limit (
  clave    text not null,
  ventana  timestamptz not null,
  n        int not null default 0,
  primary key (clave, ventana)
);

alter table public.delivery_rate_limit enable row level security; -- sin políticas

-- true = puede pasar; false = se pasó del máximo en esta ventana
create or replace function public.delivery_rate_limit_hit(p_clave text, p_max int, p_ventana_seg int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana timestamptz := to_timestamp(floor(extract(epoch from now()) / p_ventana_seg) * p_ventana_seg);
  v_n int;
begin
  insert into public.delivery_rate_limit (clave, ventana, n)
  values (p_clave, v_ventana, 1)
  on conflict (clave, ventana) do update set n = delivery_rate_limit.n + 1
  returning n into v_n;

  -- limpieza oportunista de ventanas viejas
  if random() < 0.02 then
    delete from public.delivery_rate_limit where ventana < now() - interval '1 day';
  end if;
  return v_n <= p_max;
end;
$$;

revoke all on function public.delivery_rate_limit_hit(text, int, int) from public, anon, authenticated;

-- ============================== 0028_crear_pedido_delivery.sql ==============================
-- ============================================================================
-- Crear un pedido de delivery. TODO se recalcula aquí, en el servidor:
-- precios (de `productos`), tarifa (de la zona), disponibilidad, horario,
-- pausa y monto mínimo. Nada de lo que mande el navegador para dinero se usa.
--
-- La llaman:
--   * el menú público (canal delivery_web), por una server action con la
--     service role que antes aplica rate limit por IP y teléfono + honeypot;
--   * el personal del POS (canal delivery_telefono) con su sesión: puede tomar
--     pedidos aunque el delivery web esté pausado o fuera de horario.
--
-- p_pedido = {
--   nombre, telefono, zona_id, direccion_referencia, lat, lng,
--   metodo_pago, paga_con, tipo_factura, factura_nombre, factura_rtn,
--   comprobante_url, items: [{ producto_id, cantidad, nota }]
-- }
-- ============================================================================

create or replace function public.crear_pedido_delivery(p_sucursal uuid, p_canal text, p_pedido jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.delivery_config;
  v_sucursal public.sucursales;
  v_zona public.delivery_zonas;
  v_orden_id uuid := gen_random_uuid();
  v_usuario uuid := auth.uid();
  v_item jsonb;
  v_prod record;
  v_cant int;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2);
  v_metodo text := p_pedido ->> 'metodo_pago';
  v_paga_con numeric(10,2) := nullif(p_pedido ->> 'paga_con', '')::numeric;
  v_tipo_factura text := coalesce(nullif(p_pedido ->> 'tipo_factura', ''), 'consumidor_final');
  v_token text;
  v_numero int;
begin
  if p_canal not in ('delivery_web', 'delivery_telefono') then
    raise exception 'DELIVERY_CANAL: canal inválido';
  end if;

  select * into v_sucursal from public.sucursales where id = p_sucursal and activo;
  if not found then
    raise exception 'DELIVERY_CERRADO: este restaurante no está disponible';
  end if;
  select * into v_config from public.delivery_config where sucursal_id = p_sucursal;

  if p_canal = 'delivery_telefono' then
    -- solo personal operativo de ESA sucursal (o el admin del negocio)
    if public.current_tenant_id() is distinct from v_sucursal.tenant_id
       or not (public.is_admin() or public.current_sucursal_id() = p_sucursal)
       or public.fn_es_cocina() then
      raise exception 'DELIVERY_SIN_PERMISO: no puedes registrar pedidos de esta sucursal';
    end if;
    if v_config.sucursal_id is null then
      raise exception 'DELIVERY_CERRADO: el delivery no está configurado en esta sucursal';
    end if;
  else
    v_usuario := null;
    if v_config.sucursal_id is null or not v_config.activo then
      raise exception 'DELIVERY_CERRADO: este restaurante no recibe pedidos a domicilio por ahora';
    elsif v_config.pausado then
      raise exception 'DELIVERY_CERRADO: el restaurante pausó los pedidos por alta demanda. Intenta en unos minutos';
    elsif not public.delivery_abierto(p_sucursal) then
      raise exception 'DELIVERY_CERRADO: estamos fuera del horario de entrega a domicilio';
    end if;
  end if;

  -- ---- datos del cliente
  if length(trim(coalesce(p_pedido ->> 'nombre', ''))) = 0 then
    raise exception 'DELIVERY_DATOS: escribe tu nombre';
  end if;
  if coalesce(p_pedido ->> 'telefono', '') !~ '^[0-9]{8}$' then
    raise exception 'DELIVERY_DATOS: el teléfono debe tener 8 dígitos';
  end if;
  if length(trim(coalesce(p_pedido ->> 'direccion_referencia', ''))) < 5 then
    raise exception 'DELIVERY_DATOS: escribe una referencia de tu dirección (ej. portón negro, frente a la pulpería)';
  end if;
  if v_tipo_factura not in ('consumidor_final', 'con_rtn') then
    raise exception 'DELIVERY_DATOS: tipo de factura inválido';
  end if;
  if v_tipo_factura = 'con_rtn' and (
       coalesce(p_pedido ->> 'factura_rtn', '') !~ '^[0-9]{14}$'
       or length(trim(coalesce(p_pedido ->> 'factura_nombre', ''))) = 0) then
    raise exception 'DELIVERY_DATOS: para factura con RTN indica el nombre o razón social y el RTN de 14 dígitos';
  end if;

  -- ---- método de pago
  if v_metodo is null or not (v_metodo = any (v_config.metodos_pago)) then
    raise exception 'DELIVERY_PAGO: ese método de pago no está disponible';
  end if;

  -- ---- zona y tarifa (del servidor)
  select * into v_zona
    from public.delivery_zonas
   where id = nullif(p_pedido ->> 'zona_id', '')::uuid and sucursal_id = p_sucursal and activa;
  if not found then
    raise exception 'DELIVERY_ZONA: elige una zona de entrega válida';
  end if;

  -- ---- ítems: cada uno se valida contra el menú vigente
  if jsonb_typeof(p_pedido -> 'items') is distinct from 'array' or jsonb_array_length(p_pedido -> 'items') = 0 then
    raise exception 'DELIVERY_ITEMS: el carrito está vacío';
  end if;
  if jsonb_array_length(p_pedido -> 'items') > 60 then
    raise exception 'DELIVERY_ITEMS: demasiados productos en un solo pedido';
  end if;

  -- (todo lo que sigue es una sola transacción: si algo falla, no queda nada a medias)
  insert into public.ordenes (id, tenant_id, sucursal_id, mesa_id, usuario_id, estado, canal, cliente_nombre)
  values (v_orden_id, v_sucursal.tenant_id, p_sucursal, null, v_usuario, 'abierta', p_canal,
          left(trim(p_pedido ->> 'nombre'), 80));

  for v_item in select * from jsonb_array_elements(p_pedido -> 'items') loop
    select p.id, p.nombre, p.precio into v_prod
      from public.productos p
      join public.producto_sucursales ps on ps.producto_id = p.id and ps.sucursal_id = p_sucursal
     where p.id = nullif(v_item ->> 'producto_id', '')::uuid
       and p.tenant_id = v_sucursal.tenant_id and p.activo and p.disponible;
    if not found then
      raise exception 'DELIVERY_PRODUCTO: uno de los productos ya no está disponible. Actualiza el menú';
    end if;
    begin
      v_cant := (v_item ->> 'cantidad')::int;
    exception when others then
      v_cant := null;
    end;
    if v_cant is null or v_cant < 1 or v_cant > 50 then
      raise exception 'DELIVERY_ITEMS: cantidad inválida';
    end if;
    v_subtotal := v_subtotal + v_prod.precio * v_cant;
    insert into public.orden_items (orden_id, producto_id, nombre_producto, cantidad, precio_unitario, nota, origen_cliente)
    values (v_orden_id, v_prod.id, v_prod.nombre, v_cant, v_prod.precio,
            nullif(left(trim(coalesce(v_item ->> 'nota', '')), 200), ''), p_canal = 'delivery_web');
  end loop;

  if v_subtotal < v_config.monto_minimo then
    raise exception 'DELIVERY_MINIMO: el monto mínimo de pedido es L %', to_char(v_config.monto_minimo, 'FM999990.00');
  end if;

  v_total := v_subtotal + v_zona.tarifa;
  if v_metodo = 'efectivo' and v_paga_con is not null and v_paga_con < v_total then
    raise exception 'DELIVERY_PAGA_CON: con lo que pagas (L %) no alcanza para el total (L %)',
      to_char(v_paga_con, 'FM999990.00'), to_char(v_total, 'FM999990.00');
  end if;

  insert into public.ordenes_delivery (
    orden_id, cliente_nombre, cliente_telefono, direccion_referencia, ubicacion_lat, ubicacion_lng,
    zona_id, tarifa_envio, metodo_pago, paga_con, comprobante_transferencia_url,
    tipo_factura, factura_nombre, factura_rtn
  ) values (
    v_orden_id, left(trim(p_pedido ->> 'nombre'), 80), p_pedido ->> 'telefono',
    left(trim(p_pedido ->> 'direccion_referencia'), 300),
    nullif(p_pedido ->> 'lat', '')::double precision, nullif(p_pedido ->> 'lng', '')::double precision,
    v_zona.id, v_zona.tarifa, v_metodo,
    case when v_metodo = 'efectivo' then v_paga_con else null end,
    nullif(p_pedido ->> 'comprobante_url', ''),
    v_tipo_factura,
    case when v_tipo_factura = 'con_rtn' then left(trim(p_pedido ->> 'factura_nombre'), 120) else null end,
    case when v_tipo_factura = 'con_rtn' then p_pedido ->> 'factura_rtn' else null end
  ) returning tracking_token into v_token;

  select numero_dia into v_numero from public.ordenes where id = v_orden_id;

  return jsonb_build_object(
    'orden_id', v_orden_id, 'numero', v_numero, 'tracking_token', v_token,
    'subtotal', v_subtotal, 'envio', v_zona.tarifa, 'total', v_total
  );
end;
$$;

revoke all on function public.crear_pedido_delivery(uuid, text, jsonb) from public, anon;
grant execute on function public.crear_pedido_delivery(uuid, text, jsonb) to authenticated;

-- ============================== 0029_realtime_flota.sql ==============================
-- ============================================================================
-- Posición en vivo de los repartidores hacia el restaurante: canal PRIVADO de
-- Realtime broadcast `flota:<sucursal_id>`.
--   * envía (INSERT en realtime.messages): el repartidor de ESA sucursal;
--   * recibe (SELECT): el personal de esa sucursal (admin: todo el negocio),
--     nunca cocina ni otros negocios ni otros repartidores.
-- (El cliente final recibe la posición por el canal público pedido:<token>,
-- cuyo nombre secreto es el token de seguimiento.)
-- Las políticas se crean solo si existe realtime.messages (Supabase Realtime
-- Authorization); en una base sin Realtime se omiten.
-- ============================================================================

create or replace function public.fn_flota_autorizada(p_topic text, p_escribir boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sucursal uuid;
begin
  if p_topic is null or p_topic not like 'flota:%' then
    return false;
  end if;
  begin
    v_sucursal := substring(p_topic from 7)::uuid;
  exception when others then
    return false;
  end;

  if p_escribir then
    return exists (
      select 1 from public.repartidores r
       where r.id = public.current_repartidor_id() and r.sucursal_id = v_sucursal
    );
  end if;

  return exists (
    select 1 from public.sucursales s
     where s.id = v_sucursal
       and s.tenant_id = public.current_tenant_id()
       and (public.is_admin() or s.id = public.current_sucursal_id())
       and not public.fn_es_cocina()
  );
end;
$$;

revoke all on function public.fn_flota_autorizada(text, boolean) from public, anon;
grant execute on function public.fn_flota_autorizada(text, boolean) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists flota_recibir on realtime.messages';
    execute 'create policy flota_recibir on realtime.messages for select to authenticated
             using (public.fn_flota_autorizada(realtime.topic(), false))';
    execute 'drop policy if exists flota_enviar on realtime.messages';
    execute 'create policy flota_enviar on realtime.messages for insert to authenticated
             with check (public.fn_flota_autorizada(realtime.topic(), true))';
  end if;
end;
$$;

-- ============================== 0030_token_seguimiento_sin_pgcrypto.sql ==============================
-- ============================================================================
-- Corrección a 0024: el token de seguimiento usaba gen_random_bytes() (pgcrypto).
-- En Supabase pgcrypto vive en el esquema `extensions`, que NO está en el
-- search_path de crear_pedido_delivery (security definer, search_path = public):
-- el INSERT del pedido fallaría con "function gen_random_bytes does not exist".
-- gen_random_uuid() es del núcleo de Postgres (CSPRNG): dos uuid v4 dan
-- 64 caracteres hexadecimales con ~244 bits aleatorios, sin depender de nada.
-- ============================================================================

alter table public.ordenes_delivery
  alter column tracking_token
  set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

