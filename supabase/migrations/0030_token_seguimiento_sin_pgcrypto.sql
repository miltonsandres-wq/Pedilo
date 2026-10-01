-- ============================================================================
-- Corrección a 0024: el token de seguimiento usaba gen_random_bytes() (pgcrypto).
-- En Supabase pgcrypto vive en el esquema `extensions`, que NO está en el
-- search_path de crear_pedido_delivery (security definer, search_path = public):
-- el INSERT del pedido fallaría con "function gen_random_bytes does not exist".
-- gen_random_uuid() es del núcleo de Postgres (CSPRNG): dos uuid v4 dan
-- 64 caracteres hexadecimales con ~244 bits aleatorios, sin depender de nada.
-- ============================================================================

alter table public.ordenes_delivery
  alter column tracking_token
  set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
