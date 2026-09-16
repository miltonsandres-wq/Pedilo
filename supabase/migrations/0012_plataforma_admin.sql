-- ============================================================================
-- Panel de plataforma: control de suscripción por tenant + super-admins.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- tenants: plan, límite de sucursales y estado de suscripción.
-- ----------------------------------------------------------------------------
alter table public.tenants
  add column if not exists plan text not null default 'plan_1'
    check (plan in ('plan_1', 'plan_2', 'compra_unica', 'personalizado')),
  add column if not exists max_sucursales integer not null default 1,
  add column if not exists precio_mensual numeric(10, 2),
  add column if not exists suscripcion_estado text not null default 'prueba'
    check (suscripcion_estado in ('prueba', 'activa', 'suspendida')),
  add column if not exists prueba_vence_el timestamptz,
  add column if not exists suscripcion_vence_el timestamptz,
  add column if not exists notas_admin text;

comment on column public.tenants.plan is 'plan_1 (1 sucursal, L900), plan_2 (2 sucursales, L1200), compra_unica o personalizado (precio/límite a mano).';
comment on column public.tenants.suscripcion_estado is 'prueba: 15 días desde el registro. activa: al día, vence en suscripcion_vence_el. suspendida: acceso cortado a mano.';

-- Los tenants que ya existían antes de este cambio (creados por fuera del
-- registro público) quedan activos de una vez — una migración no debe cortar
-- el acceso de nadie. Su plan/límite se ajusta a las sucursales que ya tienen.
update public.tenants t
set
  suscripcion_estado = 'activa',
  suscripcion_vence_el = now() + interval '1 month',
  max_sucursales = greatest(1, (select count(*) from public.sucursales s where s.tenant_id = t.id)),
  plan = case when (select count(*) from public.sucursales s where s.tenant_id = t.id) <= 1 then 'plan_1' else 'plan_2' end,
  precio_mensual = case when (select count(*) from public.sucursales s where s.tenant_id = t.id) <= 1 then 900 else 1200 end;

-- ----------------------------------------------------------------------------
-- plataforma_admins: quién puede entrar al panel de super-admin (/plataforma).
-- Sin políticas de RLS a propósito — nunca se lee/escribe con la clave anon,
-- solo con la service_role key desde código de servidor de confianza (ver
-- requireSuperAdmin() en src/lib/auth/session.ts). RLS habilitado sin
-- políticas = deny-all para anon/authenticated; la service_role la salta.
-- ----------------------------------------------------------------------------
create table public.plataforma_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.plataforma_admins enable row level security;

-- ----------------------------------------------------------------------------
-- formas_pago_plataforma: cómo te pagan tus clientes — se muestra en la
-- pantalla de suscripción vencida/suspendida. Mismo criterio: solo service_role.
-- ----------------------------------------------------------------------------
create table public.formas_pago_plataforma (
  id           uuid primary key default gen_random_uuid(),
  descripcion  text not null,
  orden        integer not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);
alter table public.formas_pago_plataforma enable row level security;
