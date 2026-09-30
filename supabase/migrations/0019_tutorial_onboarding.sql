-- ============================================================================
-- Tutorial de bienvenida (onboarding): se muestra a los negocios nuevos en el
-- panel de admin hasta que el dueño toca "Tutorial completado".
-- null = todavía no lo completó (se muestra); con fecha = ya no vuelve a salir.
-- ============================================================================
alter table public.tenants
  add column if not exists tutorial_completado_at timestamptz;

-- Los negocios que ya existen NO son nuevos: no se les muestra el tutorial.
update public.tenants
   set tutorial_completado_at = now()
 where tutorial_completado_at is null;
