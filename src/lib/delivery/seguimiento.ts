import { distanciaM, etaMinutos, esPuntoValido, type Punto } from "@/lib/location/geo";

/** Lo que devuelve la RPC seguimiento_pedido (ver migración 0024). */
export interface Seguimiento {
  orden_id: string;
  slug: string | null;
  numero: number | null;
  sucursal: string;
  estado: EstadoDelivery;
  recibido_at: string | null;
  aceptado_at: string | null;
  en_cocina_at: string | null;
  listo_at: string | null;
  en_camino_at: string | null;
  llegado_at: string | null;
  entregado_at: string | null;
  cancelado_at: string | null;
  motivo: string | null;
  destino: Punto | null;
  direccion_referencia: string;
  zona: string | null;
  subtotal: number;
  envio: number;
  total: number;
  metodo_pago: string;
  repartidor: { nombre: string; telefono: string | null } | null;
  factura: { id: string; numero: string } | null;
  tiempo_estimado_min: number;
  velocidad_kmh: number;
  items: { nombre: string; cantidad: number; precio: number }[];
}

export type EstadoDelivery =
  | "recibido" | "aceptado" | "en_cocina" | "listo" | "en_camino" | "entregado" | "rechazado" | "cancelado";

export const ETIQUETA_ESTADO: Record<EstadoDelivery, string> = {
  recibido: "Recibido",
  aceptado: "Aceptado",
  en_cocina: "En preparación",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

const FLUJO: EstadoDelivery[] = ["recibido", "aceptado", "en_cocina", "listo", "en_camino", "entregado"];

const DESCRIPCION_PASO: Record<string, string> = {
  recibido: "Pedido recibido",
  aceptado: "El restaurante aceptó tu pedido",
  en_cocina: "Preparando tu comida",
  listo: "Tu pedido está listo",
  en_camino: "Tu pedido va en camino",
  entregado: "Pedido entregado",
};

export interface PasoLinea {
  estado: EstadoDelivery;
  titulo: string;
  hora: string | null;
  situacion: "hecho" | "actual" | "pendiente";
}

/** Línea de tiempo del pedido. Rechazado/cancelado no tienen línea (se muestran aparte). */
export function construirLinea(s: Pick<Seguimiento, "estado" | "recibido_at" | "aceptado_at" | "en_cocina_at" | "listo_at" | "en_camino_at" | "entregado_at">): PasoLinea[] {
  if (s.estado === "rechazado" || s.estado === "cancelado") return [];
  const horas: Record<string, string | null> = {
    recibido: s.recibido_at, aceptado: s.aceptado_at, en_cocina: s.en_cocina_at,
    listo: s.listo_at, en_camino: s.en_camino_at, entregado: s.entregado_at,
  };
  const actual = FLUJO.indexOf(s.estado);
  return FLUJO.map((estado, i) => ({
    estado,
    titulo: DESCRIPCION_PASO[estado],
    hora: horas[estado],
    // el último paso ya cumplido no queda "en curso"
    situacion: i < actual || (i === actual && estado === "entregado") ? "hecho" : i === actual ? "actual" : "pendiente",
  }));
}

/** Privacidad: la ubicación del repartidor SOLO se muestra mientras el pedido va en camino. */
export const puedeVerUbicacionRepartidor = (estado: EstadoDelivery) => estado === "en_camino";

export const esFinal = (estado: EstadoDelivery) => estado === "entregado" || estado === "rechazado" || estado === "cancelado";

/** Canal de Realtime broadcast del pedido; su nombre secreto es el token. */
export const canalPedido = (token: string) => `pedido:${token}`;
/** Canal PRIVADO de la flota de una sucursal (ver migración 0029). */
export const canalFlota = (sucursalId: string) => `flota:${sucursalId}`;

export interface PosicionRepartidor extends Punto {
  /** ms desde epoch en que se tomó la lectura */
  t: number;
  velocidad?: number | null;
}

export interface EtaInfo {
  distanciaM: number;
  minutos: number;
}

export function calcularEta(pos: Punto | null, destino: Punto | null, velocidadKmh: number): EtaInfo | null {
  if (!esPuntoValido(pos) || !esPuntoValido(destino)) return null;
  const d = distanciaM(pos, destino);
  return { distanciaM: d, minutos: etaMinutos(d, velocidadKmh) };
}

/** Una posición vieja ya no es "en vivo": pasados 3 minutos se avisa que se perdió la señal. */
export const POSICION_VIGENTE_MS = 3 * 60_000;
export const posicionVigente = (pos: PosicionRepartidor | null, ahora = Date.now()) =>
  !!pos && ahora - pos.t <= POSICION_VIGENTE_MS;

/** Link para escribirle por WhatsApp (teléfono hondureño de 8 dígitos). */
export const linkWhatsappTelefono = (telefono: string, mensaje?: string) => {
  const d = telefono.replace(/\D/g, "");
  const num = d.length === 8 ? `504${d}` : d;
  return `https://wa.me/${num}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
};
