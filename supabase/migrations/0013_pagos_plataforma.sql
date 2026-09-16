-- ============================================================================
-- Registro de pagos de la plataforma: ingresos por tenant (mensualidades y
-- compras únicas), para el dashboard de /plataforma/ingresos.
-- ============================================================================
create table public.pagos_plataforma (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  monto        numeric(10, 2) not null,
  tipo         text not null check (tipo in ('mensual', 'compra_unica', 'otro')),
  fecha_pago   date not null default current_date,
  notas        text,
  created_at   timestamptz not null default now()
);

create index pagos_plataforma_tenant_id_idx on public.pagos_plataforma(tenant_id);
create index pagos_plataforma_fecha_pago_idx on public.pagos_plataforma(fecha_pago);

comment on table public.pagos_plataforma is 'Ingresos: un registro por cada pago recibido (mensualidad renovada o compra única). Alimenta el dashboard de /plataforma/ingresos.';

-- Sin políticas de RLS a propósito, mismo criterio que plataforma_admins y
-- formas_pago_plataforma: solo se toca con la service_role key desde
-- /plataforma (ver requireSuperAdmin() en src/lib/auth/session.ts).
alter table public.pagos_plataforma enable row level security;
