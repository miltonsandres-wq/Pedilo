-- Salvaguarda a nivel de datos, mismo patrón que fn_pagos_after_insert (ver
-- 0001_schema.sql): si una orden pasa a 'cancelada', su mesa vuelve a
-- 'libre' en el servidor aunque el segundo write del outbox del cliente
-- (mesas.estado, encolado por separado) nunca llegue a sincronizar — por
-- ejemplo si el navegador se cierra justo después de anular la orden.
create or replace function public.fn_ordenes_after_update_cancelada()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    update public.mesas set estado = 'libre' where id = new.mesa_id;
  end if;
  return new;
end;
$$;

create trigger trg_ordenes_after_update_cancelada
  after update on public.ordenes
  for each row execute function public.fn_ordenes_after_update_cancelada();
