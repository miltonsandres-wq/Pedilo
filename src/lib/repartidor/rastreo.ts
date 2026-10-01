import {
  crearDetectorLlegada, crearMuestreoRastro, crearThrottle, THROTTLE_POR_DEFECTO,
  type CallbacksUbicacion, type ErrorUbicacion, type Lectura, type ProveedorUbicacion,
} from "@/lib/location";
import type { BaseRepartidor, EventoRastro, PedidoRep } from "./db";
import { guardarPuntoRastro } from "./sync";

/**
 * Orquesta el GPS de primer plano del repartidor. Reglas (ver tarea, sección 6):
 *  - el GPS (alta precisión) está ENCENDIDO solo mientras haya al menos un pedido
 *    en camino; al entregar el último se apaga, y fuera de eso no se rastrea nada;
 *  - la posición en vivo se publica por Realtime broadcast (cada ~12 s o ~50 m, lo
 *    primero) — NO se escribe en la base en cada lectura;
 *  - a la base solo va ~1 punto por minuto + salida / llegada / entrega, guardados
 *    primero en la base local para subirlos al volver la señal;
 *  - lecturas con precisión peor a ~100 m se descartan;
 *  - llegada automática al entrar al radio del pin del cliente;
 *  - permiso revocado, GPS apagado y app en segundo plano se detectan y se avisan.
 */

export type EstadoRastreo = "inactivo" | "activo" | "sin_permiso" | "gps_apagado" | "sin_senal" | "no_soportado";

export interface PedidoEnCamino {
  ordenId: string;
  token: string;
}

/** Salida hacia Realtime (la implementación real está en canales.ts). */
export interface CanalesRastreo {
  publicarPosicion(msg: { lectura: Lectura; pedidos: PedidoEnCamino[] }): void;
  publicarEstado(estado: EstadoRastreo, segundoPlano: boolean): void;
  cerrar(): void;
}

export interface DepsRastreo {
  proveedor: ProveedorUbicacion;
  base: BaseRepartidor;
  canales: CanalesRastreo;
  repartidorId: string;
  radioLlegadaM: number;
  /** Se llama UNA vez cuando se detecta la llegada al pin del cliente. */
  alLlegar(ordenId: string, lectura: Lectura): void | Promise<void>;
  alCambiarEstado?(estado: EstadoRastreo): void;
  wakeLock?: { activar(): Promise<boolean>; liberar(): Promise<void> };
  ahora?: () => number;
}

export class ControladorRastreo {
  private enCamino: PedidoRep[] = [];
  private estado: EstadoRastreo = "inactivo";
  private ultima: Lectura | null = null;
  private segundoPlano = false;
  /** La persona no quiso compartir su ubicación: se trabaja sin GPS y el restaurante lo ve marcado. */
  private deshabilitado = false;
  private readonly throttle = crearThrottle(THROTTLE_POR_DEFECTO);
  private readonly muestreo = crearMuestreoRastro();
  private readonly detectores = new Map<string, ReturnType<typeof crearDetectorLlegada>>();
  private readonly callbacks: CallbacksUbicacion;
  /** Eventos que ocurrieron antes de la primera lectura (ej. "salí": el GPS recién se enciende). */
  private pendientes: { evento: Exclude<EventoRastro, "muestra">; ordenId: string }[] = [];

  constructor(private readonly deps: DepsRastreo) {
    this.callbacks = {
      onLectura: (l) => void this.procesarLectura(l),
      onError: (e) => this.procesarError(e),
    };
  }

  get estadoActual() {
    return this.estado;
  }
  get ultimaLectura() {
    return this.ultima;
  }
  get rastreando() {
    return this.enCamino.length > 0;
  }

  /** Trabajar SIN rastreo (la persona no dio permiso). El GPS no se enciende; el restaurante ve "sin ubicación". */
  setDeshabilitado(valor: boolean) {
    this.deshabilitado = valor;
    if (valor && this.rastreando) {
      this.deps.proveedor.detener();
      this.cambiarEstado("sin_permiso");
    }
  }

  /** Se llama cada vez que cambia la lista de pedidos: enciende o apaga el GPS según haya alguno en camino. */
  actualizarPedidos(pedidos: PedidoRep[]) {
    const nuevos = pedidos.filter((p) => p.estado_delivery === "en_camino");
    const habia = this.enCamino.length > 0;
    this.enCamino = nuevos;

    for (const id of [...this.detectores.keys()]) {
      if (!nuevos.some((p) => p.orden_id === id)) this.detectores.delete(id);
    }

    if (nuevos.length > 0 && !habia) this.encender();
    else if (nuevos.length === 0 && habia) this.apagar();
  }

  /** Guarda un punto de evento (salida / llegada / entrega) con la última posición conocida. */
  async registrarEvento(evento: Exclude<EventoRastro, "muestra">, ordenId: string) {
    const l = this.ultima;
    if (!l) {
      // La salida se guarda con la primera lectura que llegue; la entrega sin posición simplemente no tiene punto
      if (evento !== "entrega") this.pendientes.push({ evento, ordenId });
      return;
    }
    await this.guardarEvento(evento, ordenId, l);
  }

  private async guardarEvento(evento: Exclude<EventoRastro, "muestra">, ordenId: string, l: Lectura) {
    await guardarPuntoRastro(this.deps.base, {
      orden_id: ordenId, repartidor_id: this.deps.repartidorId, lat: l.lat, lng: l.lng,
      precision_m: l.precisionM, velocidad: l.velocidad, evento, registrado_at: new Date(l.t).toISOString(),
    });
  }

  /** Al volver la app al frente: reanuda el GPS si el sistema lo cortó y manda la última posición YA. */
  alVolverAlFrente() {
    this.segundoPlano = false;
    if (!this.rastreando) return;
    if (this.estado === "activo" || this.estado === "sin_senal") {
      if (!this.deps.proveedor.activo()) this.deps.proveedor.iniciar(this.callbacks);
    }
    this.throttle.reiniciar();
    void this.deps.wakeLock?.activar();
    if (this.ultima) this.deps.canales.publicarPosicion({ lectura: this.ultima, pedidos: this.pedidosPublicos() });
    this.deps.canales.publicarEstado(this.estado, false);
  }

  alIrASegundoPlano() {
    this.segundoPlano = true;
    if (this.rastreando) this.deps.canales.publicarEstado(this.estado, true);
  }

  /** Apaga todo (cerrar sesión / liquidar). */
  detener() {
    this.enCamino = [];
    this.apagar();
  }

  /** Reintenta pedir la ubicación (después de que la persona dio el permiso en los ajustes). */
  reintentar() {
    if (!this.rastreando) return;
    this.deps.proveedor.detener();
    this.cambiarEstado("activo");
    this.deps.proveedor.iniciar(this.callbacks);
  }

  // --- internos ---------------------------------------------------------------

  private pedidosPublicos(): PedidoEnCamino[] {
    return this.enCamino.map((p) => ({ ordenId: p.orden_id, token: p.tracking_token }));
  }

  private encender() {
    this.throttle.reiniciar();
    this.muestreo.reiniciar();
    if (this.deshabilitado) {
      this.cambiarEstado("sin_permiso");
      return;
    }
    this.cambiarEstado("activo");
    void this.deps.wakeLock?.activar();
    this.deps.proveedor.iniciar(this.callbacks);
  }

  private apagar() {
    this.deps.proveedor.detener();
    void this.deps.wakeLock?.liberar();
    this.detectores.clear();
    this.pendientes = [];
    this.ultima = null;
    this.deps.canales.cerrar();
    this.cambiarEstado("inactivo");
  }

  private cambiarEstado(e: EstadoRastreo) {
    if (this.estado === e) return;
    this.estado = e;
    this.deps.alCambiarEstado?.(e);
    if (e !== "inactivo") this.deps.canales.publicarEstado(e, this.segundoPlano);
  }

  private procesarError(e: ErrorUbicacion) {
    if (!this.rastreando) return;
    if (e.tipo === "permiso_denegado") {
      this.deps.proveedor.detener();
      this.cambiarEstado("sin_permiso");
    } else if (e.tipo === "gps_apagado") this.cambiarEstado("gps_apagado");
    else if (e.tipo === "no_soportado") this.cambiarEstado("no_soportado");
    else this.cambiarEstado("sin_senal");
  }

  private async procesarLectura(l: Lectura) {
    if (!this.rastreando) return;
    if (this.estado !== "activo") this.cambiarEstado("activo"); // volvió la señal / el permiso

    const decision = this.throttle.evaluar(l);
    if (decision === "descartar_precision") return; // posición poco fiable: ni se muestra ni se guarda
    this.ultima = l;

    if (this.pendientes.length > 0) {
      const lista = this.pendientes;
      this.pendientes = [];
      for (const e of lista) await this.guardarEvento(e.evento, e.ordenId, l);
    }

    if (decision === "publicar") {
      this.deps.canales.publicarPosicion({ lectura: l, pedidos: this.pedidosPublicos() });
    }

    if (this.muestreo.tocaMuestrear(l.t)) {
      for (const p of this.enCamino) {
        await guardarPuntoRastro(this.deps.base, {
          orden_id: p.orden_id, repartidor_id: this.deps.repartidorId, lat: l.lat, lng: l.lng,
          precision_m: l.precisionM, velocidad: l.velocidad, evento: "muestra", registrado_at: new Date(l.t).toISOString(),
        });
      }
    }

    for (const p of this.enCamino) {
      if (p.llegado_at || p.destino_lat == null || p.destino_lng == null) continue;
      let detector = this.detectores.get(p.orden_id);
      if (!detector) {
        detector = crearDetectorLlegada(this.deps.radioLlegadaM);
        this.detectores.set(p.orden_id, detector);
      }
      if (detector.actualizar(l, { lat: p.destino_lat, lng: p.destino_lng })) {
        await this.deps.alLlegar(p.orden_id, l);
      }
    }
  }
}
