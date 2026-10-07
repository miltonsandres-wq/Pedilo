-- El módulo de delivery lo habilita la plataforma (super admin) negocio por negocio.
-- Mientras no esté habilitado, el negocio no ve nada de delivery: ni en el panel, ni en el POS,
-- ni el menú público de pedidos, ni la app del repartidor.
alter table public.tenants
  add column if not exists delivery_habilitado boolean not null default false;

comment on column public.tenants.delivery_habilitado is
  'true = la plataforma habilitó el módulo de delivery para este negocio (se activa desde /plataforma).';
