import { diasEntre } from "./formato";

/** Umbrales de alerta pedidos por el SAR/negocio: 85 % consumido o 30 días para vencer. */
export const UMBRAL_CONSUMO = 0.85;
export const UMBRAL_DIAS = 30;

export interface RangoParaResumen {
  desde: number;
  hasta: number;
  siguiente: number;
  fecha_limite: string;
  estado: string;
}

export type NivelAlerta = "ok" | "consumo" | "vencimiento" | "agotado" | "vencido";

export interface ResumenRango {
  total: number;
  usados: number;
  restantes: number;
  pctConsumido: number; // 0..1
  diasParaVencer: number; // negativo = ya venció
  nivel: NivelAlerta;
}

/** hoyHN: fecha local de Honduras (YYYY-MM-DD), ver fechaLocalHN(). */
export function resumirRango(r: RangoParaResumen, hoyHN: string): ResumenRango {
  const total = r.hasta - r.desde + 1;
  const usados = Math.min(total, Math.max(0, r.siguiente - r.desde));
  const restantes = total - usados;
  const pctConsumido = total === 0 ? 1 : usados / total;
  const diasParaVencer = diasEntre(hoyHN, r.fecha_limite.slice(0, 10));

  let nivel: NivelAlerta = "ok";
  if (r.estado === "agotado" || restantes === 0) nivel = "agotado";
  else if (r.estado === "vencido" || diasParaVencer < 0) nivel = "vencido";
  else if (pctConsumido >= UMBRAL_CONSUMO) nivel = "consumo";
  else if (diasParaVencer <= UMBRAL_DIAS) nivel = "vencimiento";

  return { total, usados, restantes, pctConsumido, diasParaVencer, nivel };
}

export const MENSAJES_ALERTA: Record<Exclude<NivelAlerta, "ok">, string> = {
  consumo: "Se consumió más del 85 % del rango de facturas: tramita el siguiente CAI.",
  vencimiento: "Faltan 30 días o menos para la fecha límite de emisión del CAI.",
  agotado: "El rango de facturas se agotó: no se puede facturar hasta cargar un nuevo CAI.",
  vencido: "El CAI venció: no se puede facturar hasta cargar uno vigente.",
};

export interface RangoParaAlerta extends RangoParaResumen {
  id: string;
  sucursal_id: string;
  establecimiento: string;
  punto_emision: string;
  tipo_doc: string;
  clase: string;
}

export interface AlertaPunto {
  clave: string;
  sucursal_id: string;
  establecimiento: string;
  punto_emision: string;
  tipo_doc: string;
  clase: string;
  nivel: NivelAlerta;
  /** Resumen del rango activo (o del último, si ya no hay activo). */
  resumen: ResumenRango;
  rangoId: string;
  /** Ya hay un rango pendiente vigente que tomará el relevo. */
  hayRelevo: boolean;
}

/**
 * Estado de cada (sucursal, punto de emisión, tipo de documento). Si el rango
 * activo se agotó/venció pero hay uno pendiente vigente, el punto sigue
 * funcionando (el relevo se activa solo) y no genera alerta de bloqueo.
 */
export function alertasPorPunto(rangos: RangoParaAlerta[], hoyHN: string): AlertaPunto[] {
  const grupos = new Map<string, RangoParaAlerta[]>();
  for (const r of rangos) {
    const clave = `${r.sucursal_id}|${r.establecimiento}|${r.punto_emision}|${r.tipo_doc}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
  }

  const salida: AlertaPunto[] = [];
  for (const [clave, lista] of grupos) {
    const utilizable = (r: RangoParaAlerta) => {
      const x = resumirRango(r, hoyHN);
      return (r.estado === "activo" || r.estado === "pendiente") && x.nivel !== "agotado" && x.nivel !== "vencido";
    };
    const activo = lista.find((r) => r.estado === "activo" && utilizable(r));
    const relevos = lista.filter((r) => r.estado === "pendiente" && utilizable(r));
    const ultimo = [...lista].sort((a, b) => b.hasta - a.hasta)[0];
    const base = activo ?? (relevos.length ? [...relevos].sort((a, b) => a.desde - b.desde)[0] : ultimo);

    const resumen = resumirRango(base, hoyHN);
    let nivel = resumen.nivel;
    // Sin activo pero con relevo vigente: se activará solo, no hay bloqueo
    if (!activo && relevos.length && (nivel === "ok" || nivel === "consumo" || nivel === "vencimiento")) nivel = "ok";

    salida.push({
      clave,
      sucursal_id: base.sucursal_id,
      establecimiento: base.establecimiento,
      punto_emision: base.punto_emision,
      tipo_doc: base.tipo_doc,
      clase: base.clase,
      nivel,
      resumen,
      rangoId: base.id,
      hayRelevo: !!activo && relevos.some((r) => r.desde > activo.hasta),
    });
  }
  return salida;
}
