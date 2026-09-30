"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fechaLocalHN } from "@/lib/fiscal/formato";
import { cargarRangoCai, guardarDatosEmisor } from "@/lib/fiscal/configurar";
import { validarEmisor, validarEntradaRango, type EntradaEmisor, type RangoValidado } from "@/lib/fiscal/validaciones";

export interface DatosAsistente {
  sucursales: { id: string; nombre: string; telefono: string; direccion: string }[];
  /** ¿Factura con CAI del SAR? Si es false no se toca nada fiscal. */
  factura: boolean;
  emisor?: EntradaEmisor;
  /** Un CAI por sucursal (puede faltar alguna). */
  rangos?: { sucursalId: string; cai: string; desde: string; hasta: string; fechaLimite: string }[];
}

export interface ResultadoAsistente {
  ok: boolean;
  error?: string;
  /** La facturación quedó activada (todas las sucursales tenían su CAI). */
  activada?: boolean;
  aviso?: string;
}

/**
 * Guarda de una vez lo que el dueño llenó en la configuración inicial: datos de
 * cada sucursal y, si factura con CAI, los datos fiscales y su rango. Valida
 * TODO antes de escribir nada. La facturación solo se activa si cada sucursal
 * quedó con su CAI (activarla a medias bloquearía el cobro en la que falte).
 */
export async function finalizarConfiguracion(datos: DatosAsistente): Promise<ResultadoAsistente> {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  const hoy = fechaLocalHN(new Date());

  const { data: propias } = await supabase
    .from("sucursales")
    .select("id")
    .eq("tenant_id", sesion.tenant_id)
    .eq("activo", true);
  const ids = new Set((propias ?? []).map((s) => s.id));

  const sucursales = datos.sucursales.filter((s) => ids.has(s.id));
  if (sucursales.length === 0 || sucursales.some((s) => !s.nombre.trim())) {
    return { ok: false, error: "Cada sucursal necesita un nombre." };
  }

  // --- validar todo lo fiscal ANTES de escribir ---
  let emisorValido: ReturnType<typeof validarEmisor>["valor"];
  const rangosValidos: RangoValidado[] = [];
  if (datos.factura) {
    if (!datos.emisor) return { ok: false, error: "Faltan los datos fiscales del negocio." };
    const ve = validarEmisor(datos.emisor);
    if (!ve.ok) return { ok: false, error: `Datos fiscales: ${Object.values(ve.errores)[0]}` };
    emisorValido = ve.valor;

    for (const r of datos.rangos ?? []) {
      if (!ids.has(r.sucursalId)) continue;
      const vacio = !r.cai.trim() && !r.desde.trim() && !r.hasta.trim() && !r.fechaLimite.trim();
      if (vacio) continue;
      const vr = validarEntradaRango(
        { clase: "factura", tipoDoc: "01", cai: r.cai, desde: r.desde, hasta: r.hasta, fechaLimite: r.fechaLimite, sucursalId: r.sucursalId },
        hoy
      );
      if (!vr.ok || !vr.valor) return { ok: false, error: `CAI: ${Object.values(vr.errores)[0]}` };
      rangosValidos.push(vr.valor);
    }
    if (rangosValidos.length === 0) {
      return { ok: false, error: "Carga el CAI de al menos una sucursal, o elige «No facturo con CAI»." };
    }
  }

  // --- escribir ---
  for (const s of sucursales) {
    const { error } = await supabase
      .from("sucursales")
      .update({ nombre: s.nombre.trim(), telefono: s.telefono.trim() || null, direccion: s.direccion.trim() || null })
      .eq("id", s.id);
    if (error) return { ok: false, error: "No se pudieron guardar los datos de las sucursales." };
  }

  let activada = false;
  let aviso: string | undefined;

  if (datos.factura && emisorValido) {
    const fila = {
      razon_social: emisorValido.razonSocial,
      nombre_comercial: emisorValido.nombreComercial,
      rtn: emisorValido.rtn,
      direccion_fiscal: emisorValido.direccionFiscal,
      telefono: emisorValido.telefono,
      correo: emisorValido.correo,
    };
    const e = await guardarDatosEmisor(supabase, sesion.tenant_id, null, fila);
    if (!e.ok) return { ok: false, error: e.error };

    for (const v of rangosValidos) {
      const r = await cargarRangoCai(supabase, sesion.tenant_id, v);
      if (!r.ok) return { ok: false, error: r.error };
    }

    const conCai = new Set(rangosValidos.map((v) => v.sucursalId));
    const faltan = sucursales.filter((s) => !conCai.has(s.id));
    if (faltan.length === 0) {
      await supabase.from("tenants").update({ facturacion_fiscal_activa: true }).eq("id", sesion.tenant_id);
      activada = true;
    } else {
      aviso = `Falta el CAI de ${faltan.map((s) => s.nombre).join(", ")}. Cárgalo en Facturación fiscal y actívala cuando esté completo.`;
    }
  }

  await supabase
    .from("tenants")
    .update({ configuracion_inicial_at: new Date().toISOString() })
    .eq("id", sesion.tenant_id);

  revalidatePath("/admin", "layout");
  return { ok: true, activada, aviso };
}

/** «Configurar después»: el dueño lo hará desde el panel cuando quiera. */
export async function omitirConfiguracion(): Promise<void> {
  const sesion = await requireAdmin();
  const supabase = await createClient();
  await supabase
    .from("tenants")
    .update({ configuracion_inicial_at: new Date().toISOString() })
    .eq("id", sesion.tenant_id);
  revalidatePath("/admin", "layout");
  redirect("/admin");
}
