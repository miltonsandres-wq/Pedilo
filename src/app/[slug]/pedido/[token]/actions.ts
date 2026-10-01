"use server";

import { cargarSeguimiento } from "@/lib/delivery/seguimientoServidor";
import type { Seguimiento } from "@/lib/delivery/seguimiento";

/** Refresco del seguimiento (por aviso de Realtime o cada pocos segundos). */
export async function obtenerSeguimiento(slug: string, token: string): Promise<Seguimiento | null> {
  return cargarSeguimiento(slug, token);
}
