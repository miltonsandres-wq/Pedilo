-- Storage: bucket público para fotos de producto subidas como archivo (la
-- otra opción, pegar una URL externa, no necesita storage propio).
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do nothing;

-- Mismo patrón que el bucket "logos": cada admin solo escribe dentro de la
-- carpeta de su propio tenant ("<tenant_id>/archivo.ext"); lectura pública
-- porque las fotos se ven en el menú del cliente (QR), sin sesión.
create policy productos_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'productos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy productos_fotos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'productos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

create policy productos_fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'productos'
    and public.is_admin()
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
