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
