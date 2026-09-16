import type { Comanda, ResultadoImpresion } from "./types";

/**
 * Interfaz desacoplada de impresión. El navegador NUNCA habla directo con la
 * impresora térmica: le manda la comanda (JSON) a esta función, y ella decide
 * cómo hacerla llegar al servicio agente de la sucursal (Node/n8n) que sí
 * está en la misma red que la impresora y dispara los comandos ESC/POS.
 *
 * Cambiar de implementación (otro protocolo, cola en vez de HTTP directo,
 * proveedor de impresión en la nube, etc.) es tocar solo este archivo.
 */
export interface ServicioImpresion {
  enviarComanda(comanda: Comanda, agenteUrl: string): Promise<ResultadoImpresion>;
}

/**
 * Implementación por defecto: POST HTTP al agente de la sucursal
 * (`sucursales.agente_impresion_url`). El agente vive en la red local del
 * restaurante; para que la app (en la nube, vía Coolify) pueda alcanzarlo sin
 * abrir puertos en el router, se recomienda exponerlo con un túnel saliente
 * (ej. Cloudflare Tunnel) hacia un subdominio propio — ver print-agent/README.md.
 */
class HttpServicioImpresion implements ServicioImpresion {
  async enviarComanda(comanda: Comanda, agenteUrl: string): Promise<ResultadoImpresion> {
    try {
      const res = await fetch(agenteUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(comanda),
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        return { ok: false, error: `Agente respondió ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
    }
  }
}

export const servicioImpresion: ServicioImpresion = new HttpServicioImpresion();
