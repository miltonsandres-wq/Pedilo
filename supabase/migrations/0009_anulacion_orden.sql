-- Motivo opcional que registra el cajero/mesero al anular una orden
-- (ver `estado = 'cancelada'` / `cancelada_at`, ya existentes desde 0001).
-- Puramente informativo para el historial/reportes, no cambia RLS: las
-- políticas de `ordenes_update` ya permiten este update (cualquier columna)
-- al staff de la sucursal, y `orden_items_delete` ya permite borrar ítems.
alter table public.ordenes add column motivo_cancelacion text;
