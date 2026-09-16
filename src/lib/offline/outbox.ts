import { createClient } from "@/lib/supabase/client";
import { servicioImpresion } from "@/lib/printing/enviarComanda";
import type { Comanda } from "@/lib/printing/types";
import { db, type OutboxOperacion, type OutboxTabla } from "./db";

let flushing = false;

/** Encola una escritura pendiente y de inmediato intenta enviarla si hay red. */
export async function encolar(
  tabla: OutboxTabla,
  operacion: OutboxOperacion,
  registro_id: string,
  payload: Record<string, unknown>
) {
  await db.outbox.add({
    id: crypto.randomUUID(),
    tabla,
    operacion,
    registro_id,
    payload,
    creado_en: new Date().toISOString(),
    intentos: 0,
    ultimo_error: null,
  });
  void flushOutbox();
}

/**
 * Encola el envío de una comanda a cocina. Se procesa en la MISMA cola y en
 * el mismo orden que las demás escrituras: si el agente de impresión no
 * responde (sin red, o apagado), la fila se queda pendiente y NO se marcan
 * `impreso = true` los ítems que van justo después en la cola — así nunca se
 * pierde una comanda por marcarla impresa antes de tiempo.
 */
export async function encolarComanda(comanda: Comanda, agenteUrl: string) {
  await db.outbox.add({
    id: crypto.randomUUID(),
    tabla: "comandas",
    operacion: "insert",
    registro_id: comanda.ordenId,
    payload: { comanda, agenteUrl } as unknown as Record<string, unknown>,
    creado_en: new Date().toISOString(),
    intentos: 0,
    ultimo_error: null,
  });
  void flushOutbox();
}

/**
 * Procesa la cola en orden (FIFO) y la envía a Supabase. Si un envío falla
 * (sin red, o error real), se detiene ahí para no desordenar escrituras que
 * dependen unas de otras (ej. un item de una orden que aún no llegó) y lo
 * reintenta en la siguiente pasada.
 */
export async function flushOutbox() {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  flushing = true;
  try {
    const supabase = createClient();
    const pendientes = await db.outbox.orderBy("creado_en").toArray();

    for (const entry of pendientes) {
      const { tabla, operacion, registro_id, payload } = entry;

      if (tabla === "comandas") {
        const { comanda, agenteUrl } = payload as unknown as {
          comanda: Comanda;
          agenteUrl: string;
        };
        const resultado = await servicioImpresion.enviarComanda(comanda, agenteUrl);
        if (!resultado.ok) {
          await db.outbox.update(entry.id, {
            intentos: entry.intentos + 1,
            ultimo_error: resultado.error ?? "no se pudo imprimir",
          });
          break;
        }
        await db.outbox.delete(entry.id);
        continue;
      }

      const query =
        operacion === "insert"
          ? supabase.from(tabla).insert(payload as never)
          : operacion === "update"
            ? supabase.from(tabla).update(payload as never).eq("id", registro_id)
            : supabase.from(tabla).delete().eq("id", registro_id);

      const { error } = await query;

      if (error) {
        // Error de red -> reintentar después sin tocar la cola.
        // Error de validación/RLS -> lo dejamos marcado para revisión manual
        // en vez de perder la operación silenciosamente.
        await db.outbox.update(entry.id, {
          intentos: entry.intentos + 1,
          ultimo_error: error.message,
        });
        break;
      }

      await db.outbox.delete(entry.id);
    }
  } finally {
    flushing = false;
  }
}

export function cantidadPendiente(): Promise<number> {
  return db.outbox.count();
}
