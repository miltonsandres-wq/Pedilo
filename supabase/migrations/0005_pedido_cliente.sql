-- Marca los ítems que entraron solos desde el menú público (QR de la mesa),
-- para que el mesero los distinga de lo que él mismo tecleó.
alter table public.orden_items
  add column if not exists origen_cliente boolean not null default false;
