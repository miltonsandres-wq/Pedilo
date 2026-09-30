/**
 * Qué le falta a un negocio antes de poder activar la facturación fiscal.
 * Activarla pasa el cobro a modo ESTRICTO (sin CAI vigente no se cobra), así
 * que solo se permite cuando cada sucursal activa ya puede facturar.
 */

export interface SucursalReq {
  id: string;
  nombre: string;
}

export interface EmisorReq {
  sucursal_id: string | null;
  razon_social: string | null;
  rtn: string | null;
  direccion_fiscal: string | null;
}

export interface RangoReq {
  sucursal_id: string;
  clase: string;
  estado: string;
  siguiente: number;
  hasta: number;
  fecha_limite: string;
}

export interface RequisitoFiscal {
  clave: string;
  cumple: boolean;
  texto: string;
}

export function calcularRequisitos(
  datos: { sucursales: SucursalReq[]; emisores: EmisorReq[]; rangos: RangoReq[] },
  hoyHN: string
): RequisitoFiscal[] {
  const requisitos: RequisitoFiscal[] = [];
  const base = datos.emisores.find((e) => e.sucursal_id === null);

  if (datos.sucursales.length === 0) {
    return [{ clave: "sucursales", cumple: false, texto: "Crea al menos una sucursal." }];
  }

  for (const s of datos.sucursales) {
    const propio = datos.emisores.find((e) => e.sucursal_id === s.id);
    // El override hereda campo por campo del emisor del negocio
    const razon = propio?.razon_social ?? base?.razon_social;
    const rtn = propio?.rtn ?? base?.rtn;
    const direccion = propio?.direccion_fiscal ?? base?.direccion_fiscal;
    const faltan = [!razon && "razón social", !rtn && "RTN", !direccion && "dirección fiscal"].filter(Boolean);
    requisitos.push({
      clave: `emisor-${s.id}`,
      cumple: faltan.length === 0,
      texto:
        faltan.length === 0
          ? `${s.nombre}: datos fiscales del emisor completos.`
          : `${s.nombre}: faltan datos fiscales del emisor (${faltan.join(", ")}).`,
    });

    const tieneCai = datos.rangos.some(
      (r) =>
        r.sucursal_id === s.id &&
        r.clase === "factura" &&
        (r.estado === "activo" || r.estado === "pendiente") &&
        r.siguiente <= r.hasta &&
        r.fecha_limite >= hoyHN
    );
    requisitos.push({
      clave: `cai-${s.id}`,
      cumple: tieneCai,
      texto: tieneCai ? `${s.nombre}: tiene un CAI vigente para facturas.` : `${s.nombre}: carga un CAI vigente para facturas.`,
    });
  }
  return requisitos;
}
