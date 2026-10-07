-- Platos del día: el dueño marca un producto como «plato del día» y vale SOLO para esa fecha
-- (hora de Honduras). Al día siguiente deja de aparecer solo, sin tener que desmarcarlo.
alter table public.productos
  add column if not exists plato_dia_fecha date;

comment on column public.productos.plato_dia_fecha is
  'Fecha (hora de Honduras) en que el producto es plato del día. Es plato del día solo si coincide con hoy.';
