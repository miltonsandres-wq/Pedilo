-- Cierre diario: el administrador «cierra» un día de una sucursal desde Reportes. Queda una foto
-- (snapshot) de lo cobrado ese día —facturado, no facturado, anulado y cada método de pago— que ya
-- no cambia, y de ahí salen los reportes en Excel. Un solo cierre por sucursal y día.
create table public.cierres_diarios (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  sucursal_id  uuid not null references public.sucursales(id) on delete cascade,
  fecha        date not null, -- día cerrado (hora de Honduras)
  total_cobrado numeric(12,2) not null default 0,
  total_ordenes integer not null default 0,
  datos        jsonb not null, -- foto completa del cierre (por método de pago, separado, delivery, más vendidos)
  notas        text,
  cerrado_por  uuid references public.usuarios(id) on delete set null,
  cerrado_at   timestamptz not null default now(),
  unique (sucursal_id, fecha)
);

create index cierres_diarios_tenant_fecha_idx on public.cierres_diarios (tenant_id, fecha desc);

alter table public.cierres_diarios enable row level security;

-- Solo el administrador de su negocio los ve, los crea y nadie los modifica ni los borra
create policy cierres_diarios_select on public.cierres_diarios
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

create policy cierres_diarios_insert on public.cierres_diarios
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_admin()
    and cerrado_por = auth.uid()
  );

revoke update, delete on public.cierres_diarios from authenticated;
