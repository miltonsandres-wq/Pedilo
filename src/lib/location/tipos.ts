/**
 * Contrato del módulo de ubicación. El resto de la app (rastreo del repartidor,
 * PWA) solo conoce esta interfaz: hoy la implementa `WebGeolocation` (primer
 * plano, navegador); más adelante un plugin de Capacitor para segundo plano
 * puede implementarla sin tocar nada más.
 */

export interface Lectura {
  lat: number;
  lng: number;
  /** Radio de incertidumbre en metros; null si el dispositivo no lo informa. */
  precisionM: number | null;
  /** m/s; null si no se conoce. */
  velocidad: number | null;
  /** ms desde epoch en que se tomó la lectura. */
  t: number;
}

export type TipoErrorUbicacion =
  | "permiso_denegado" // la persona no dio permiso, o lo revocó después
  | "gps_apagado" // el dispositivo no puede obtener posición (GPS/ubicación apagados)
  | "sin_senal" // se agotó el tiempo esperando una lectura
  | "no_soportado";

export interface ErrorUbicacion {
  tipo: TipoErrorUbicacion;
  mensaje: string;
}

export type EstadoPermiso = "concedido" | "denegado" | "por_preguntar" | "desconocido";

export interface CallbacksUbicacion {
  onLectura(lectura: Lectura): void;
  onError(error: ErrorUbicacion): void;
}

export interface ProveedorUbicacion {
  /** ¿Este dispositivo/navegador puede dar ubicación? */
  soportado(): boolean;
  /** Estado del permiso SIN pedirlo (no muestra ningún diálogo). */
  permiso(): Promise<EstadoPermiso>;
  /** Empieza a vigilar la posición con alta precisión. Pide el permiso si falta. */
  iniciar(callbacks: CallbacksUbicacion): void;
  /** Deja de vigilar (apaga el GPS). Seguro llamarlo varias veces. */
  detener(): void;
  /** ¿Está vigilando ahora? */
  activo(): boolean;
}
