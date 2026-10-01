import type { CallbacksUbicacion, EstadoPermiso, ProveedorUbicacion } from "./tipos";

/**
 * Implementación de primer plano con la Geolocation API del navegador. Solo
 * funciona con la pantalla encendida y la app abierta (la PWA no puede rastrear
 * en segundo plano): para eso habrá otra implementación de ProveedorUbicacion.
 */
export class WebGeolocation implements ProveedorUbicacion {
  private watchId: number | null = null;
  private estadoPermiso: PermissionStatus | null = null;
  private alCambiarPermiso: (() => void) | null = null;

  soportado() {
    return typeof navigator !== "undefined" && "geolocation" in navigator;
  }

  async permiso(): Promise<EstadoPermiso> {
    try {
      if (!navigator.permissions?.query) return "desconocido";
      const r = await navigator.permissions.query({ name: "geolocation" as PermissionName });
      return r.state === "granted" ? "concedido" : r.state === "denied" ? "denegado" : "por_preguntar";
    } catch {
      return "desconocido"; // Safari antiguo: no sabemos hasta pedirlo
    }
  }

  iniciar(cb: CallbacksUbicacion) {
    if (this.watchId != null) return;
    if (!this.soportado()) {
      cb.onError({ tipo: "no_soportado", mensaje: "Este teléfono no permite obtener la ubicación." });
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (p) =>
        cb.onLectura({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precisionM: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          velocidad: p.coords.speed != null && Number.isFinite(p.coords.speed) ? p.coords.speed : null,
          t: p.timestamp || Date.now(),
        }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          cb.onError({ tipo: "permiso_denegado", mensaje: "Se negó o se quitó el permiso de ubicación." });
        } else if (e.code === e.POSITION_UNAVAILABLE) {
          cb.onError({ tipo: "gps_apagado", mensaje: "No se puede obtener la ubicación. Activa el GPS del teléfono." });
        } else {
          cb.onError({ tipo: "sin_senal", mensaje: "Buscando señal de GPS…" });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 }
    );

    // Si lo revocan desde los ajustes con la app abierta, se entera al instante
    void navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((estado) => {
        this.estadoPermiso = estado;
        this.alCambiarPermiso = () => {
          if (estado.state === "denied") {
            cb.onError({ tipo: "permiso_denegado", mensaje: "Se quitó el permiso de ubicación." });
          }
        };
        estado.addEventListener("change", this.alCambiarPermiso);
      })
      .catch(() => undefined);
  }

  detener() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.estadoPermiso && this.alCambiarPermiso) {
      this.estadoPermiso.removeEventListener("change", this.alCambiarPermiso);
    }
    this.estadoPermiso = null;
    this.alCambiarPermiso = null;
  }

  activo() {
    return this.watchId != null;
  }
}
