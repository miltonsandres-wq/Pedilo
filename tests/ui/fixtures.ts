import { db, type OrdenItemLocal, type OrdenLocal, type RangoCaiLocal } from "@/lib/offline/db";
import { CLAVE_CONFIG_FISCAL, type ConfigFiscalLocal } from "@/lib/fiscal/emision";

export const EMISOR = {
  razon_social: "Inversiones Rosa S. de R.L.",
  nombre_comercial: "Taquería Rosa",
  rtn: "08019999123456",
  direccion_fiscal: "Col. Palmira, Tegucigalpa",
  telefono: "2222-3333",
  correo: null,
  logo_url: null,
};

export function configFiscal(over: Partial<ConfigFiscalLocal> = {}): ConfigFiscalLocal {
  return {
    activa: true,
    tenantId: "T1",
    emisor: EMISOR,
    logoUrl: null,
    dispositivo: { id: "D1", nombre: "Caja 1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001" },
    ...over,
  };
}

export function rangoCai(over: Partial<RangoCaiLocal> = {}): RangoCaiLocal {
  return {
    id: "R1", tenant_id: "T1", sucursal_id: "S1", establecimiento: "001", punto_emision: "001", tipo_doc: "01",
    clase: "factura", cai: "A1B2C3-D4E5F6-A1B2C3-D4E5F6-A1B2C3-D4", desde: 1, hasta: 100, siguiente: 1,
    fecha_limite: "2099-12-31", estado: "activo", dispositivo_id: "D1", ...over,
  };
}

export async function sembrarFiscal(cfg: ConfigFiscalLocal | null, rangos: RangoCaiLocal[] = [rangoCai()]) {
  if (cfg) await db.config.put({ clave: CLAVE_CONFIG_FISCAL, valor: cfg });
  await db.rangos_cai.bulkPut(rangos);
}

/** Orden enviada con un solo ítem (2 × L. 115 = L. 230). */
export async function sembrarOrden(items: Partial<OrdenItemLocal>[] = [{ nombre_producto: "Tacos", cantidad: 2, precio_unitario: 115, tasa_isv: "15" }]) {
  const total = items.reduce((a, i) => a + (i.cantidad ?? 1) * (i.precio_unitario ?? 0), 0);
  const orden: OrdenLocal = {
    id: "O1", sucursal_id: "S1", mesa_id: "M1", usuario_id: "U1", estado: "enviada", total, cliente_nombre: null,
    personas: null, numero_dia: 1, lista_cocina: false, created_at: new Date().toISOString(), enviada_at: null,
    pagada_at: null, cancelada_at: null, motivo_cancelacion: null,
  };
  await db.ordenes.add(orden);
  await db.mesas.add({ id: "M1", sucursal_id: "S1", nombre: "Mesa 1", capacidad: 4, zona: null, pos_x: null, pos_y: null, estado: "ocupada", activa: true });
  for (const [k, i] of items.entries()) {
    await db.orden_items.add({
      id: `O1-I${k}`, orden_id: "O1", producto_id: "P1", nombre_producto: "X", cantidad: 1, precio_unitario: 0,
      nota: null, impreso: true, origen_cliente: false, created_at: new Date().toISOString(), ...i,
    });
  }
  return { ordenId: "O1", mesaId: "M1", total };
}

export async function limpiarDb() {
  await Promise.all(db.tables.map((t) => t.clear()));
}
