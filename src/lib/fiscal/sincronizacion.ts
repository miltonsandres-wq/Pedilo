import { createClient } from "@/lib/supabase/client";
import { db, type DocumentoFiscalLocal, type RangoCaiLocal } from "@/lib/offline/db";
import {
  CLAVE_CONFIG_FISCAL,
  leerConfigFiscal,
  type ConfigFiscalLocal,
  type DispositivoLocal,
  type EmisorSnapshot,
} from "./emision";
import { fusionarRango } from "./rangos";

const CLAVE_TOKEN = "dispositivo_token";
const LS_TOKEN = "pedilo_dispositivo_token";
const DIAS_DOCUMENTOS_LOCALES = 7;

/**
 * Pide al navegador que NO desaloje IndexedDB bajo presión de espacio: ahí vive
 * el correlativo. Perderlo no causaría reuso (se recupera del servidor), pero sí
 * obligaría a re-sincronizar antes de poder facturar offline.
 */
export async function solicitarAlmacenamientoPersistente() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* no soportado: seguimos igual */
  }
}

/**
 * Identidad secreta de ESTE navegador para vincularse a un punto de emisión.
 * Se guarda en localStorage Y en Dexie: si se borra solo uno, se recupera del otro.
 */
export async function obtenerTokenDispositivo(): Promise<string> {
  let token: string | null = null;
  try {
    token = localStorage.getItem(LS_TOKEN);
  } catch {
    /* modo privado, etc. */
  }
  if (!token) token = ((await db.config.get(CLAVE_TOKEN))?.valor as string | undefined) ?? null;
  if (!token) token = crypto.randomUUID();
  try {
    localStorage.setItem(LS_TOKEN, token);
  } catch {
    /* ignorar */
  }
  await db.config.put({ clave: CLAVE_TOKEN, valor: token });
  return token;
}

/** Vincula esta caja a un dispositivo libre del catálogo y lo guarda en la config local. */
export async function vincularDispositivoLocal(dispositivoId: string): Promise<DispositivoLocal> {
  const supabase = createClient();
  const token = await obtenerTokenDispositivo();
  const { data, error } = await supabase.rpc("vincular_dispositivo", { p_id: dispositivoId, p_token: token });

  if (error || !data) {
    const msg = error?.message ?? "";
    if (msg.includes("YA_VINCULADO")) {
      throw new Error("Ese punto de emisión ya está vinculado a otra caja. Pídele al administrador que lo libere.");
    }
    if (msg.includes("NO_DISPONIBLE")) throw new Error("Ese dispositivo ya no está disponible.");
    throw new Error(msg || "No se pudo vincular la caja. Revisa tu conexión.");
  }

  const dispositivo: DispositivoLocal = {
    id: data.id,
    nombre: data.nombre,
    sucursal_id: data.sucursal_id,
    establecimiento: data.establecimiento,
    punto_emision: data.punto_emision,
  };
  // Guarda el dispositivo y de una vez baja config/emisor/rangos (si esta era la
  // primera vez que la caja sincronizaba, aún no existía la config fiscal).
  const previa = await leerConfigFiscal();
  const config: ConfigFiscalLocal = {
    activa: previa?.activa ?? false,
    tenantId: data.tenant_id,
    emisor: previa?.emisor ?? null,
    dispositivo,
  };
  await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: config });
  await sincronizarFiscal(data.sucursal_id, data.tenant_id);
  return dispositivo;
}

/**
 * Baja la configuración fiscal (activa?, emisor, logo, dispositivo), los rangos
 * del punto de emisión de esta caja y los documentos de los últimos días.
 * Sin red no hace nada: el POS sigue con lo cacheado.
 */
export async function sincronizarFiscal(sucursalId: string, tenantId: string) {
  const supabase = createClient();

  const [{ data: tenant }, { data: emisores }, { data: sucursal }] = await Promise.all([
    supabase.from("tenants").select("facturacion_fiscal_activa, logo_url").eq("id", tenantId).single(),
    supabase.from("datos_fiscales_emisor").select("*").eq("tenant_id", tenantId),
    supabase.from("sucursales").select("logo_url").eq("id", sucursalId).single(),
  ]);
  if (!tenant) return;

  const previa = await leerConfigFiscal();
  const base = (emisores ?? []).find((e) => e.sucursal_id === null);
  const propio = (emisores ?? []).find((e) => e.sucursal_id === sucursalId);
  const campo = <K extends "razon_social" | "nombre_comercial" | "rtn" | "direccion_fiscal" | "telefono" | "correo">(k: K) =>
    propio?.[k] ?? base?.[k] ?? null;

  const emisor: EmisorSnapshot | null =
    base || propio
      ? {
          razon_social: campo("razon_social"),
          nombre_comercial: campo("nombre_comercial"),
          rtn: campo("rtn"),
          direccion_fiscal: campo("direccion_fiscal"),
          telefono: campo("telefono"),
          correo: campo("correo"),
          // El logo de la sucursal manda; si no tiene, el del negocio
          logo_url: sucursal?.logo_url ?? tenant.logo_url ?? null,
        }
      : null;

  // ¿Sigue vigente el dispositivo vinculado? Si el admin lo desactivó o lo
  // "liberó" (vinculo_hash = null), esta caja debe volver a vincularse.
  let dispositivo = previa?.dispositivo ?? null;
  if (dispositivo) {
    const { data: fila, error } = await supabase
      .from("dispositivos_pos")
      .select("*")
      .eq("id", dispositivo.id)
      .maybeSingle();
    if (!error) {
      dispositivo =
        fila && fila.activo && fila.vinculo_hash
          ? {
              id: fila.id,
              nombre: fila.nombre,
              sucursal_id: fila.sucursal_id,
              establecimiento: fila.establecimiento,
              punto_emision: fila.punto_emision,
            }
          : null;
    }
  }

  const config: ConfigFiscalLocal = {
    activa: tenant.facturacion_fiscal_activa,
    tenantId,
    emisor,
    dispositivo,
  };
  await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: config });

  if (config.activa && dispositivo) await sincronizarRangos(dispositivo);
  await bajarDocumentosRecientes(sucursalId);
}

/**
 * Trae los rangos del punto de emisión y los mezcla con la copia local sin
 * bajar nunca el correlativo: siguiente = max(local, servidor, máx. emitido + 1).
 */
export async function sincronizarRangos(dispositivo: DispositivoLocal) {
  const supabase = createClient();

  await supabase.rpc("refrescar_estados_cai");

  const { data: remotos, error } = await supabase
    .from("cai_rangos")
    .select("*")
    .eq("sucursal_id", dispositivo.sucursal_id)
    .eq("establecimiento", dispositivo.establecimiento)
    .eq("punto_emision", dispositivo.punto_emision);
  if (error || !remotos) return;

  const maxPorTipo = new Map<string, number>();
  for (const tipo of new Set(remotos.map((r) => r.tipo_doc))) {
    const { data: max, error: errMax } = await supabase.rpc("max_correlativo_fiscal", {
      p_establecimiento: dispositivo.establecimiento,
      p_punto: dispositivo.punto_emision,
      p_tipo_doc: tipo,
    });
    // Sin este dato no podemos garantizar que no se reuse un número: mejor no tocar nada
    if (errMax || max == null) return;
    maxPorTipo.set(tipo, max);
  }

  await db.transaction("rw", db.rangos_cai, async () => {
    for (const remoto of remotos) {
      const local = await db.rangos_cai.get(remoto.id);
      const { created_at: _c, ...sinFecha } = remoto;
      void _c;
      const fusion = fusionarRango<RangoCaiLocal>(local, sinFecha, maxPorTipo.get(remoto.tipo_doc) ?? 0);
      await db.rangos_cai.put(fusion);
    }

    // Rango que el admin borró en el servidor y que este dispositivo nunca usó
    const idsRemotos = new Set(remotos.map((r) => r.id));
    for (const local of await db.rangos_cai.toArray()) {
      const delPunto =
        local.establecimiento === dispositivo.establecimiento && local.punto_emision === dispositivo.punto_emision;
      if (delPunto && !idsRemotos.has(local.id) && local.siguiente === local.desde) {
        await db.rangos_cai.delete(local.id);
      }
    }
  });
}

/** Documentos de la sucursal de los últimos días, para poder reimprimir desde cualquier caja. */
async function bajarDocumentosRecientes(sucursalId: string) {
  const supabase = createClient();
  const desde = new Date(Date.now() - DIAS_DOCUMENTOS_LOCALES * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("documentos_fiscales")
    .select("*")
    .eq("sucursal_id", sucursalId)
    .gte("fecha_emision", desde)
    .order("fecha_emision", { ascending: false })
    .limit(300);
  if (error || !data) return;

  await db.transaction("rw", db.documentos_fiscales, async () => {
    for (const d of data) {
      const existente = await db.documentos_fiscales.get(d.id);
      // Lo que esta caja aún no sincroniza o marcó en conflicto NO se pisa
      if (existente && existente.sync_estado !== "sincronizado") continue;
      const fila: DocumentoFiscalLocal = { ...d, sync_estado: "sincronizado", sync_detalle: null };
      await db.documentos_fiscales.put(fila);
    }
  });
}
