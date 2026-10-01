-- ============================================================================
-- Posición en vivo de los repartidores hacia el restaurante: canal PRIVADO de
-- Realtime broadcast `flota:<sucursal_id>`.
--   * envía (INSERT en realtime.messages): el repartidor de ESA sucursal;
--   * recibe (SELECT): el personal de esa sucursal (admin: todo el negocio),
--     nunca cocina ni otros negocios ni otros repartidores.
-- (El cliente final recibe la posición por el canal público pedido:<token>,
-- cuyo nombre secreto es el token de seguimiento.)
-- Las políticas se crean solo si existe realtime.messages (Supabase Realtime
-- Authorization); en una base sin Realtime se omiten.
-- ============================================================================

create or replace function public.fn_flota_autorizada(p_topic text, p_escribir boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sucursal uuid;
begin
  if p_topic is null or p_topic not like 'flota:%' then
    return false;
  end if;
  begin
    v_sucursal := substring(p_topic from 7)::uuid;
  exception when others then
    return false;
  end;

  if p_escribir then
    return exists (
      select 1 from public.repartidores r
       where r.id = public.current_repartidor_id() and r.sucursal_id = v_sucursal
    );
  end if;

  return exists (
    select 1 from public.sucursales s
     where s.id = v_sucursal
       and s.tenant_id = public.current_tenant_id()
       and (public.is_admin() or s.id = public.current_sucursal_id())
       and not public.fn_es_cocina()
  );
end;
$$;

revoke all on function public.fn_flota_autorizada(text, boolean) from public, anon;
grant execute on function public.fn_flota_autorizada(text, boolean) to authenticated;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists flota_recibir on realtime.messages';
    execute 'create policy flota_recibir on realtime.messages for select to authenticated
             using (public.fn_flota_autorizada(realtime.topic(), false))';
    execute 'drop policy if exists flota_enviar on realtime.messages';
    execute 'create policy flota_enviar on realtime.messages for insert to authenticated
             with check (public.fn_flota_autorizada(realtime.topic(), true))';
  end if;
end;
$$;
