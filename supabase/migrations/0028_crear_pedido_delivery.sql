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
