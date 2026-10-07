-- 1) «Ticket sin factura»: el dueño lo activa para el negocio (tenants) y además lo puede usar solo
--    quien tenga el permiso (usuarios). En la orden queda marcado cuando se cobró así.
alter table public.tenants
  add column if not exists ticket_sin_factura_activo boolean not null default false;
alter table public.usuarios
  add column if not exists puede_ticket_sin_factura boolean not null default false;
alter table public.ordenes
  add column if not exists ticket_sin_factura boolean not null default false;

comment on column public.tenants.ticket_sin_factura_activo is
  'true = el dueño permite cobrar con «ticket sin factura» en este negocio (si no, solo se factura).';
comment on column public.usuarios.puede_ticket_sin_factura is
  'true = este usuario puede cobrar con «ticket sin factura» (además de que el negocio lo tenga activo).';
comment on column public.ordenes.ticket_sin_factura is
  'true = la orden se cobró con ticket sin factura (no tiene factura con CAI).';

-- 2) Canal del pedido, que se elige al CREAR el pedido (no al cobrar):
--    local = salón, para_llevar, delivery_web / delivery_telefono = delivery, plataforma = Pedidos Ya, etc.
alter table public.ordenes drop constraint if exists ordenes_canal_check;
alter table public.ordenes
  add constraint ordenes_canal_check
  check (canal in ('local', 'para_llevar', 'delivery_web', 'delivery_telefono', 'plataforma'));

-- Empresa de reparto / # de pedido cuando el canal es «plataforma»
alter table public.ordenes
  add column if not exists referencia_externa text;
