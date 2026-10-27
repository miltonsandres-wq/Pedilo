-- ============================================================================
-- 0038: «dar de baja» un rango CAI ya usado + tomar la caja sin pasar por el admin
--
--  * Un rango cargado por error que ya emitió documentos no se puede borrar
--    (esos documentos son fiscales), pero sí dejar de usarlo: estado 'baja'.
--    Nunca se activa solo ni se usa para emitir; sigue ocupando sus números.
--  * vincular_dispositivo(p_forzar): el cajero de la sucursal puede quedarse con
--    la caja aunque otro equipo la tuviera (cambio de equipo, reinstalación),
--    sin esperar a que el administrador la libere.
-- ============================================================================

alter table public.cai_rangos drop constraint if exists cai_rangos_estado_check;
alter table public.cai_rangos
  add constraint cai_rangos_estado_check
  check (estado in ('pendiente', 'activo', 'agotado', 'vencido', 'baja'));

drop function if exists public.vincular_dispositivo(uuid, uuid);

create or replace function public.vincular_dispositivo(p_id uuid, p_token uuid, p_forzar boolean default false)
returns public.dispositivos_pos
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dispositivos_pos;
  v_hash text := encode(sha256(convert_to(p_token::text, 'utf8')), 'hex');
begin
  select * into d from public.dispositivos_pos where id = p_id;

  if not found
     or d.tenant_id <> public.current_tenant_id()
     or not d.activo
     or not (public.is_admin() or d.sucursal_id = public.current_sucursal_id())
  then
    raise exception 'DISPOSITIVO_NO_DISPONIBLE';
  end if;

  if d.vinculo_hash is not null and d.vinculo_hash <> v_hash and not p_forzar then
    raise exception 'DISPOSITIVO_YA_VINCULADO';
  end if;

  update public.dispositivos_pos
     set vinculo_hash = v_hash,
         vinculado_at = case when d.vinculo_hash is distinct from v_hash then now() else coalesce(vinculado_at, now()) end
   where id = p_id
   returning * into d;

  return d;
end;
$$;

revoke all on function public.vincular_dispositivo(uuid, uuid, boolean) from public;
grant execute on function public.vincular_dispositivo(uuid, uuid, boolean) to authenticated;
