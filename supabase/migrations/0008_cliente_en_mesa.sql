-- Separación de roles en el flujo de orden: el cajero "abre" la mesa con el
-- nombre del cliente (recibe/sienta) y el mesero llega a tomar el pedido.
-- Guardamos quién está sentado ahí para que el mesero sepa a quién atiende.
alter table public.ordenes
  add column if not exists cliente_nombre text,
  add column if not exists personas int;
