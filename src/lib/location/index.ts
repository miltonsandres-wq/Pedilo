/**
 * Punto de entrada del módulo de ubicación. Para pasar a segundo plano con
 * Capacitor: crear una clase que implemente `ProveedorUbicacion` y devolverla
 * desde `crearProveedorUbicacion()`; el rastreo del repartidor no cambia.
 */
export * from "./tipos";
export * from "./geo";
export * from "./muestreo";
export { crearWakeLock } from "./wakeLock";
import { WebGeolocation } from "./webGeolocation";
import type { ProveedorUbicacion } from "./tipos";

export function crearProveedorUbicacion(): ProveedorUbicacion {
  return new WebGeolocation();
}
