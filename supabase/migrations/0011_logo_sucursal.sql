-- Logo propio por sucursal (opcional): si una sucursal no tiene el suyo,
-- el menú del QR sigue mostrando el logo general del negocio (tenants.logo_url,
-- ver 0004_config_negocio.sql). Reutiliza el mismo bucket "logos" — la policy
-- de storage ya solo exige que la ruta empiece con "<tenant_id>/...", así que
-- no hace falta tocar RLS de storage para guardar el logo de una sucursal ahí.
alter table public.sucursales add column logo_url text;
