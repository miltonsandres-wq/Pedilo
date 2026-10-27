-- ============================================================================
-- 0039: datos de la venta en la factura (cajero, quién atendió, mesa/lugar, # de
-- orden y formas de pago), como en cualquier factura de restaurante.
--
--  * documentos_fiscales.detalle_venta: se congela al emitir (igual que el emisor
--    y el rango) para reimprimir la factura idéntica. Nullable: las facturas
--    anteriores no lo tienen y se imprimen como siempre.
--  * Cada usuario puede ver los nombres de sus compañeros de la MISMA sucursal
--    (hasta ahora solo el suyo): el POS los necesita para imprimir «Cajero» y
--    «Atendió» aunque quien cobra no sea quien tomó el pedido.
-- ============================================================================

alter table public.documentos_fiscales add column if not exists detalle_venta jsonb;

drop policy if exists usuarios_select_misma_sucursal on public.usuarios;
create policy usuarios_select_misma_sucursal on public.usuarios
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and sucursal_id is not null
    and sucursal_id = public.current_sucursal_id()
  );
