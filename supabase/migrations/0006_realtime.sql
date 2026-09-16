-- Sin esto, la app nunca recibía los eventos de Supabase Realtime a los que
-- se suscribe src/lib/offline/sync.ts (postgres_changes en mesas, ordenes,
-- orden_items, pagos): las tablas nunca se habían agregado a la publicación.
alter publication supabase_realtime add table public.mesas;
alter publication supabase_realtime add table public.ordenes;
alter publication supabase_realtime add table public.orden_items;
alter publication supabase_realtime add table public.pagos;
