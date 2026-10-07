"use client";

import type { TicketArmado } from "@/lib/fiscal/impresion";
import { servicioImpresion } from "./enviarComanda";
import { ANCHO_80MM } from "./documentoTexto";
import { capacidadesImpresion, imprimirConModo } from "./transportes";
import { guardarModoPreferido, leerAnchoPapel, leerModoPreferido } from "./preferencias";
import type { ResultadoImpresion } from "./types";

/**
 * Manda un ticket a imprimir SIN pantallas intermedias: a la impresora de la
 * sucursal si hay agente; si no, por la última forma que usó este dispositivo
 * (si todavía está disponible) o el diálogo de impresión del sistema. Si falla
 * (impresora apagada, permiso de Bluetooth que pide un toque…) devuelve el
 * error para que quien llama ofrezca el botón «Imprimir» a mano.
 */
export async function imprimirDirecto(ticket: TicketArmado, agenteUrl: string | null): Promise<ResultadoImpresion> {
  if (agenteUrl) {
    return servicioImpresion.enviarImpresion(
      { instrucciones: ticket.construir(ANCHO_80MM), logoPngBase64: ticket.logoPngBase64 },
      agenteUrl
    );
  }
  const cap = capacidadesImpresion();
  const preferido = leerModoPreferido();
  const modo = preferido && cap[preferido] ? preferido : "navegador";
  const columnas = leerAnchoPapel();
  const r = await imprimirConModo(modo, ticket.construir(columnas), columnas);
  if (r.ok) guardarModoPreferido(modo);
  return r;
}
