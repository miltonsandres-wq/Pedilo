-- ============================================================================
-- Ajustes: contraseña visible para el admin, caja automática por sucursal y
-- configuración inicial (onboarding) del negocio
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Contraseña que el admin puede volver a ver. NO se guarda en texto plano:
--    la app la cifra (AES-256-GCM) antes de escribirla y solo la descifra en el
--    servidor cuando un admin del mismo negocio pulsa "Ver contraseña".
-- ----------------------------------------------------------------------------
alter table public.usuarios
  add column if not exists clave_cifrada text;

-- ----------------------------------------------------------------------------
-- 2) Cada sucursal tiene UNA caja de cobro (punto de emisión) creada sola:
--    la mayoría de los negocios factura desde una sola caja por local, así que
--    el admin ya no tiene que crearla. Establecimiento: 000 la primera
--    sucursal (casa matriz), 001 la segunda, etc.; punto de emisión 001.
-- ----------------------------------------------------------------------------
create or replace function public.fn_sucursal_crea_caja()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.dispositivos_pos (tenant_id, sucursal_id, nombre, establecimiento, punto_emision)
  values (
    new.tenant_id,
    new.id,
    'Caja principal',
    lpad((select count(*) from public.dispositivos_pos where tenant_id = new.tenant_id)::text, 3, '0'),
    '001'
  )
  on conflict do nothing;
  return null;
end;
$$;

create trigger trg_sucursales_crea_caja
  after insert on public.sucursales
  for each row execute function public.fn_sucursal_crea_caja();

-- Las sucursales que ya existen sin caja reciben la suya
insert into public.dispositivos_pos (tenant_id, sucursal_id, nombre, establecimiento, punto_emision)
select
  s.tenant_id,
  s.id,
  'Caja principal',
  lpad(
    ((select count(*) from public.dispositivos_pos d where d.tenant_id = s.tenant_id)
      + row_number() over (partition by s.tenant_id order by s.created_at, s.id) - 1)::text,
    3, '0'
  ),
  '001'
from public.sucursales s
where not exists (select 1 from public.dispositivos_pos d where d.sucursal_id = s.id)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 3) Configuración inicial del negocio (datos, logo, CAI). null = un negocio
--    nuevo que todavía no pasa por ella (el panel lo lleva a completarla).
-- ----------------------------------------------------------------------------
alter table public.tenants
  add column if not exists configuracion_inicial_at timestamptz;

-- Los negocios que ya existen NO son nuevos: no se les pide.
update public.tenants
   set configuracion_inicial_at = now()
 where configuracion_inicial_at is null;
