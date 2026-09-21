-- ============================================================================
-- Pantalla de cocina (KDS): marca por orden, independiente de `estado`
-- (abierta/enviada/pagada/cancelada) para no tocar la lógica de cobro/mesa.
-- lista_cocina = true la pone el botón "Listo" de /cocina; enviarACocina()
-- la vuelve a poner en false si se agregan ítems nuevos a una orden que ya
-- estaba marcada lista (para que reaparezca en la pantalla).
-- ============================================================================

alter table public.ordenes add column if not exists lista_cocina boolean not null default false;
