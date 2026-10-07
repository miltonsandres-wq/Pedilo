-- Mensaje del flyer imprimible del QR de las mesas: lo edita el dueño por sucursal.
-- null = se usa el mensaje por defecto.
alter table public.sucursales
  add column if not exists mensaje_flyer text
    check (mensaje_flyer is null or char_length(mensaje_flyer) <= 80);

comment on column public.sucursales.mensaje_flyer is
  'Mensaje llamativo del flyer del QR (máx. 80 caracteres). null = mensaje por defecto.';
