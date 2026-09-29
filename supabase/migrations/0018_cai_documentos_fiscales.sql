-- ============================================================================
-- Facturación fiscal: rangos CAI + documentos fiscales inmutables
-- ============================================================================
-- Principios:
--   * El correlativo lo asigna el DISPOSITIVO (offline-first). El servidor NO
--     asigna números: los VALIDA al sincronizar (rango, fecha, duplicado) y
--     registra un incidente si algo no cuadra, en vez de descartar en silencio.
--   * documentos_fiscales solo se escribe por RPC (sincronizar_documento_fiscal)
--     y es inmutable: nunca DELETE, y el único UPDATE posible es
--     emitida -> anulada (anular_documento_fiscal).
-- ============================================================================

create extension if not exists btree_gist;

-- "Hoy" en Honduras (UTC-6 fijo, sin horario de verano). Los rangos vencen al
-- final del día LOCAL de su fecha límite.
create or replace function public.fn_hoy_hn()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Tegucigalpa')::date
$$;

-- ----------------------------------------------------------------------------
-- cai_rangos
-- ----------------------------------------------------------------------------
create table public.cai_rangos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  sucursal_id      uuid not null references public.sucursales(id) on delete cascade,
  establecimiento  char(3) not null check (establecimiento ~ '^[0-9]{3}$'),
  punto_emision    char(3) not null check (punto_emision ~ '^[0-9]{3}$'),
  tipo_doc         char(2) not null check (tipo_doc ~ '^[0-9]{2}$'),
  -- Qué es este tipo de documento. Los códigos de nota de crédito/débito NO se
  -- hardcodean: el admin los define aquí al cargar el rango que le dio el SAR.
  clase            text not null default 'factura'
                     check (clase in ('factura', 'nota_credito', 'nota_debito')),
  cai              varchar(37) not null
                     check (cai ~ '^[0-9A-F]{6}(-[0-9A-F]{6}){4}-[0-9A-F]{2}$'),
  desde            int not null check (desde >= 1),
  hasta            int not null,
  siguiente        int not null,
  fecha_limite     date not null,
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'activo', 'agotado', 'vencido')),
  dispositivo_id   uuid references public.dispositivos_pos(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint cai_rangos_desde_hasta check (desde <= hasta),
  constraint cai_rangos_siguiente_en_rango check (siguiente >= desde and siguiente <= hasta + 1),
  -- Sin traslape con otros rangos del mismo punto y tipo
  constraint cai_rangos_sin_traslape exclude using gist (
    tenant_id with =,
    establecimiento with =,
    punto_emision with =,
    tipo_doc with =,
    int4range(desde, hasta, '[]') with &&
  )
);

-- Solo UN rango activo por (tenant, establecimiento, punto, tipo)
create unique index cai_rangos_un_activo
  on public.cai_rangos (tenant_id, establecimiento, punto_emision, tipo_doc)
  where estado = 'activo';

create index cai_rangos_sucursal_id_idx on public.cai_rangos(sucursal_id);
create index cai_rangos_dispositivo_id_idx on public.cai_rangos(dispositivo_id);

-- ----------------------------------------------------------------------------
-- documentos_fiscales (inmutables)
-- ----------------------------------------------------------------------------
create table public.documentos_fiscales (
  id                       uuid primary key, -- lo genera el dispositivo (offline)
  tenant_id                uuid not null references public.tenants(id) on delete cascade,
  sucursal_id              uuid not null references public.sucursales(id),
  orden_id                 uuid not null references public.ordenes(id),
  dispositivo_id           uuid references public.dispositivos_pos(id) on delete set null,
  rango_id                 uuid references public.cai_rangos(id) on delete set null,
  usuario_id               uuid references public.usuarios(id) on delete set null,
  clase                    text not null default 'factura'
                             check (clase in ('factura', 'nota_credito', 'nota_debito')),
  tipo_doc                 char(2) not null,
  establecimiento          char(3) not null,
  punto_emision            char(3) not null,
  correlativo              int not null check (correlativo >= 1),
  numero_completo          text not null,
  -- SNAPSHOT del rango y del emisor al momento de emitir (no solo FK): el
  -- documento debe poder reimprimirse idéntico aunque luego cambien los datos.
  cai                      varchar(37) not null,
  rango_desde              int not null,
  rango_hasta              int not null,
  fecha_limite             date not null,
  fecha_emision            timestamptz not null,
  emisor_snapshot          jsonb not null,
  cliente_nombre           text not null default 'Consumidor Final',
  cliente_rtn              text check (cliente_rtn is null or cliente_rtn ~ '^[0-9]{14}$'),
  no_orden_compra_exenta   text,
  no_constancia_exonerado  text,
  no_registro_sag          text,
  importe_exonerado        numeric(12,2) not null default 0,
  importe_exento           numeric(12,2) not null default 0,
  gravado_15               numeric(12,2) not null default 0,
  gravado_18               numeric(12,2) not null default 0,
  isv_15                   numeric(12,2) not null default 0,
  isv_18                   numeric(12,2) not null default 0,
  cargo_servicio           numeric(12,2) not null default 0,
  total                    numeric(12,2) not null check (total >= 0),
  total_letras             text not null,
  lineas                   jsonb not null,
  estado                   text not null default 'emitida' check (estado in ('emitida', 'anulada')),
  anulada_motivo           text,
  anulada_at               timestamptz,
  anulada_por              uuid references public.usuarios(id) on delete set null,
  documento_referencia_id  uuid references public.documentos_fiscales(id),
  created_at               timestamptz not null default now(),
  unique (tenant_id, establecimiento, punto_emision, tipo_doc, correlativo),
  -- base + ISV + cargo tiene que cuadrar EXACTO con el total
  constraint documentos_fiscales_total_cuadra check (
    total = importe_exonerado + importe_exento + gravado_15 + gravado_18
            + isv_15 + isv_18 + cargo_servicio
  ),
  constraint documentos_fiscales_nota_referencia check (
    clase = 'factura' or documento_referencia_id is not null
  ),
  constraint documentos_fiscales_anulada_motivo check (
    estado = 'emitida' or (anulada_motivo is not null and anulada_at is not null)
  )
);

-- Una factura vigente por orden (si se anula, se puede volver a facturar)
create unique index documentos_fiscales_una_factura_por_orden
  on public.documentos_fiscales (orden_id)
  where clase = 'factura' and estado = 'emitida';

create index documentos_fiscales_tenant_fecha_idx on public.documentos_fiscales(tenant_id, fecha_emision);
create index documentos_fiscales_sucursal_id_idx on public.documentos_fiscales(sucursal_id);
create index documentos_fiscales_orden_id_idx on public.documentos_fiscales(orden_id);

-- ----------------------------------------------------------------------------
-- incidentes_fiscales: lo que el servidor rechazó al sincronizar (duplicado,
-- fuera de rango, fecha vencida...). Nunca se descarta en silencio.
-- ----------------------------------------------------------------------------
create table public.incidentes_fiscales (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  sucursal_id     uuid references public.sucursales(id) on delete set null,
  dispositivo_id  uuid references public.dispositivos_pos(id) on delete set null,
  tipo            text not null,
  detalle         text not null,
  payload         jsonb,
  resuelto        boolean not null default false,
  created_at      timestamptz not null default now()
);

create index incidentes_fiscales_tenant_idx on public.incidentes_fiscales(tenant_id, resuelto);

-- ============================================================================
-- Triggers: cai_rangos
-- ============================================================================
create or replace function public.fn_cai_rangos_before_write()
returns trigger
language plpgsql
as $$
declare
  d public.dispositivos_pos;
begin
  if tg_op = 'DELETE' then
    if old.siguiente > old.desde then
      raise exception 'FISCAL_RANGO_EN_USO: el rango ya emitió documentos y no se puede borrar';
    end if;
    return old;
  end if;

  new.cai := upper(btrim(new.cai));

  if not exists (
    select 1 from public.sucursales s where s.id = new.sucursal_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'FISCAL_SUCURSAL_INVALIDA: la sucursal no pertenece al negocio';
  end if;

  if new.dispositivo_id is not null then
    select * into d from public.dispositivos_pos where id = new.dispositivo_id;
    if not found
       or d.tenant_id <> new.tenant_id
       or d.sucursal_id <> new.sucursal_id
       or d.establecimiento <> new.establecimiento
       or d.punto_emision <> new.punto_emision
    then
      raise exception 'FISCAL_DISPOSITIVO_INCONSISTENTE: el dispositivo no corresponde a este establecimiento/punto de emisión';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.siguiente := new.desde;
    if new.fecha_limite < public.fn_hoy_hn() then
      new.estado := 'vencido';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.siguiente < old.siguiente then
    raise exception 'FISCAL_CORRELATIVO_RETROCEDE: el siguiente correlativo nunca puede bajar';
  end if;
  -- Solo el servidor (triggers SECURITY DEFINER) mueve el contador; un admin
  -- editándolo a mano saltaría o repetiría números.
  if new.siguiente <> old.siguiente and current_user = 'authenticated' then
    raise exception 'FISCAL_CORRELATIVO_AUTOMATICO: el correlativo lo avanza el sistema al emitir';
  end if;
  if old.siguiente > old.desde
     and (new.cai, new.desde, new.hasta, new.establecimiento, new.punto_emision, new.tipo_doc, new.clase, new.tenant_id, new.sucursal_id)
         is distinct from
         (old.cai, old.desde, old.hasta, old.establecimiento, old.punto_emision, old.tipo_doc, old.clase, old.tenant_id, old.sucursal_id)
  then
    raise exception 'FISCAL_RANGO_EN_USO: el rango ya emitió documentos; solo se pueden cambiar su estado o dispositivo';
  end if;
  return new;
end;
$$;

create trigger trg_cai_rangos_before_write
  before insert or update or delete on public.cai_rangos
  for each row execute function public.fn_cai_rangos_before_write();

-- Marca vencidos/agotados y activa el siguiente pendiente (por desde) en cada
-- punto que se quedó sin rango activo. Interna: no se expone por RPC.
create or replace function public.fn_activar_pendientes(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cai_rangos
     set estado = 'vencido'
   where tenant_id = p_tenant
     and estado in ('activo', 'pendiente')
     and fecha_limite < public.fn_hoy_hn();

  update public.cai_rangos
     set estado = 'agotado'
   where tenant_id = p_tenant
     and estado = 'activo'
     and siguiente > hasta;

  update public.cai_rangos r
     set estado = 'activo'
   where r.id in (
     select distinct on (p.establecimiento, p.punto_emision, p.tipo_doc) p.id
       from public.cai_rangos p
      where p.tenant_id = p_tenant
        and p.estado = 'pendiente'
        and not exists (
          select 1 from public.cai_rangos a
           where a.tenant_id = p.tenant_id
             and a.establecimiento = p.establecimiento
             and a.punto_emision = p.punto_emision
             and a.tipo_doc = p.tipo_doc
             and a.estado = 'activo'
        )
      order by p.establecimiento, p.punto_emision, p.tipo_doc, p.desde
   );
end;
$$;

revoke all on function public.fn_activar_pendientes(uuid) from public;

-- Los dispositivos la llaman antes de bajar sus rangos: aplica vencimientos y
-- la auto-activación del rango pendiente en el servidor.
create or replace function public.refrescar_estados_cai()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_tenant_id() is null then
    return;
  end if;
  perform public.fn_activar_pendientes(public.current_tenant_id());
end;
$$;

revoke all on function public.refrescar_estados_cai() from public;
grant execute on function public.refrescar_estados_cai() to authenticated;

create or replace function public.fn_cai_rangos_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.fn_activar_pendientes(new.tenant_id);
  return null;
end;
$$;

create trigger trg_cai_rangos_after_insert
  after insert on public.cai_rangos
  for each row execute function public.fn_cai_rangos_after_insert();

-- ============================================================================
-- Triggers: documentos_fiscales
-- ============================================================================

-- Validación del servidor al sincronizar. Los mensajes FISCAL_* los traduce
-- sincronizar_documento_fiscal a incidentes.
create or replace function public.fn_documentos_fiscales_validar()
returns trigger
language plpgsql
as $$
declare
  r public.cai_rangos;
begin
  select * into r
    from public.cai_rangos
   where tenant_id = new.tenant_id
     and establecimiento = new.establecimiento
     and punto_emision = new.punto_emision
     and tipo_doc = new.tipo_doc
     and cai = new.cai
     and desde = new.rango_desde
     and hasta = new.rango_hasta;

  if not found then
    raise exception 'FISCAL_RANGO_DESCONOCIDO: no existe un rango con ese CAI/desde/hasta para el punto %-%', new.establecimiento, new.punto_emision;
  end if;

  if new.correlativo < r.desde or new.correlativo > r.hasta then
    raise exception 'FISCAL_FUERA_DE_RANGO: el correlativo % está fuera de %-%', new.correlativo, r.desde, r.hasta;
  end if;

  if (new.fecha_emision at time zone 'America/Tegucigalpa')::date > r.fecha_limite then
    raise exception 'FISCAL_FECHA_VENCIDA: emitido el % con fecha límite %',
      (new.fecha_emision at time zone 'America/Tegucigalpa')::date, r.fecha_limite;
  end if;

  if new.numero_completo <> new.establecimiento || '-' || new.punto_emision || '-' || new.tipo_doc
                            || '-' || lpad(new.correlativo::text, 8, '0') then
    raise exception 'FISCAL_NUMERO_INVALIDO: el número completo no corresponde a establecimiento-punto-tipo-correlativo';
  end if;

  -- El rango del servidor manda sobre lo que diga el cliente
  new.rango_id := r.id;
  new.clase := r.clase;
  new.fecha_limite := r.fecha_limite;
  return new;
end;
$$;

create trigger trg_documentos_fiscales_validar
  before insert on public.documentos_fiscales
  for each row execute function public.fn_documentos_fiscales_validar();

-- Después de insertar: avanza el contador del servidor, marca agotado y
-- activa el siguiente pendiente. Si el dispositivo ya había pasado al rango
-- pendiente (porque el activo se agotó offline), el servidor lo alcanza aquí.
create or replace function public.fn_documentos_fiscales_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.cai_rangos;
begin
  select * into r from public.cai_rangos where id = new.rango_id;

  if r.estado = 'pendiente' then
    update public.cai_rangos
       set estado = 'agotado'
     where tenant_id = r.tenant_id
       and establecimiento = r.establecimiento
       and punto_emision = r.punto_emision
       and tipo_doc = r.tipo_doc
       and estado = 'activo'
       and id <> r.id;
    update public.cai_rangos set estado = 'activo' where id = r.id;
  end if;

  update public.cai_rangos
     set siguiente = greatest(siguiente, new.correlativo + 1)
   where id = r.id;

  perform public.fn_activar_pendientes(r.tenant_id);
  return null;
end;
$$;

create trigger trg_documentos_fiscales_after_insert
  after insert on public.documentos_fiscales
  for each row execute function public.fn_documentos_fiscales_after_insert();

-- Inmutabilidad: nunca DELETE; el único UPDATE es emitida -> anulada
create or replace function public.fn_documentos_fiscales_inmutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'FISCAL_INMUTABLE: los documentos fiscales no se pueden borrar';
  end if;

  if old.estado = 'emitida'
     and new.estado = 'anulada'
     and (to_jsonb(new) - 'estado' - 'anulada_motivo' - 'anulada_at' - 'anulada_por')
         = (to_jsonb(old) - 'estado' - 'anulada_motivo' - 'anulada_at' - 'anulada_por')
  then
    return new;
  end if;

  raise exception 'FISCAL_INMUTABLE: un documento fiscal emitido solo puede pasar a anulada';
end;
$$;

create trigger trg_documentos_fiscales_inmutable
  before update or delete on public.documentos_fiscales
  for each row execute function public.fn_documentos_fiscales_inmutable();

-- ============================================================================
-- RPCs
-- ============================================================================

-- Sincroniza un documento emitido offline. Idempotente (el mismo id dos veces
-- devuelve ok) y, ante un rechazo de negocio, registra un incidente y devuelve
-- {ok:false}: así el incidente queda guardado (no se pierde en un rollback) y
-- la cola offline del dispositivo puede seguir con lo demás.
create or replace function public.sincronizar_documento_fiscal(p_doc jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.documentos_fiscales;
  v_tenant uuid := public.current_tenant_id();
  v_tipo text;
  v_msg text;
begin
  if v_tenant is null then
    raise exception 'FISCAL_SIN_SESION';
  end if;

  d := jsonb_populate_record(null::public.documentos_fiscales, p_doc);

  if d.tenant_id is distinct from v_tenant then
    raise exception 'FISCAL_TENANT_INVALIDO';
  end if;
  if not exists (
    select 1 from public.sucursales s
     where s.id = d.sucursal_id and s.tenant_id = v_tenant
       and (public.is_admin() or s.id = public.current_sucursal_id())
  ) then
    raise exception 'FISCAL_SUCURSAL_INVALIDA';
  end if;

  -- Reintento del mismo documento (la respuesta se perdió): ya está guardado
  if exists (select 1 from public.documentos_fiscales where id = d.id and tenant_id = v_tenant) then
    return jsonb_build_object('ok', true, 'duplicado_idempotente', true);
  end if;

  -- El cliente no puede insertar documentos ya anulados ni con datos del servidor
  d.estado := 'emitida';
  d.anulada_motivo := null;
  d.anulada_at := null;
  d.anulada_por := null;
  d.created_at := now();

  begin
    insert into public.documentos_fiscales select (d).*;
    return jsonb_build_object('ok', true);
  exception
    when unique_violation then
      v_tipo := 'duplicado';
      v_msg := 'Ya existe un documento con ese número o esa orden ya tiene factura vigente: ' || sqlerrm;
    when check_violation then
      v_tipo := 'datos_invalidos';
      v_msg := sqlerrm;
    when raise_exception then
      if sqlerrm not like 'FISCAL_%' then
        raise;
      end if;
      v_tipo := lower(substring(sqlerrm from 'FISCAL_([A-Z_]+)'));
      v_msg := sqlerrm;
  end;

  insert into public.incidentes_fiscales (tenant_id, sucursal_id, dispositivo_id, tipo, detalle, payload)
  values (v_tenant, d.sucursal_id, d.dispositivo_id, v_tipo, v_msg, p_doc);

  return jsonb_build_object('ok', false, 'tipo', v_tipo, 'detalle', v_msg);
end;
$$;

revoke all on function public.sincronizar_documento_fiscal(jsonb) from public;
grant execute on function public.sincronizar_documento_fiscal(jsonb) to authenticated;

-- Máximo correlativo emitido para un punto: un dispositivo reinstalado (o con
-- el IndexedDB borrado) arranca en max(local, servidor) + 1 y nunca reusa.
create or replace function public.max_correlativo_fiscal(
  p_establecimiento text,
  p_punto text,
  p_tipo_doc text
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(correlativo), 0)
    from public.documentos_fiscales
   where tenant_id = public.current_tenant_id()
     and establecimiento = p_establecimiento
     and punto_emision = p_punto
     and tipo_doc = p_tipo_doc
$$;

revoke all on function public.max_correlativo_fiscal(text, text, text) from public;
grant execute on function public.max_correlativo_fiscal(text, text, text) to authenticated;

-- Anular: el documento conserva su número; queda en estado 'anulada' con
-- motivo, fecha y usuario. Solo admin.
create or replace function public.anular_documento_fiscal(p_id uuid, p_motivo text)
returns public.documentos_fiscales
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.documentos_fiscales;
begin
  if not public.is_admin() then
    raise exception 'FISCAL_SOLO_ADMIN: solo un administrador puede anular documentos fiscales';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'FISCAL_MOTIVO_REQUERIDO: indica el motivo de la anulación';
  end if;

  select * into d from public.documentos_fiscales
   where id = p_id and tenant_id = public.current_tenant_id();
  if not found then
    raise exception 'FISCAL_NO_ENCONTRADO';
  end if;
  if d.estado <> 'emitida' then
    raise exception 'FISCAL_YA_ANULADO';
  end if;

  update public.documentos_fiscales
     set estado = 'anulada',
         anulada_motivo = btrim(p_motivo),
         anulada_at = now(),
         anulada_por = auth.uid()
   where id = p_id
   returning * into d;

  return d;
end;
$$;

revoke all on function public.anular_documento_fiscal(uuid, text) from public;
grant execute on function public.anular_documento_fiscal(uuid, text) to authenticated;

-- ============================================================================
-- RLS
--   cai_rangos: admin escribe; cajero/mesero solo leen los de su sucursal.
--   documentos_fiscales: SOLO lectura desde el cliente (admin todo el tenant,
--   cajero su sucursal); toda escritura pasa por las RPCs de arriba.
--   incidentes_fiscales: solo el admin lee/marca resuelto; los inserta la RPC.
-- ============================================================================
alter table public.cai_rangos enable row level security;
alter table public.documentos_fiscales enable row level security;
alter table public.incidentes_fiscales enable row level security;

create policy cai_rangos_select on public.cai_rangos
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

create policy cai_rangos_write on public.cai_rangos
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

create policy documentos_fiscales_select on public.documentos_fiscales
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (public.is_admin() or sucursal_id = public.current_sucursal_id())
  );

revoke insert, update, delete on public.documentos_fiscales from authenticated;

create policy incidentes_fiscales_select on public.incidentes_fiscales
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin());

create policy incidentes_fiscales_update on public.incidentes_fiscales
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_admin());

revoke insert, delete on public.incidentes_fiscales from authenticated;
