-- ============================================================================
-- Rate limiting del pedido público (por IP y por teléfono). No hay Redis: un
-- contador por ventana con upsert atómico. Solo lo llama el servidor con la
-- service role.
-- ============================================================================

create table public.delivery_rate_limit (
  clave    text not null,
  ventana  timestamptz not null,
  n        int not null default 0,
  primary key (clave, ventana)
);

alter table public.delivery_rate_limit enable row level security; -- sin políticas

-- true = puede pasar; false = se pasó del máximo en esta ventana
create or replace function public.delivery_rate_limit_hit(p_clave text, p_max int, p_ventana_seg int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana timestamptz := to_timestamp(floor(extract(epoch from now()) / p_ventana_seg) * p_ventana_seg);
  v_n int;
begin
  insert into public.delivery_rate_limit (clave, ventana, n)
  values (p_clave, v_ventana, 1)
  on conflict (clave, ventana) do update set n = delivery_rate_limit.n + 1
  returning n into v_n;

  -- limpieza oportunista de ventanas viejas
  if random() < 0.02 then
    delete from public.delivery_rate_limit where ventana < now() - interval '1 day';
  end if;
  return v_n <= p_max;
end;
$$;

revoke all on function public.delivery_rate_limit_hit(text, int, int) from public, anon, authenticated;
