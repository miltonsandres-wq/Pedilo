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
