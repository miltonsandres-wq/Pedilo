-- Solicitudes de anulación: el cajero pide anular una venta (factura con CAI o cobro sin CAI) y
-- explica por qué; la anulación NO se hace hasta que el administrador la aprueba (indicando su razón)
-- o la rechaza. Al aprobar una factura con CAI, el servidor la marca «anulada» (conserva su número).
--
-- orden_id y documento_id NO son llaves foráneas a propósito: la caja trabaja sin internet y la
-- factura/orden puede no haber llegado todavía al servidor cuando el cajero hace la solicitud.
create table public.solicitudes_anulacion (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  sucursal_id    uuid not null references public.sucursales(id) on delete cascade,
  orden_id       uuid not null,
  documento_id   uuid, -- factura con CAI (null = cobro sin CAI)
  referencia     text not null, -- «001-001-01-00000042» u «Orden #12»
  monto          numeric(12,2) not null check (monto >= 0),
  motivo         text not null check (btrim(motivo) <> ''),
  solicitada_por uuid references public.usuarios(id) on delete set null,
  estado         text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  respuesta      text, -- razón del administrador
  resuelta_por   uuid references public.usuarios(id) on delete set null,
  resuelta_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint solicitudes_anulacion_resuelta check (estado = 'pendiente' or resuelta_at is not null),
  constraint solicitudes_anulacion_rechazo_con_razon check (estado <> 'rechazada' or btrim(coalesce(respuesta, '')) <> '')
);

-- Una sola solicitud pendiente por orden (no se pueden apilar)
create unique index solicitudes_anulacion_una_pendiente
  on public.solicitudes_anulacion (orden_id) where estado = 'pendiente';
create index solicitudes_anulacion_tenant_idx on public.solicitudes_anulacion (tenant_id, estado, created_at desc);
create index solicitudes_anulacion_documento_idx on public.solicitudes_anulacion (documento_id);

alter table public.solicitudes_anulacion enable row level security;

-- El admin ve las de todo su negocio; cajero/mesero solo las de su sucursal
create policy solicitudes_anulacion_select on public.solicitudes_anulacion
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

-- Pedirla: admin o cajero, siempre «pendiente» y a su nombre
create policy solicitudes_anulacion_insert on public.solicitudes_anulacion
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or (public.current_rol() = 'cajero' and sucursal_id = public.current_sucursal_id()))
    and estado = 'pendiente'
    and solicitada_por = auth.uid()
    and resuelta_por is null
  );

-- Resolverla (aprobar / rechazar): SOLO el administrador
create policy solicitudes_anulacion_update on public.solicitudes_anulacion
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

-- Nunca se borran: son el historial de por qué se anuló (o no) cada venta
revoke delete on public.solicitudes_anulacion from authenticated;
