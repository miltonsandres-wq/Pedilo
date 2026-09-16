-- ============================================================================
-- Configuración del negocio (logo, moneda, datos fiscales) + prerequisitos
-- para el layout de mesas con formas reales y el QR por mesa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tenants: datos de negocio que el admin configura desde /admin/configuracion
-- ----------------------------------------------------------------------------
alter table public.tenants
  add column if not exists logo_url text,
  add column if not exists rtn text,               -- registro tributario (opcional, Honduras)
  add column if not exists moneda text not null default 'L.',
  add column if not exists direccion text,
  add column if not exists telefono text,
  add column if not exists sitio_web text;

-- Antes solo había policy de SELECT: el admin necesita poder editar los
-- datos de SU propio tenant desde el panel de configuración.
create policy tenants_update on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id() and public.is_admin())
  with check (id = public.current_tenant_id() and public.is_admin());

-- ----------------------------------------------------------------------------
-- mesas: forma para el render visual (mesa+sillas reales) y token estable
-- para el QR de cada mesa (no correlativo, para no exponer conteo de mesas).
-- ----------------------------------------------------------------------------
alter table public.mesas
  add column if not exists forma text not null default 'cuadrada'
    check (forma in ('cuadrada', 'redonda')),
  add column if not exists qr_token uuid not null default gen_random_uuid() unique;

-- ----------------------------------------------------------------------------
-- Storage: bucket público para logos de negocio
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Las rutas se guardan como "<tenant_id>/logo.ext": cada admin solo puede
-- escribir dentro de la carpeta de su propio tenant. La lectura es pública
-- (bucket público) porque el logo se muestra en el menú del cliente vía QR,
-- que no tiene sesión.
create policy logos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'logos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'logos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'logos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
