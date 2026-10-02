-- ============================================================================
-- Forma de pago «delivery_externo»: el pedido lo reparte una empresa externa
-- (la que cobra al cliente). El cajero cobra la orden con esta forma de pago:
-- NO se emite factura CAI (solo un recibo no fiscal) y el cierre diario la
-- muestra aparte de efectivo / tarjeta / transferencia.
-- ============================================================================

alter table public.pagos drop constraint if exists pagos_forma_pago_check;
alter table public.pagos
  add constraint pagos_forma_pago_check
  check (forma_pago in ('efectivo', 'tarjeta', 'transferencia', 'delivery_externo'));

alter table public.formas_pago_sucursal drop constraint if exists formas_pago_sucursal_forma_pago_check;
alter table public.formas_pago_sucursal
  add constraint formas_pago_sucursal_forma_pago_check
  check (forma_pago in ('efectivo', 'tarjeta', 'transferencia', 'delivery_externo'));
